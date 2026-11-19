import fs from 'node:fs';
import path from 'node:path';
import { PART1_FEATURE_CLASSNAME } from './part1TestmoConstants.mjs';
import { PART2_FEATURE_CLASSNAME } from './part2TestmoConstants.mjs';
import { parseTestsuitesRoot, splitTopLevelTestsuites, recomputeJUnitCounts } from './junitCounts.mjs';
import { validateTestmoSubmitXml } from './buildTestmoSubmitJUnit.mjs';
import {
    EXECUTION_MODE_PARALLEL,
    formatTimingPreviewForConsole,
    sumFeatureTimesBySuite,
} from './testmoSmokeRunTiming.mjs';
import {
    TESTMO_THREAD_ELAPSED_MECHANISM,
    applyMeasuredThreadElapsedToJUnitXml,
    buildOutgoingThreadElapsedReport,
    sumFeatureTestcaseTimesSeconds,
    testmoCollectElapsedMicrosecondsFromJUnit,
} from './testmoJUnitElapsed.mjs';

const TESTMO_INSTANCE = 'https://vananaz-qa.testmo.net';
const TESTMO_PROJECT_ID = '6';
const TESTMO_SOURCE = 'frontend';

export function splitSubmitXmlByPart(submitXml) {
    const root = parseTestsuitesRoot(submitXml.trim());
    if (!root) {
        throw new Error('Submit JUnit missing root <testsuites>.');
    }
    const suites = splitTopLevelTestsuites(root.inner);
    const part1Suites = suites.filter((s) => new RegExp(`name="${PART1_FEATURE_CLASSNAME.replace(/\./g, '\\.')}"`).test(s));
    const part2Suites = suites.filter((s) => new RegExp(`name="${PART2_FEATURE_CLASSNAME.replace(/\./g, '\\.')}"`).test(s));
    if (part1Suites.length !== 1 || part2Suites.length !== 1) {
        throw new Error(
            `Expected one Part 1 and one Part 2 feature suite; got part1=${part1Suites.length} part2=${part2Suites.length}.`
        );
    }
    const wrap = (body) =>
        recomputeJUnitCounts(
            `<testsuites tests="0" failures="0" skipped="0" errors="0" time="0">\n${body}\n</testsuites>`
        );
    return {
        part1Xml: wrap(part1Suites[0]),
        part2Xml: wrap(part2Suites[0]),
    };
}

