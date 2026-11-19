import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildTestmoSubmitJUnit, validateTestmoSubmitXml } from './buildTestmoSubmitJUnit.mjs';

function enrichFromCombined(combinedXml, dir) {
    const combinedPath = path.join(dir, 'results.xml');
    fs.writeFileSync(combinedPath, combinedXml, 'utf8');
    return buildTestmoSubmitJUnit(combinedXml, {
        repoRoot: dir,
        resultsDir: dir,
        part2SourcePath: combinedPath,
    });
}
import { splitSubmitXmlByPart, writeThreadSubmitArtifacts } from './testmoParallelSubmit.mjs';
import { computeSmokeTimingSummary } from './testmoSmokeRunTiming.mjs';
import {
    executeParallelTestmoSubmission,
    findInProgressSubmission,
    MOCK_PARALLEL_THREAD_RUN_ID,
} from './testmoSubmitExecution.mjs';
import { sha256Hex } from './submitSmokeResults.mjs';

const PARALLEL_COMBINED = `<testsuites tests="2" time="100">
<testsuite name="e2e/fullE2ESmokePart1.spec.ts" timestamp="2026-11-18T10:52:31.364Z" hostname="chromium" tests="1" time="60">
<testcase name="fullE2ESmokePart1" classname="e2e/fullE2ESmokePart1.spec.ts" time="60"><system-out><![CDATA[PART1_TESTMO_COVERAGE {"schemaVersion":2,"smokePart":1,"cases":[{"key":"firstLogin","automationKey":"part1-smoke-first-login","title":"First Login","status":"Passed","outcomeDetail":"ok","durationSeconds":5}]}]]></system-out></testcase>
</testsuite>
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" timestamp="2026-11-18T10:52:31.364Z" hostname="chromium" tests="1" time="40">
<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="40"><system-out><![CDATA[PART2_RUN_STARTED {"smokePart":2}
PART2_RUN_COMPLETED {"featureOutcomes":{"login":"passed"}}
PART2_TESTMO_COVERAGE {"schemaVersion":2,"smokePart":2,"cases":[{"key":"login","automationKey":"part2-smoke-login","title":"Login","status":"Passed","outcomeDetail":"ok","durationSeconds":7}]}]]></system-out></testcase>
</testsuite>
</testsuites>`;

test('splitSubmitXmlByPart preserves feature times and counts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'split-part-'));
    const built = enrichFromCombined(PARALLEL_COMBINED, dir);
    const { part1Xml, part2Xml } = splitSubmitXmlByPart(built.xml);
    const full = validateTestmoSubmitXml(built.xml);
    const p1 = validateTestmoSubmitXml(part1Xml);
    const p2 = validateTestmoSubmitXml(part2Xml);
    assert.equal(p1.part1FeatureCount, full.part1FeatureCount);
    assert.equal(p2.part2FeatureCount, full.part2FeatureCount);
    assert.equal(p2.part1FeatureCount, 0);
    assert.equal(p1.part2FeatureCount, 0);
});

test('writeThreadSubmitArtifacts writes resource sidecars with wall clock fields', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-artifacts-'));
    const built = enrichFromCombined(PARALLEL_COMBINED, dir);
    const submitPath = path.join(dir, 'results-testmo-submit.xml');
    fs.writeFileSync(submitPath, built.xml, 'utf8');
    const timing = computeSmokeTimingSummary({
        combinedXml: PARALLEL_COMBINED,
        submitXml: built.xml,
        smokeMeta: { workers: 2, smokeParts: [1, 2], startedAt: '2026-11-18T10:52:27Z' },
    });
    const artifacts = writeThreadSubmitArtifacts({ submitXmlPath: submitPath, timingSummary: timing });
    assert.ok(fs.existsSync(artifacts.runResourcesPath));
    const runRes = JSON.parse(fs.readFileSync(artifacts.runResourcesPath, 'utf8'));
    assert.ok(runRes.fields.some((f) => f.name === 'smoke_wall_clock_duration_seconds'));
    assert.ok(runRes.fields.some((f) => f.name === 'smoke_intended_testmo_run_duration_seconds'));
    assert.equal(artifacts.part1TestmoElapsedComputedMicroseconds, Math.round(60 * 1_000_000));
    assert.equal(artifacts.part2TestmoElapsedComputedMicroseconds, Math.round(40 * 1_000_000));
    assert.notEqual(artifacts.part1FeatureTestcaseSumSeconds, 60);
});

