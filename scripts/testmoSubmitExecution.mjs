import {
    buildTestmoRunCompleteArgs,
    buildTestmoRunCreateArgs,
    buildTestmoSubmitThreadArgs,
} from './testmoParallelSubmit.mjs';

export const MOCK_PARALLEL_THREAD_RUN_ID = 87654321;

export function submissionDestinationKey() {
    return 'https://vananaz-qa.testmo.net|6|frontend';
}

function parseTestmoRunId(stdout, stderr) {
    const combined = `${stdout}\n${stderr}`;
    const lines = combined
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    for (const line of lines) {
        if (/^\d+$/.test(line)) {
            return Number(line);
        }
    }
    const match = combined.match(/(?:run\s*(?:id)?|automation run)[:\s#]*(\d+)/i);
    return match ? Number(match[1]) : null;
}

export function findInProgressSubmission(state, payloadSha256, destination = submissionDestinationKey()) {
    return (state.inProgressSubmissions ?? []).find(
        (entry) =>
            entry.payloadSha256 === payloadSha256 &&
            (entry.destination ?? submissionDestinationKey()) === destination
    );
}

export function upsertInProgressSubmission(state, entry) {
    if (!state.inProgressSubmissions) {
        state.inProgressSubmissions = [];
    }
    const destination = entry.destination ?? submissionDestinationKey();
    const idx = state.inProgressSubmissions.findIndex(
        (e) =>
            e.payloadSha256 === entry.payloadSha256 &&
            (e.destination ?? submissionDestinationKey()) === destination
    );
    if (idx >= 0) {
        state.inProgressSubmissions[idx] = { ...state.inProgressSubmissions[idx], ...entry };
    } else {
        state.inProgressSubmissions.push(entry);
    }
}

export function removeInProgressSubmission(state, payloadSha256, destination = submissionDestinationKey()) {
    state.inProgressSubmissions = (state.inProgressSubmissions ?? []).filter(
        (e) =>
            !(
                e.payloadSha256 === payloadSha256 &&
                (e.destination ?? submissionDestinationKey()) === destination
            )
    );
}

/**
 * Parallel TestMo upload: create run → submit-thread Part 1 → submit-thread Part 2 → complete --no-measure-elapsed.
 */
export function executeParallelTestmoSubmission(ctx) {
    const {
        state,
        statePath,
        payloadSha256,
        destination,
        baseResultsSha256,
        runName,
        tags,
        threadArtifacts,
        timingSummary,
        mockSubmit,
        runCli,
        saveState,
        now,
        backupPath,
        submitXmlPath,
    } = ctx;

    const invoke = (args) => {
        if (!runCli) {
            throw new Error('executeParallelTestmoSubmission requires runCli for live submissions.');
        }
        return runCli(args);
    };

    let progress = findInProgressSubmission(state, payloadSha256, destination) ?? {
        payloadSha256,
        destination,
        baseResultsSha256,
        runName,
        submissionPlan: 'parallel-threads',
        testmoRunId: null,
        threads: { part1: false, part2: false },
        completed: false,
        recordedAt: now.toISOString(),
        threadArtifacts: {
            part1Path: threadArtifacts.part1Path,
            part2Path: threadArtifacts.part2Path,
        },
    };

    let runId = progress.testmoRunId;

    if (!runId) {
        if (mockSubmit) {
            runId = MOCK_PARALLEL_THREAD_RUN_ID;
        } else {
            const createArgs = buildTestmoRunCreateArgs(runName, tags, threadArtifacts.runResourcesPath);
            const created = invoke(createArgs);
            if (created.exitCode !== 0) {
                upsertInProgressSubmission(state, {
                    ...progress,
                    lastError: 'create_failed',
                    exitCode: created.exitCode,
                    stderrSnippet: (created.stderr || created.stdout).slice(0, 500),
                });
                saveState(state, statePath);
                throw new Error(
                    `Testmo automation:run:create failed (exit ${created.exitCode}). Progress saved for resume.`
                );
            }
            runId = parseTestmoRunId(created.stdout, created.stderr);
            if (!runId) {
                upsertInProgressSubmission(state, { ...progress, lastError: 'create_missing_run_id' });
                saveState(state, statePath);
                throw new Error(
                    'Testmo create succeeded but no run ID was detected. Progress saved for resume.'
                );
            }
        }
        progress = { ...progress, testmoRunId: runId };
        upsertInProgressSubmission(state, progress);
        saveState(state, statePath);
    }

    if (!progress.threads.part1) {
        const args = buildTestmoSubmitThreadArgs(runId, threadArtifacts.part1Path, {
            runResourcesPath: threadArtifacts.runResourcesPath,
            threadResourcesPath: threadArtifacts.part1ThreadResourcesPath,
        });
        const submitted = mockSubmit ? { exitCode: 0, stdout: '', stderr: '' } : invoke(args);
        if (submitted.exitCode !== 0) {
            upsertInProgressSubmission(state, {
                ...progress,
                threads: { ...progress.threads, part1: false },
                lastError: 'submit_thread_part1',
                exitCode: submitted.exitCode,
            });
            saveState(state, statePath);
            throw new Error(
                `Testmo submit-thread Part 1 failed (exit ${submitted.exitCode}). Run ${runId} saved for resume.`
            );
        }
        progress = { ...progress, threads: { ...progress.threads, part1: true } };
        upsertInProgressSubmission(state, progress);
        saveState(state, statePath);
    }

    if (!progress.threads.part2) {
        const args = buildTestmoSubmitThreadArgs(runId, threadArtifacts.part2Path, {
            threadResourcesPath: threadArtifacts.part2ThreadResourcesPath,
        });
        const submitted = mockSubmit ? { exitCode: 0, stdout: '', stderr: '' } : invoke(args);
        if (submitted.exitCode !== 0) {
            upsertInProgressSubmission(state, {
                ...progress,
                threads: { ...progress.threads, part2: false },
                lastError: 'submit_thread_part2',
                exitCode: submitted.exitCode,
            });
            saveState(state, statePath);
            throw new Error(
                `Testmo submit-thread Part 2 failed (exit ${submitted.exitCode}). Run ${runId} saved for resume.`
            );
        }
        progress = { ...progress, threads: { ...progress.threads, part2: true } };
        upsertInProgressSubmission(state, progress);
        saveState(state, statePath);
    }

    if (!progress.completed) {
        const completeArgs = buildTestmoRunCompleteArgs(runId, { noMeasureElapsed: true });
        const completed = mockSubmit ? { exitCode: 0, stdout: '', stderr: '' } : invoke(completeArgs);
        if (completed.exitCode !== 0) {
            upsertInProgressSubmission(state, {
                ...progress,
                lastError: 'complete_failed',
                exitCode: completed.exitCode,
            });
            saveState(state, statePath);
            throw new Error(
                `Testmo automation:run:complete failed (exit ${completed.exitCode}). Run ${runId} saved for resume.`
            );
        }
        progress = { ...progress, completed: true };
    }

    removeInProgressSubmission(state, payloadSha256, destination);

    if (mockSubmit) {
        if (!state.mockSubmissions) {
            state.mockSubmissions = [];
        }
        state.mockSubmissions.push({
            mock: true,
            payloadSha256,
            destination,
            baseResultsSha256,
            recordedAt: now.toISOString(),
            runName,
            backupPath,
            testmoSubmitXml: submitXmlPath,
            submissionPlan: 'parallel-threads',
            testmoRunId: runId,
            timingSummary,
            threadArtifacts: progress.threadArtifacts,
            outgoingThreadElapsed: threadArtifacts.outgoingThreadElapsed,
        });
        saveState(state, statePath);
        return { mock: true, runId, runName, submissionPlan: 'parallel-threads', timingSummary };
    }

    state.submissions.push({
        payloadSha256,
        destination,
        baseResultsSha256,
        sha256: baseResultsSha256,
        testmoRunId: runId,
        submittedAt: now.toISOString(),
        runName,
        backupPath,
        testmoSubmitXml: submitXmlPath,
        submissionPlan: 'parallel-threads',
        timingSummary,
        intendedTestmoRunDurationSeconds: timingSummary.intendedTestmoRunDurationSeconds,
    });
    saveState(state, statePath);

    return { runId, runName, submissionPlan: 'parallel-threads', timingSummary };
}