export function writeThreadSubmitArtifacts({ submitXmlPath, timingSummary, submitDir = null }) {
    const submitXml = fs.readFileSync(submitXmlPath, 'utf8');
    validateTestmoSubmitXml(submitXml);
    const { part1Xml: part1Raw, part2Xml: part2Raw } = splitSubmitXmlByPart(submitXml);
    const part1Measured = timingSummary.partMeasuredDurationSeconds.part1;
    const part2Measured = timingSummary.partMeasuredDurationSeconds.part2;
    if (part1Measured === null || part2Measured === null) {
        throw new Error('Missing measured Part 1/2 aggregate durations for thread elapsed JUnit overlay.');
    }
    const part1Xml = applyMeasuredThreadElapsedToJUnitXml(part1Raw, part1Measured);
    const part2Xml = applyMeasuredThreadElapsedToJUnitXml(part2Raw, part2Measured);
    validateTestmoSubmitXml(part1Xml);
    validateTestmoSubmitXml(part2Xml);
    const part1Features = validateTestmoSubmitXml(part1Xml);
    const part2Features = validateTestmoSubmitXml(part2Xml);
    const dir = submitDir ?? path.dirname(submitXmlPath);
    const part1Path = path.join(dir, 'results-testmo-submit-part1.xml');
    const part2Path = path.join(dir, 'results-testmo-submit-part2.xml');
    fs.writeFileSync(part1Path, part1Xml, 'utf8');
    fs.writeFileSync(part2Path, part2Xml, 'utf8');

    const runResourcesPath = path.join(dir, 'testmo-run-resources.json');
    const part1ThreadResourcesPath = path.join(dir, 'testmo-thread-part1-resources.json');
    const part2ThreadResourcesPath = path.join(dir, 'testmo-thread-part2-resources.json');

    const featureSums = sumFeatureTimesBySuite(submitXml);
    fs.writeFileSync(
        runResourcesPath,
        `${JSON.stringify(buildRunResourcesDocument(timingSummary), null, 2)}\n`,
        'utf8'
    );
    fs.writeFileSync(
        part1ThreadResourcesPath,
        `${JSON.stringify(
            buildThreadResourcesDocument({
                part: 1,
                timingSummary,
                featureSumSeconds: featureSums.part1,
            }),
            null,
            2
        )}\n`,
        'utf8'
    );
    fs.writeFileSync(
        part2ThreadResourcesPath,
        `${JSON.stringify(
            buildThreadResourcesDocument({
                part: 2,
                timingSummary,
                featureSumSeconds: featureSums.part2,
            }),
            null,
            2
        )}\n`,
        'utf8'
    );

    const outgoingThreadElapsed = buildOutgoingThreadElapsedReport({
        part1Xml,
        part2Xml,
        timingSummary,
    });

    return {
        part1Path,
        part2Path,
        runResourcesPath,
        part1ThreadResourcesPath,
        part2ThreadResourcesPath,
        part1FeatureCount: part1Features.part1FeatureCount,
        part2FeatureCount: part2Features.part2FeatureCount,
        outgoingThreadElapsed,
        part1FeatureTestcaseSumSeconds: sumFeatureTestcaseTimesSeconds(part1Xml),
        part2FeatureTestcaseSumSeconds: sumFeatureTestcaseTimesSeconds(part2Xml),
        part1TestmoElapsedComputedMicroseconds: testmoCollectElapsedMicrosecondsFromJUnit(part1Xml),
        part2TestmoElapsedComputedMicroseconds: testmoCollectElapsedMicrosecondsFromJUnit(part2Xml),
    };
}

function buildRunResourcesDocument(timingSummary) {
    const fields = [
        fieldString('smoke_execution_mode', timingSummary.executionMode),
        fieldString('smoke_wall_clock_label', timingSummary.wallClock.label),
        fieldString(
            'smoke_wall_clock_duration_seconds',
            timingSummary.wallClock.durationSeconds !== null
                ? String(timingSummary.wallClock.durationSeconds)
                : 'unknown'
        ),
        fieldString('smoke_wall_clock_source', timingSummary.wallClock.source),
        fieldString(
            'smoke_feature_duration_sum_seconds',
            String(timingSummary.featureDurationSumSeconds.total)
        ),
        fieldString(
            'smoke_intended_testmo_run_duration_seconds',
            String(timingSummary.intendedTestmoRunDurationSeconds)
        ),
        fieldString('smoke_intended_testmo_run_duration_reason', timingSummary.intendedTestmoRunDurationReason),
        fieldString('testmo_thread_elapsed_mechanism', TESTMO_THREAD_ELAPSED_MECHANISM),
        fieldString(
            'smoke_longest_part_measured_duration_seconds',
            timingSummary.parallelLongestPartSeconds !== null
                ? String(timingSummary.parallelLongestPartSeconds)
                : 'n/a'
        ),
        fieldString(
            'smoke_part1_measured_duration_seconds',
            timingSummary.partMeasuredDurationSeconds.part1 !== null
                ? String(timingSummary.partMeasuredDurationSeconds.part1)
                : 'unknown'
        ),
        fieldString(
            'smoke_part2_measured_duration_seconds',
            timingSummary.partMeasuredDurationSeconds.part2 !== null
                ? String(timingSummary.partMeasuredDurationSeconds.part2)
                : 'unknown'
        ),
    ];
    if (timingSummary.wallClock.startedAt) {
        fields.push(fieldString('smoke_wall_clock_started_at', timingSummary.wallClock.startedAt));
    }
    if (timingSummary.wallClock.smokeRunId) {
        fields.push(fieldString('smoke_run_id', timingSummary.wallClock.smokeRunId));
    }
    return { fields };
}