test('executeParallelTestmoSubmission resumes partial thread upload without duplicate create', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-resume-'));
    const built = enrichFromCombined(PARALLEL_COMBINED, dir);
    const submitPath = path.join(dir, 'results-testmo-submit.xml');
    fs.writeFileSync(submitPath, built.xml, 'utf8');
    const timing = computeSmokeTimingSummary({
        combinedXml: PARALLEL_COMBINED,
        submitXml: built.xml,
        smokeMeta: { workers: 2, smokeParts: [1, 2] },
    });
    const artifacts = writeThreadSubmitArtifacts({ submitXmlPath: submitPath, timingSummary: timing });
    const payloadSha256 = sha256Hex(built.xml);
    const statePath = path.join(dir, 'state.json');
    const state = { submissions: [], mockSubmissions: [], uncertain: [], inProgressSubmissions: [] };
    const calls = [];
    state.inProgressSubmissions = [
        {
            payloadSha256,
            destination: 'test',
            testmoRunId: 4242,
            threads: { part1: true, part2: false },
            completed: false,
        },
    ];
    executeParallelTestmoSubmission({
        state,
        statePath,
        payloadSha256,
        destination: 'test',
        baseResultsSha256: 'base',
        runName: 'test parallel',
        tags: [],
        threadArtifacts: artifacts,
        timingSummary: timing,
        mockSubmit: true,
        runCli: (args) => {
            calls.push(args[0]);
            return { exitCode: 0, stdout: '', stderr: '' };
        },
        saveState: () => {},
        now: new Date('2026-11-18T12:00:01Z'),
        backupPath: 'backup',
        submitXmlPath: 'submit.xml',
    });
    assert.deepEqual(calls, []);
    assert.equal(state.mockSubmissions.length, 1);
    assert.equal(state.inProgressSubmissions?.length ?? 0, 0);
    assert.equal(state.mockSubmissions[0].outgoingThreadElapsed.part1.junitRootTimeSeconds, 60);
    assert.equal(state.mockSubmissions[0].outgoingThreadElapsed.part2.junitRootTimeSeconds, 40);
});

test('mock parallel submission assigns synthetic run id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-mock-id-'));
    const built = enrichFromCombined(PARALLEL_COMBINED, dir);
    const submitPath = path.join(dir, 'results-testmo-submit.xml');
    fs.writeFileSync(submitPath, built.xml, 'utf8');
    const timing = computeSmokeTimingSummary({
        combinedXml: PARALLEL_COMBINED,
        submitXml: built.xml,
        smokeMeta: { workers: 2, smokeParts: [1, 2] },
    });
    const artifacts = writeThreadSubmitArtifacts({ submitXmlPath: submitPath, timingSummary: timing });
    const state = { submissions: [], mockSubmissions: [], uncertain: [], inProgressSubmissions: [] };
    const result = executeParallelTestmoSubmission({
        state,
        statePath: path.join(dir, 'state.json'),
        payloadSha256: sha256Hex(built.xml),
        destination: 'test',
        baseResultsSha256: 'base',
        runName: 'mock',
        tags: [],
        threadArtifacts: artifacts,
        timingSummary: timing,
        mockSubmit: true,
        saveState: () => {},
        now: new Date(),
        backupPath: 'b',
        submitXmlPath: 's',
    });
    assert.equal(result.runId, MOCK_PARALLEL_THREAD_RUN_ID);
    assert.equal(findInProgressSubmission(state, sha256Hex(built.xml), 'test'), undefined);
});