import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    EXPECTED_SMOKE_TESTS,
    buildSmokeRunTitle,
    createTimestampedBackup,
    extractTestCases,
    findSubmissionByHash,
    loadSubmissionState,
    saveSubmissionState,
    sha256Hex,
    submitSmokeResults,
    validateSmokeResultsXml,
} from './submitSmokeResults.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const VALID_SMOKE_XML = fs.readFileSync(
    path.join(REPO_ROOT, 'results-backups/results-2026-10-26-staging-smoke-parts-1-2.xml'),
    'utf8'
);
const SYNTHETIC_XML = fs.readFileSync(path.join(REPO_ROOT, 'tmp-part2-reporting-junit.xml'), 'utf8');

test('validateSmokeResultsXml accepts combined staging smoke JUnit', () => {
    const { counts, cases } = validateSmokeResultsXml(VALID_SMOKE_XML);
    assert.equal(counts.tests, 2);
    assert.equal(counts.failures, 0);
    assert.equal(cases.length, 2);
    assert.deepEqual(cases, EXPECTED_SMOKE_TESTS);
});

test('validateSmokeResultsXml rejects synthetic reporting-check XML', () => {
    assert.throws(() => validateSmokeResultsXml(SYNTHETIC_XML), /synthetic reporting-check/);
});

test('validateSmokeResultsXml allows genuine failures in counts', () => {
    const withFailure = VALID_SMOKE_XML.replace('failures="0"', 'failures="1"').replace(
        'time="37.56">\n<system-out>',
        'time="37.56">\n<failure message="staging failure"/>\n<system-out>'
    );
    const { counts } = validateSmokeResultsXml(withFailure);
    assert.equal(counts.failures, 1);
});

test('buildSmokeRunTitle uses Asia/Manila calendar date', () => {
    const title = buildSmokeRunTitle(new Date('2026-10-25T18:00:00.000Z'));
    assert.match(title, /^2026-10-26 Staging Smoke Automation — Parts 1 & 2$/);
});

test('createTimestampedBackup never overwrites an existing backup path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-backup-'));
    const fixedNow = new Date('2026-10-26T05:15:30.000Z');
    const first = createTimestampedBackup('<testsuites/>', dir, fixedNow);
    const second = createTimestampedBackup('<testsuites/>', dir, fixedNow);
    assert.notEqual(first, second);
    assert.ok(fs.existsSync(first));
    assert.ok(fs.existsSync(second));
});

test('submitSmokeResults mock blocks duplicate hash from seeded run 115', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-'));
    const resultsPath = path.join(dir, 'results.xml');
    fs.writeFileSync(resultsPath, VALID_SMOKE_XML, 'utf8');
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], uncertain: [] }, statePath);

    assert.throws(
        () =>
            submitSmokeResults({
                resultsPath,
                statePath,
                backupDir: dir,
                mockSubmit: true,
                now: new Date('2026-10-26T06:00:00.000Z'),
            }),
        /Duplicate submission blocked.*115/
    );
});

test('submitSmokeResults mock succeeds for new XML and records run id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="396.706754"', 'time="396.706755"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], uncertain: [] }, statePath);

    const result = submitSmokeResults({
        resultsPath,
        statePath,
        backupDir: dir,
        mockSubmit: true,
        now: new Date('2026-10-26T06:00:00.000Z'),
    });

    assert.equal(result.runId, 99999);
    const state = loadSubmissionState(statePath);
    const hash = sha256Hex(altered);
    assert.ok(findSubmissionByHash(state, hash));
});

test('submitSmokeResults records uncertain when CLI succeeds without run id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="392.85"', 'time="392.86"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], uncertain: [] }, statePath);

    assert.throws(
        () =>
            submitSmokeResults({
                resultsPath,
                statePath,
                backupDir: dir,
                now: new Date('2026-10-26T06:00:00.000Z'),
                runSubmit: () => ({
                    exitCode: 0,
                    stdout: 'Successfully sent tests and completed run\n',
                    stderr: '',
                }),
            }),
        /uncertain/
    );

    const state = loadSubmissionState(statePath);
    assert.equal(state.uncertain.length, 1);
});

test('extractTestCases preserves Playwright classnames', () => {
    const cases = extractTestCases(VALID_SMOKE_XML);
    assert.equal(cases[0].classname, 'e2e/fullE2ESmoke.spec.ts');
    assert.equal(cases[1].classname, 'e2e/fullE2ESmokePart2.spec.ts');
});
