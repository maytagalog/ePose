import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pickPart2JUnitSourcePath } from './part2SubmitProvenance.mjs';
import {
    EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST,
    EXPECTED_SMOKE_TESTS,
    buildSmokeRunTitle,
    buildTestmoSubmitArgs,
    createTimestampedBackup,
    detectSmokeBrowserTags,
    extractTestCases,
    findLiveSubmissionByPayload,
    isKnownHistoricalMockReceipt,
    isMockSubmissionRecord,
    loadSubmissionState,
    saveSubmissionState,
    sha256Hex,
    submissionDestinationKey,
    submitSmokeResults,
    validateSmokeResultsXml,
    resolveExpectedSmokeTests,
} from './submitSmokeResults.mjs';
import { validateTestmoSubmitXml } from './buildTestmoSubmitJUnit.mjs';
import {
    FIXTURE_SYNTHETIC_PART1_REPORTING,
    loadFixtureText,
    loadStagingSmokePartsXml,
    REPO_ROOT,
} from './testFixtures.mjs';

/** Committed synthetic staging smoke JUnit (Part 1 suite uses current classname). */
const VALID_SMOKE_XML = loadStagingSmokePartsXml();
const SYNTHETIC_XML = loadFixtureText(FIXTURE_SYNTHETIC_PART1_REPORTING);

function writeAlignedPart2Source(resultsXml, dir) {
    const part2Suite = resultsXml.match(
        /<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts"[\s\S]*?<\/testsuite>/
    )?.[0];
    if (!part2Suite) {
        throw new Error('Missing Part 2 suite in combined results.xml');
    }
    fs.writeFileSync(
        path.join(dir, 'results-part2.xml'),
        `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">${part2Suite}</testsuites>`
    );
}

const FIXTURE_PART2_TS_ENRICHED = '2026-11-17T10:39:07.566Z';
const FIXTURE_PART2_TS_STALE = '2026-10-01T00:00:00.000Z';
const FIXTURE_PART2_RUN_OUTPUT = 'test-output/analysisReportFull/fixture-pick-part2-source';

const ENRICHED_PART2_SYSTEM_OUT = `PART2_RUN_STARTED {"smokePart":2,"deferredCoverage":[]}
PART2_RUN_COMPLETED {"featureOutcomes":{"login":"passed","limitDialog":"passed","cirsRecordNavigation":"passed","cirsResponseDetails":"passed","cirsHandwrittenNotes":"passed","cirsTakeoverHandover":"passed","cirsPostureAnalysis":"passed","analysisReport":"passed","logout":"passed"}}
PART2_ANALYSIS_REPORT_VERIFIED {"deletionMode":"off","combinedPassed":true,"runOutputRoot":"${FIXTURE_PART2_RUN_OUTPUT}","featureStages":{"login":"Skipped","preflight":"Passed","reportView":"Passed","displaySettings":"Passed","shareQr":"Passed","shareEmail":"Passed","reportPdf":"Skipped","reportHistory":"Passed","reportDeletion":"Skipped"}}`;

const STALE_PART2_SYSTEM_OUT = `PART2_RUN_STARTED {"smokePart":2,"deferredCoverage":["CIRS"]}
PART2_RUN_COMPLETED {"featureOutcomes":{"login":"passed","limitDialog":"passed"}}`;