function buildThreadResourcesDocument({ part, timingSummary, featureSumSeconds }) {
    const measured =
        part === 1
            ? timingSummary.partMeasuredDurationSeconds.part1
            : timingSummary.partMeasuredDurationSeconds.part2;
    return {
        fields: [
            fieldString('smoke_part', String(part)),
            fieldString(
                'smoke_part_measured_duration_seconds',
                measured !== null ? String(measured) : 'unknown'
            ),
            fieldString('smoke_part_feature_duration_sum_seconds', String(featureSumSeconds)),
            fieldString(
                'smoke_part_note',
                'Display-only metadata; thread elapsed is set via JUnit testsuites @time (see testmo_thread_elapsed_mechanism on run).'
            ),
            fieldString('testmo_thread_elapsed_mechanism', TESTMO_THREAD_ELAPSED_MECHANISM),
        ],
    };
}

function fieldString(name, value) {
    return { type: 'string', name, value };
}

export function buildTestmoRunCreateArgs(runName, tags = [], resourcesPath = null) {
    const args = [
        'automation:run:create',
        '--instance',
        TESTMO_INSTANCE,
        '--project-id',
        TESTMO_PROJECT_ID,
        '--name',
        runName,
        '--source',
        TESTMO_SOURCE,
    ];
    if (tags.length > 0) {
        args.push('--tags', ...tags);
    }
    if (resourcesPath) {
        args.push('--resources', resourcesPath);
    }
    return args;
}

export function buildTestmoSubmitThreadArgs(runId, resultsPath, options = {}) {
    const args = [
        'automation:run:submit-thread',
        '--instance',
        TESTMO_INSTANCE,
        '--run-id',
        String(runId),
        '--results',
        resultsPath,
    ];
    if (options.runResourcesPath) {
        args.push('--run-resources', options.runResourcesPath);
    }
    if (options.threadResourcesPath) {
        args.push('--thread-resources', options.threadResourcesPath);
    }
    return args;
}

export function buildTestmoRunCompleteArgs(runId, options = {}) {
    const args = ['automation:run:complete', '--instance', TESTMO_INSTANCE, '--run-id', String(runId)];
    if (options.noMeasureElapsed !== false) {
        args.push('--no-measure-elapsed');
    }
    if (options.resourcesPath) {
        args.push('--resources', options.resourcesPath);
    }
    return args;
}

export function buildParallelSubmissionPlan({
    runName,
    tags,
    artifacts,
    timingSummary,
}) {
    const preview = formatTimingPreviewForConsole(timingSummary);
    return {
        submissionPlan: 'parallel-threads',
        executionMode: EXECUTION_MODE_PARALLEL,
        runName,
        tags,
        timingPreview: preview,
        timingSummary,
        cli: {
            create: {
                command: 'testmo',
                args: buildTestmoRunCreateArgs(runName, tags, artifacts.runResourcesPath),
            },
            submitPart1: {
                command: 'testmo',
                args: buildTestmoSubmitThreadArgs('<run-id>', artifacts.part1Path, {
                    runResourcesPath: artifacts.runResourcesPath,
                    threadResourcesPath: artifacts.part1ThreadResourcesPath,
                }),
            },
            submitPart2: {
                command: 'testmo',
                args: buildTestmoSubmitThreadArgs('<run-id>', artifacts.part2Path, {
                    threadResourcesPath: artifacts.part2ThreadResourcesPath,
                }),
            },
            complete: {
                command: 'testmo',
                args: buildTestmoRunCompleteArgs('<run-id>', { noMeasureElapsed: true }),
            },
        },
        threadArtifacts: {
            part1Results: artifacts.part1Path,
            part2Results: artifacts.part2Path,
            runResources: artifacts.runResourcesPath,
            part1ThreadResources: artifacts.part1ThreadResourcesPath,
            part2ThreadResources: artifacts.part2ThreadResourcesPath,
        },
        outgoingThreadElapsed: artifacts.outgoingThreadElapsed,
        note: 'Replace <run-id> with automation:run:create output. Thread elapsed_computed = JUnit testsuites @time (seconds). Run elapsed = max(threads) with --no-measure-elapsed.',
    };
}

export { buildOutgoingThreadElapsedReport, TESTMO_THREAD_ELAPSED_MECHANISM };