function replacePart2Block(xml, { systemOut, suiteTimestamp, testcaseSkipped = false }) {
    const wrapped = testcaseSkipped
        ? '<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="0"><skipped/></testcase>'
        : `<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="396.706755"><system-out><![CDATA[${systemOut}]]></system-out></testcase>`;
    const skippedAttr = testcaseSkipped ? 1 : 0;
    const suite = `<testsuite name="e2e/fullE2ESmokePart2.spec.ts" timestamp="${suiteTimestamp}" hostname="chromium" tests="1" failures="0" skipped="${skippedAttr}" errors="0" time="396.706755">\n${wrapped}\n</testsuite>`;
    return xml.replace(/<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts"[\s\S]*?<\/testsuite>/, suite);
}

function writePart2JUnitFile(filePath, { systemOut, suiteTimestamp, testcaseSkipped = false }) {
    const skippedAttr = testcaseSkipped ? 1 : 0;
    const testcase = testcaseSkipped
        ? '<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="0"><skipped/></testcase>'
        : `<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="1"><system-out><![CDATA[${systemOut}]]></system-out></testcase>`;
    fs.writeFileSync(
        filePath,
        `<testsuites tests="1" failures="0" skipped="${skippedAttr}" errors="0" time="1"><testsuite name="e2e/fullE2ESmokePart2.spec.ts" hostname="chromium" tests="1" failures="0" skipped="${skippedAttr}" errors="0" time="1" timestamp="${suiteTimestamp}">${testcase}</testsuite></testsuites>`
    );
}

function withSmokePart2JUnitSource(value, fn) {
    const prior = process.env.SMOKE_PART2_JUNIT_SOURCE;
    if (value === undefined) {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    } else {
        process.env.SMOKE_PART2_JUNIT_SOURCE = value;
    }
    try {
        return fn();
    } finally {
        if (prior === undefined) {
            delete process.env.SMOKE_PART2_JUNIT_SOURCE;
        } else {
            process.env.SMOKE_PART2_JUNIT_SOURCE = prior;
        }
    }
}

test('pickPart2JUnitSourcePath honors explicit SMOKE_PART2_JUNIT_SOURCE override', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pick-part2-explicit-'));
    const combined = replacePart2Block(VALID_SMOKE_XML, {
        systemOut: ENRICHED_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_ENRICHED,
    });
    const stalePath = path.join(dir, 'results-part2.xml');
    const derivedPath = path.join(dir, 'results-part2-derived.xml');
    writePart2JUnitFile(stalePath, {
        systemOut: STALE_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_STALE,
        testcaseSkipped: true,
    });
    writePart2JUnitFile(derivedPath, {
        systemOut: ENRICHED_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_ENRICHED,
    });

    withSmokePart2JUnitSource(stalePath, () => {
        const picked = pickPart2JUnitSourcePath({ repoRoot: dir, resultsDir: dir, combinedXml: combined });
        assert.equal(picked, path.resolve(stalePath));
    });
});

test('pickPart2JUnitSourcePath selects provenance-aligned fresh results-part2.xml', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pick-part2-aligned-'));
    const combined = replacePart2Block(VALID_SMOKE_XML, {
        systemOut: ENRICHED_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_ENRICHED,
    });
    const freshPath = path.join(dir, 'results-part2.xml');
    writePart2JUnitFile(freshPath, {
        systemOut: ENRICHED_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_ENRICHED,
    });

    withSmokePart2JUnitSource(undefined, () => {
        const picked = pickPart2JUnitSourcePath({ repoRoot: dir, resultsDir: dir, combinedXml: combined });
        assert.equal(picked, freshPath);
    });
});

test('pickPart2JUnitSourcePath ignores stale skipped results-part2.xml when combined is enriched', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pick-part2-stale-'));
    const combined = replacePart2Block(VALID_SMOKE_XML, {
        systemOut: ENRICHED_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_ENRICHED,
    });
    const stalePath = path.join(dir, 'results-part2.xml');
    const derivedPath = path.join(dir, 'results-part2-derived.xml');
    writePart2JUnitFile(stalePath, {
        systemOut: STALE_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_STALE,
        testcaseSkipped: true,
    });
    writePart2JUnitFile(derivedPath, {
        systemOut: ENRICHED_PART2_SYSTEM_OUT,
        suiteTimestamp: FIXTURE_PART2_TS_ENRICHED,
    });

    withSmokePart2JUnitSource(undefined, () => {
        const picked = pickPart2JUnitSourcePath({ repoRoot: dir, resultsDir: dir, combinedXml: combined });
        assert.equal(picked, derivedPath);
    });
});

test('isMockSubmissionRecord does not treat bare testmoRunId 99999 as mock', () => {
    assert.equal(isMockSubmissionRecord({ testmoRunId: 99999 }), false);
    assert.equal(isMockSubmissionRecord({ mock: true, testmoRunId: 99999 }), true);
    const known = {
        testmoRunId: 99999,
        submittedAt: '2026-11-13T17:35:32.509Z',
        sha256: '5a24206cb2c545f9903a1170bd53e6a008984d03fdf77d56194f2d73530ab1e3',
    };
    assert.ok(isKnownHistoricalMockReceipt(known));
    assert.ok(isMockSubmissionRecord(known));
});

test('resolveExpectedSmokeTests adds share-email testcase when present in XML', () => {
    const shareSnippet = `<testcase name="${EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.name}" classname="${EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.classname}" time="1" />`;
    const withShare = `${VALID_SMOKE_XML.slice(0, -12)}${shareSnippet}</testsuites>`;
    const expected = resolveExpectedSmokeTests(withShare);
    assert.equal(expected.length, 3);
    assert.deepEqual(expected[2], EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST);
});

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
    assert.match(title, /^2026-10-26 Staging Smoke Automation$/);
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

test('submitSmokeResults live blocks duplicate enriched payload from prior live receipt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-dup-live-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="396.706754"', 'time="396.706757"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    writeAlignedPart2Source(altered, dir);
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], mockSubmissions: [], uncertain: [] }, statePath);

    const first = submitSmokeResults({
        resultsPath,
        statePath,
        backupDir: dir,
        mockSubmit: true,
        now: new Date('2026-10-26T06:00:00.000Z'),
    });
    const dest = submissionDestinationKey();
    saveSubmissionState(
        {
            submissions: [
                {
                    payloadSha256: first.payloadSha256,
                    destination: dest,
                    testmoRunId: 115,
                    submittedAt: '2026-10-26T04:56:46.008Z',
                    runName: '2026-10-26 Staging Smoke Automation',
                },
            ],
            mockSubmissions: [],
            uncertain: [],
        },
        statePath
    );

    assert.throws(
        () =>
            submitSmokeResults({
                resultsPath,
                statePath,
                backupDir: dir,
                mockSubmit: false,
                now: new Date('2026-10-26T06:01:00.000Z'),
                runSubmit: () => ({
                    exitCode: 0,
                    stdout: '201\nSuccessfully sent tests and completed run\n',
                    stderr: '',
                }),
            }),
        /Duplicate submission blocked.*115/
    );
});

test('submitSmokeResults mock may be repeated without blocking', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-mock-repeat-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="396.706754"', 'time="396.706758"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    writeAlignedPart2Source(altered, dir);
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], mockSubmissions: [], uncertain: [] }, statePath);

    const opts = {
        resultsPath,
        statePath,
        backupDir: dir,
        mockSubmit: true,
        now: new Date('2026-10-26T06:00:00.000Z'),
    };
    const liveBefore = loadSubmissionState(statePath).submissions.length;
    const first = submitSmokeResults(opts);
    const second = submitSmokeResults({ ...opts, now: new Date('2026-10-26T06:01:00.000Z') });
    assert.equal(first.mock, true);
    assert.equal(second.mock, true);
    const state = loadSubmissionState(statePath);
    assert.equal(state.mockSubmissions.length, 2);
    assert.equal(state.submissions.length, liveBefore);
    assert.ok(!findLiveSubmissionByPayload(state, first.payloadSha256));
});

test('submitSmokeResults mock does not block subsequent live submit for same payload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-mock-then-live-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="396.706754"', 'time="396.706759"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    writeAlignedPart2Source(altered, dir);
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], mockSubmissions: [], uncertain: [] }, statePath);

    submitSmokeResults({
        resultsPath,
        statePath,
        backupDir: dir,
        mockSubmit: true,
        now: new Date('2026-10-26T06:00:00.000Z'),
    });

    const live = submitSmokeResults({
        resultsPath,
        statePath,
        backupDir: dir,
        mockSubmit: false,
        now: new Date('2026-10-26T06:02:00.000Z'),
        runSubmit: () => ({
            exitCode: 0,
            stdout: '202\nSuccessfully sent tests and completed run\n',
            stderr: '',
        }),
    });
    assert.equal(live.runId, 202);
    const state = loadSubmissionState(statePath);
    const recorded = findLiveSubmissionByPayload(state, live.payloadSha256);
    assert.equal(recorded?.testmoRunId, 202);
    assert.equal(state.mockSubmissions.length, 1);
});

test('submitSmokeResults mock writes enriched JUnit with Part 2 feature cases', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-enriched-'));
    const systemOut = `PART2_RUN_COMPLETED {"featureOutcomes":{"login":"passed","limitDialog":"passed","cirsRecordNavigation":"passed","cirsResponseDetails":"passed","cirsHandwrittenNotes":"passed","cirsTakeoverHandover":"passed","cirsPostureAnalysis":"passed","analysisReport":"passed","logout":"passed"}}
PART2_ANALYSIS_REPORT_VERIFIED {"deletionMode":"off","combinedPassed":true,"runOutputRoot":"test-output/analysisReportFull/mock-run","featureStages":{"login":"Skipped","preflight":"Passed","reportView":"Passed","displaySettings":"Passed","shareQr":"Passed","shareEmail":"Passed","reportPdf":"Skipped","reportHistory":"Passed","reportDeletion":"Skipped"},"reportPdf":{"pdfGenerationSkipReason":"browser unsupported"}}`;
    const altered = VALID_SMOKE_XML.replace('time="396.706755"', 'time="396.706756"').replace(
        /(<testcase name="fullE2ESmokePart2"[\s\S]*?)<system-out>[\s\S]*?<\/system-out>/,
        `$1<system-out><![CDATA[${systemOut}]]></system-out>`
    );
    const resultsPath = path.join(dir, 'results.xml');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    writeAlignedPart2Source(altered, dir);
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], mockSubmissions: [], uncertain: [] }, statePath);
    const result = submitSmokeResults({
        resultsPath,
        statePath,
        backupDir: dir,
        mockSubmit: true,
        now: new Date('2026-10-26T06:00:00.000Z'),
    });
    assert.equal(result.mock, true);
    const enrichedPath = path.join(dir, 'results-testmo-submit.xml');
    assert.ok(fs.existsSync(enrichedPath));
    const enrichedXml = fs.readFileSync(enrichedPath, 'utf8');
    const validation = validateTestmoSubmitXml(enrichedXml);
    assert.ok(validation.featureCount >= 15);
    const pdf = result.testmoSubmitPreview.featureCases.find(
        (c) => c.automationKey === 'part2-smoke-analysis-report-pdf'
    );
    assert.equal(pdf.status, 'Skipped');
    assert.match(pdf.outcomeDetail, /browser unsupported|Skipped/);
});

test('submitSmokeResults mock records receipt only under mockSubmissions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="396.706754"', 'time="396.706755"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    writeAlignedPart2Source(altered, dir);
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], mockSubmissions: [], uncertain: [] }, statePath);

    const result = submitSmokeResults({
        resultsPath,
        statePath,
        backupDir: dir,
        mockSubmit: true,
        now: new Date('2026-10-26T06:00:00.000Z'),
    });

    assert.equal(result.mock, true);
    const state = loadSubmissionState(statePath);
    assert.ok(!findLiveSubmissionByPayload(state, result.payloadSha256));
    assert.equal(state.mockSubmissions.length, 1);
    assert.equal(state.mockSubmissions[0].payloadSha256, result.payloadSha256);
});

test('submitSmokeResults records uncertain when CLI succeeds without run id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="392.85"', 'time="392.86"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    writeAlignedPart2Source(altered, dir);
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], mockSubmissions: [], uncertain: [] }, statePath);

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
    assert.equal(cases[0].classname, 'e2e/fullE2ESmokePart1.spec.ts');
    assert.equal(cases[1].classname, 'e2e/fullE2ESmokePart2.spec.ts');
});

test('detectSmokeBrowserTags maps Chromium JUnit hostname to Testmo tags', () => {
    const { hostname, tags } = detectSmokeBrowserTags(VALID_SMOKE_XML);
    assert.equal(hostname, 'chromium');
    assert.deepEqual(tags, ['smoke-automation', 'chrome-chromium']);
});

test('detectSmokeBrowserTags maps WebKit JUnit hostname to Testmo tags', () => {
    const webkitXml = VALID_SMOKE_XML.replaceAll('hostname="chromium"', 'hostname="webkit"');
    const { hostname, tags } = detectSmokeBrowserTags(webkitXml);
    assert.equal(hostname, 'webkit');
    assert.deepEqual(tags, ['smoke-automation', 'safari-webkit']);
});

test('detectSmokeBrowserTags rejects missing hostname on a smoke suite', () => {
    const missing = VALID_SMOKE_XML.replace(
        /(<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts" timestamp="[^"]*") hostname="chromium"/,
        '$1'
    );
    assert.throws(() => detectSmokeBrowserTags(missing), /Missing JUnit suite hostname.*fullE2ESmokePart2/);
});

test('detectSmokeBrowserTags rejects inconsistent hostnames across smoke suites', () => {
    const mixed = VALID_SMOKE_XML.replace(
        /<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts"[^>]*hostname="chromium"/,
        '<testsuite name="e2e/fullE2ESmokePart2.spec.ts" timestamp="2026-10-26T04:41:20.338Z" hostname="webkit"'
    );
    assert.throws(() => detectSmokeBrowserTags(mixed), /Inconsistent browser metadata/);
});

test('detectSmokeBrowserTags rejects unsupported hostname', () => {
    const firefox = VALID_SMOKE_XML.replaceAll('hostname="chromium"', 'hostname="firefox"');
    assert.throws(() => detectSmokeBrowserTags(firefox), /Unsupported JUnit suite hostname="firefox"/);
});

test('buildTestmoSubmitArgs passes tags as structured CLI arguments', () => {
    const args = buildTestmoSubmitArgs('Run title', '/tmp/results.xml', [
        'smoke-automation',
        'chrome-chromium',
    ]);
    const tagsIndex = args.indexOf('--tags');
    assert.ok(tagsIndex >= 0);
    assert.deepEqual(args.slice(tagsIndex), [
        '--tags',
        'smoke-automation',
        'chrome-chromium',
    ]);
});

test('submitSmokeResults mock passes detected tags to Testmo CLI args', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-submit-tags-'));
    const resultsPath = path.join(dir, 'results.xml');
    const altered = VALID_SMOKE_XML.replace('time="37.56"', 'time="37.561"');
    fs.writeFileSync(resultsPath, altered, 'utf8');
    writeAlignedPart2Source(altered, dir);
    const statePath = path.join(dir, 'state.json');
    saveSubmissionState({ submissions: [], mockSubmissions: [], uncertain: [] }, statePath);

    let capturedArgs;
    submitSmokeResults({
        resultsPath,
        statePath,
        backupDir: dir,
        now: new Date('2026-10-26T06:00:00.000Z'),
        runSubmit: (args) => {
            capturedArgs = args;
            return {
                exitCode: 0,
                stdout: '88888\nSuccessfully sent tests and completed run\n',
                stderr: '',
            };
        },
    });

    assert.ok(capturedArgs.includes('--tags'));
    assert.deepEqual(
        capturedArgs.slice(capturedArgs.indexOf('--tags')),
        ['--tags', 'smoke-automation', 'chrome-chromium']
    );
});
