#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    buildTestmoSubmitJUnit,
    extractPart2FeatureCases,
    isTestmoSubmitFeatureOnlyXml,
    validateTestmoSubmitXml,
} from './buildTestmoSubmitJUnit.mjs';
import { pickPart2JUnitSourcePath } from './part2SubmitProvenance.mjs';
import {
    computeSmokeTimingSummary,
    EXECUTION_MODE_PARALLEL,
    formatTimingPreviewForConsole,
    loadCombinedProvenance,
    resolveSmokeRunMeta,
} from './testmoSmokeRunTiming.mjs';
import {
    buildParallelSubmissionPlan,
    writeThreadSubmitArtifacts,
} from './testmoParallelSubmit.mjs';
import { executeParallelTestmoSubmission } from './testmoSubmitExecution.mjs';
import { assertAggregateReadyForSubmit } from './resultsRootState.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const DEFAULT_RESULTS_FILE = path.join(REPO_ROOT, 'results.xml');
export const BACKUP_DIR = path.join(REPO_ROOT, 'results-backups');
export const STATE_FILE = path.join(BACKUP_DIR, 'smoke-submission-state.json');

export const EXPECTED_SMOKE_TESTS = [
    { name: 'fullE2ESmokePart1', classname: 'e2e/fullE2ESmokePart1.spec.ts' },
    { name: 'fullE2ESmokePart2', classname: 'e2e/fullE2ESmokePart2.spec.ts' },
];

export const EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST = {
    name: 'analysisReportShareEmailStandalone',
    classname: 'analysisReport/sharing/email/analysisReportShareEmail.spec.ts',
};

export function resolveExpectedSmokeTests(xml) {
    const cases = extractTestCases(xml);
    const includesShareEmail = cases.some(
        (testCase) =>
            testCase.name === EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.name &&
            testCase.classname === EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.classname
    );
    if (includesShareEmail) {
        return [...EXPECTED_SMOKE_TESTS, EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST];
    }
    return [...EXPECTED_SMOKE_TESTS];
}

/** JUnit testsuite hostname → Testmo run tag (Playwright project browser). */
export const SMOKE_BROWSER_TAG_BY_HOSTNAME = {
    chromium: 'chrome-chromium',
    webkit: 'safari-webkit',
};

export const SMOKE_RUN_TAG_ALWAYS = 'smoke-automation';

const SYNTHETIC_CLASSNAME_MARKERS = [
    'part1SmokeTestmoFeature.spec.ts',
    'smokePart1Reporting.junit.spec.ts',
    'smokePart2Reporting.junit.spec.ts',
    'analysisReportShareEmailReporting.junit.spec.ts',
    'tmp-part2-reporting-junit',
    'tmp-analysis-report-share-email-reporting-junit',
];

const SYNTHETIC_NAME_MARKERS = [
    'synthetic Part 1',
    'synthetic Part 2',
    'synthetic analysis report share email',
];

/** Must not be combined as live staging share-email smoke JUnit. */
export const ANALYSIS_REPORT_SHARE_EMAIL_NON_SMOKE_JUNIT_MARKERS = [
    '.fixture.spec.ts',
    'analysisReportShareEmailReporting.junit.spec.ts',
    'analysisReportShareEmailGmailMatch.spec.ts',
    'analysisReportShareEmailModal.spec.ts',
    'gmailAuth.spec.ts',
    'analysis-report-share-email-fixture.test',
    'synthetic analysis report share email',
    'share email: ',
];

export function validateAnalysisReportShareEmailSmokeJUnitSource(xml) {
    for (const marker of ANALYSIS_REPORT_SHARE_EMAIL_NON_SMOKE_JUNIT_MARKERS) {
        if (xml.includes(marker)) {
            throw new Error(
                `Rejected results-analysisReportShareEmail.xml: non-staging content detected (${marker}). Run npm run pw:ar:share-email only; keep fixture/unit JUnit under tmp-* outputs.`
            );
        }
    }
    const cases = extractTestCases(xml);
    const smoke = cases.filter(
        (testCase) =>
            testCase.name === EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.name &&
            testCase.classname === EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.classname
    );
    if (smoke.length !== 1) {
        throw new Error(
            `Rejected results-analysisReportShareEmail.xml: expected exactly one staging testcase ${EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.name} (${EXPECTED_ANALYSIS_REPORT_SHARE_EMAIL_TEST.classname}).`
        );
    }
}

const TESTMO_INSTANCE = 'https://vananaz-qa.testmo.net';
const TESTMO_PROJECT_ID = '6';
const TESTMO_SOURCE = 'frontend';

/** Synthetic run id printed by mock CLI simulation only — not used alone to classify receipts. */
export const MOCK_SUBMIT_SYNTHETIC_RUN_ID = 99999;

/**
 * Known mistaken live receipt from mock submit before mock/live separation.
 * Requires matching fields — not merely testmoRunId 99999.
 */
export const KNOWN_HISTORICAL_MOCK_RECEIPTS = [
    {
        testmoRunId: MOCK_SUBMIT_SYNTHETIC_RUN_ID,
        submittedAt: '2026-11-13T17:35:32.509Z',
        baseResultsSha256: '5a24206cb2c545f9903a1170bd53e6a008984d03fdf77d56194f2d73530ab1e3',
    },
];

export function submissionDestinationKey() {
    return `${TESTMO_INSTANCE}|${TESTMO_PROJECT_ID}|${TESTMO_SOURCE}`;
}

export function isKnownHistoricalMockReceipt(record) {
    if (!record || typeof record !== 'object') {
        return false;
    }
    return KNOWN_HISTORICAL_MOCK_RECEIPTS.some(
        (known) =>
            record.testmoRunId === known.testmoRunId &&
            record.submittedAt === known.submittedAt &&
            (record.baseResultsSha256 === known.baseResultsSha256 ||
                record.sha256 === known.baseResultsSha256)
    );
}

export function isMockSubmissionRecord(record) {
    if (!record || typeof record !== 'object') {
        return false;
    }
    if (record.mock === true) {
        return true;
    }
    return isKnownHistoricalMockReceipt(record);
}

/** Known successful combined smoke (run 115) — blocks duplicate resubmit of the same XML. */
export const SEED_SUBMISSIONS = [
    {
        sha256: '2e02205ba06aa5f8ec2d2c84d72e07126b624ed352fdbebf9c5daf618e241b4d',
        testmoRunId: 115,
        submittedAt: '2026-10-26T04:56:46.008Z',
        runName: '2026-10-26 Staging Smoke Automation — Parts 1 & 2',
        note: 'Recorded from successful staging smoke; do not resubmit this XML.',
    },
];

function parseXmlAttribute(fragment, attributeName) {
    const re = new RegExp(`${attributeName}="([^"]*)"`);
    const match = fragment.match(re);
    return match ? match[1] : null;
}

export function extractTestSuites(xml) {
    const suites = [];
    const re = /<testsuite\b[^>]*>/g;
    let match;
    while ((match = re.exec(xml)) !== null) {
        const tag = match[0];
        const name = parseXmlAttribute(tag, 'name');
        const hostname = parseXmlAttribute(tag, 'hostname');
        if (name) {
            suites.push({ name, hostname });
        }
    }
    return suites;
}

export function detectSmokeBrowserTags(xml) {
    const suites = extractTestSuites(xml);
    const hostnamesByTest = {};
    const expectedTests = resolveExpectedSmokeTests(xml);

    for (const expected of expectedTests) {
        const matches = suites.filter((s) => s.name === expected.classname);
        if (matches.length !== 1) {
            throw new Error(
                `Missing smoke testsuite for classname="${expected.classname}" (found ${matches.length}).`
            );
        }
        const hostname = matches[0].hostname;
        if (hostname === null || hostname === '') {
            throw new Error(
                `Missing JUnit suite hostname for smoke testcase "${expected.name}" (suite name="${expected.classname}").`
            );
        }
        hostnamesByTest[expected.name] = hostname;
    }

    const uniqueHostnames = [...new Set(Object.values(hostnamesByTest))];
    if (uniqueHostnames.length !== 1) {
        const detail = expectedTests
            .map((expected) => `${expected.name} hostname="${hostnamesByTest[expected.name] ?? ''}"`)
            .join(', ');
        throw new Error(
            `Inconsistent browser metadata across smoke suites: ${detail}. All suites must use the same supported browser.`
        );
    }

    const hostname = uniqueHostnames[0];
    const browserTag = SMOKE_BROWSER_TAG_BY_HOSTNAME[hostname];
    if (!browserTag) {
        throw new Error(
            `Unsupported JUnit suite hostname="${hostname}". Supported values: ${Object.keys(SMOKE_BROWSER_TAG_BY_HOSTNAME).join(', ')}.`
        );
    }

    return {
        hostname,
        tags: [SMOKE_RUN_TAG_ALWAYS, browserTag],
    };
}

export function extractTestCases(xml) {
    const cases = [];
    const re = /<testcase\b[^>]*\/?>/g;
    let match;
    while ((match = re.exec(xml)) !== null) {
        const tag = match[0];
        const name = parseXmlAttribute(tag, 'name');
        const classname = parseXmlAttribute(tag, 'classname');
        if (name && classname) {
            cases.push({ name, classname });
        }
    }
    return cases;
}

export function extractSuiteCounts(xml) {
    const rootMatch = xml.match(/<testsuites\b[^>]*>/);
    if (!rootMatch) {
        throw new Error('Invalid JUnit: missing <testsuites> root element.');
    }
    const root = rootMatch[0];
    const read = (attr) => {
        const value = parseXmlAttribute(root, attr);
        if (value === null || value === '') {
            throw new Error(`Invalid JUnit: testsuites missing ${attr} attribute.`);
        }
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) {
            throw new Error(`Invalid JUnit: testsuites ${attr} is not a valid count.`);
        }
        return n;
    };
    return {
        tests: read('tests'),
        failures: read('failures'),
        skipped: read('skipped'),
        errors: read('errors'),
    };
}

function isSyntheticCase(testCase) {
    if (SYNTHETIC_NAME_MARKERS.some((m) => testCase.name.includes(m))) {
        return true;
    }
    return SYNTHETIC_CLASSNAME_MARKERS.some((m) => testCase.classname.includes(m));
}

/**
 * Combined aggregate smoke only (fullE2ESmokePart1/Part2). Rejects TestMo feature-only submit XML.
 */
export function validateAggregateCombinedSmokeXml(xml) {
    if (isTestmoSubmitFeatureOnlyXml(xml)) {
        throw new Error(
            'Refusing to validate TestMo submit JUnit as combined aggregate input (feature-only suites). Use results.xml with fullE2ESmokePart1 and fullE2ESmokePart2; submit output uses validateTestmoSubmitXml only.'
        );
    }
    return validateSmokeResultsXml(xml);
}

export function validateSmokeResultsXml(xml) {
    for (const marker of SYNTHETIC_CLASSNAME_MARKERS) {
        if (xml.includes(marker)) {
            throw new Error(
                `Rejected results: synthetic reporting-check content detected (${marker}). Use combined smoke results.xml only.`
            );
        }
    }

    const counts = extractSuiteCounts(xml);
    const cases = extractTestCases(xml);
    const expectedTests = resolveExpectedSmokeTests(xml);
    const featureCases = extractPart2FeatureCases(xml);
    const enriched = featureCases.length > 0;

    for (const expected of expectedTests) {
        const matches = cases.filter(
            (c) => c.name === expected.name && c.classname === expected.classname
        );
        if (matches.length !== 1) {
            throw new Error(
                `Expected one testcase name="${expected.name}" classname="${expected.classname}", found ${matches.length}.`
            );
        }
    }

    const nonFeatureCases = cases.filter(
        (c) => !featureCases.some((f) => f.name === c.name && f.classname === c.classname)
    );
    if (nonFeatureCases.length !== expectedTests.length) {
        throw new Error(
            `Expected ${expectedTests.length} aggregate smoke testcases (excluding Part 2 features), found ${nonFeatureCases.length}.`
        );
    }

    if (cases.some(isSyntheticCase)) {
        throw new Error('Rejected results: synthetic reporting-check testcase names present.');
    }

    if (enriched && featureCases.length > 0) {
        throw new Error(
            'Combined results.xml must not embed TestMo feature testcases; use results-testmo-submit.xml.'
        );
    } else if (cases.length !== expectedTests.length) {
        throw new Error(
            `Expected exactly ${expectedTests.length} smoke testcases, found ${cases.length}.`
        );
    } else if (counts.tests !== expectedTests.length) {
        throw new Error(
            `Root tests count is ${counts.tests}; expected ${expectedTests.length} for combined smoke.`
        );
    }

    return { counts, cases, enriched, featureCount: featureCases.length };
}

export function sha256Hex(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function migrateSubmissionState(raw) {
    const uncertain = Array.isArray(raw.uncertain) ? raw.uncertain : [];
    const mockSubmissions = Array.isArray(raw.mockSubmissions) ? [...raw.mockSubmissions] : [];
    const live = [];
  for (const entry of Array.isArray(raw.submissions) ? raw.submissions : []) {
        if (isMockSubmissionRecord(entry)) {
            if (
                !mockSubmissions.some(
                    (m) =>
                        m.submittedAt === entry.submittedAt &&
                        (m.payloadSha256 ?? m.sha256) === (entry.payloadSha256 ?? entry.sha256)
                )
            ) {
                mockSubmissions.push({ ...entry, mock: true });
            }
            continue;
        }
        live.push(entry);
    }
    const inProgressSubmissions = Array.isArray(raw.inProgressSubmissions) ? raw.inProgressSubmissions : [];
    return { submissions: live, mockSubmissions, uncertain, inProgressSubmissions };
}

export function loadSubmissionState(statePath = STATE_FILE) {
    if (!fs.existsSync(statePath)) {
        return {
            submissions: [...SEED_SUBMISSIONS],
            mockSubmissions: [],
            uncertain: [],
            inProgressSubmissions: [],
        };
    }
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const migrated = migrateSubmissionState(raw);
    for (const seed of SEED_SUBMISSIONS) {
        if (!migrated.submissions.some((s) => s.sha256 === seed.sha256)) {
            migrated.submissions.push(seed);
        }
    }
    return migrated;
}

export function saveSubmissionState(state, statePath = STATE_FILE) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** @deprecated Legacy base results.xml hash lookup — prefer findLiveSubmissionByPayload. */
export function findSubmissionByHash(state, hash) {
    return state.submissions.find((s) => s.sha256 === hash);
}

export function findLiveSubmissionByPayload(state, payloadSha256, destination = submissionDestinationKey()) {
    return state.submissions.find(
        (s) =>
            s.payloadSha256 === payloadSha256 &&
            (s.destination ?? submissionDestinationKey()) === destination
    );
}

export function findMockSubmissionByPayload(state, payloadSha256, destination = submissionDestinationKey()) {
    const mocks = state.mockSubmissions ?? [];
    return mocks.find(
        (s) =>
            s.payloadSha256 === payloadSha256 &&
            (s.destination ?? submissionDestinationKey()) === destination
    );
}

export function findUncertainByPayload(state, payloadSha256, destination = submissionDestinationKey()) {
    return state.uncertain.find(
        (u) =>
            u.payloadSha256 === payloadSha256 &&
            (u.destination ?? submissionDestinationKey()) === destination
    );
}

export function findUncertainByHash(state, hash) {
    return state.uncertain.find((u) => u.sha256 === hash || u.payloadSha256 === hash);
}

export function formatManilaTimestamp(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}${get('minute')}${get('second')}+0800`;
}

export function buildSmokeRunTitle(date = new Date()) {
    const datePart = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
    return `${datePart} Staging Smoke Automation`;
}

export function createTimestampedBackup(xml, backupDir = BACKUP_DIR, now = new Date()) {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = formatManilaTimestamp(now);
    const backupPath = path.join(backupDir, `results-smoke-submit-${stamp}.xml`);
    if (fs.existsSync(backupPath)) {
        const withMs = path.join(backupDir, `results-smoke-submit-${stamp}-${now.getTime()}.xml`);
        fs.writeFileSync(withMs, xml, 'utf8');
        return withMs;
    }
    fs.writeFileSync(backupPath, xml, 'utf8');
    return backupPath;
}

export function parseTestmoRunId(stdout, stderr) {
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

export function buildTestmoSubmitArgs(runName, resultsPath, tags = []) {
    const args = [
        'automation:run:submit',
        '--instance',
        TESTMO_INSTANCE,
        '--project-id',
        TESTMO_PROJECT_ID,
        '--name',
        runName,
        '--source',
        TESTMO_SOURCE,
        '--results',
        resultsPath,
    ];
    if (tags.length > 0) {
        args.push('--tags', ...tags);
    }
    return args;
}

export function runTestmoCli(args, env = process.env) {
    const result = spawnSync('testmo', args, {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        exitCode: result.status ?? 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
    };
}

/**
 * @param {object} options
 * @param {string} [options.resultsPath]
 * @param {boolean} [options.mockSubmit]
 * @param {(args: string[]) => { exitCode: number, stdout: string, stderr: string }} [options.runSubmit]
 * @param {Date} [options.now]
 * @param {string} [options.backupDir]
 */
export function submitSmokeResults(options = {}) {
    const resultsPath = path.resolve(options.resultsPath ?? DEFAULT_RESULTS_FILE);
    const now = options.now ?? new Date();
    const statePath = options.statePath ?? STATE_FILE;
    const backupDir = options.backupDir ?? BACKUP_DIR;

    if (!fs.existsSync(resultsPath)) {
        throw new Error(`Results file not found: ${resultsPath}`);
    }

    if (!options.skipAggregateReadyCheck) {
        const resultsRepoRoot = options.repoRoot ?? path.dirname(resultsPath);
        assertAggregateReadyForSubmit(resultsRepoRoot, { resultsPath, backupDir });
    }

    const xml = fs.readFileSync(resultsPath, 'utf8');
    const baseResultsSha256 = sha256Hex(xml);
    const mockSubmit = Boolean(options.mockSubmit);
    const destination = submissionDestinationKey();

    const state = loadSubmissionState(statePath);

    const { counts } = validateAggregateCombinedSmokeXml(xml);
    const { hostname, tags } = detectSmokeBrowserTags(xml);

    console.log(
        `Smoke results summary: ${counts.tests} tests, ${counts.failures} failed, ${counts.skipped} skipped, ${counts.errors} errors`
    );
    console.log(`Detected browser: ${hostname}; Testmo tags: ${tags.join(', ')}`);

    const backupPath = createTimestampedBackup(xml, backupDir, now);
    console.log(`Backed up results to ${path.relative(REPO_ROOT, backupPath)}`);

    const resultsDir = path.dirname(resultsPath);
    const part2SourcePath = pickPart2JUnitSourcePath({
        repoRoot: REPO_ROOT,
        resultsDir,
        combinedXml: xml,
    });
    const enriched = buildTestmoSubmitJUnit(xml, {
        repoRoot: REPO_ROOT,
        resultsDir,
        ...(part2SourcePath ? { part2SourcePath } : {}),
    });
    const submitXmlPath = path.join(path.dirname(resultsPath), 'results-testmo-submit.xml');
    fs.writeFileSync(submitXmlPath, enriched.xml, 'utf8');
    const part2Sidecar = path.join(path.dirname(resultsPath), 'results-part2-testmo.json');
    const part2SidecarAlt = path.join(REPO_ROOT, 'results-part2-testmo.json');
    const sidecarPath = fs.existsSync(part2Sidecar)
        ? part2Sidecar
        : fs.existsSync(part2SidecarAlt)
          ? part2SidecarAlt
          : null;
    if (sidecarPath) {
        console.log(`Part 2 TestMo sidecar: ${path.relative(REPO_ROOT, sidecarPath)}`);
    }
    if (enriched.enriched) {
        const featureValidation = validateTestmoSubmitXml(enriched.xml);
        console.log(
            `Testmo submit JUnit: ${path.relative(REPO_ROOT, submitXmlPath)} (${featureValidation.part1FeatureCount} Part 1 + ${featureValidation.part2FeatureCount} Part 2 = ${featureValidation.totalUploadedTestcases} feature cases; aggregates excluded).`
        );
        if (enriched.preview?.manualAttachmentGap) {
            console.log(enriched.preview.manualAttachmentGap);
        }
    } else {
        console.log('Testmo submit: no Part 2 feature coverage found; submitting aggregate JUnit only.');
    }

    const runName = buildSmokeRunTitle(now);
    console.log(`Testmo run name: ${runName}`);

    const submitXml = fs.readFileSync(submitXmlPath, 'utf8');
    const payloadSha256 = sha256Hex(submitXml);

    const provenance = loadCombinedProvenance(resultsDir);
    const smokeMeta = resolveSmokeRunMeta({ resultsPath, combinedXml: xml, repoRoot: REPO_ROOT });
    const timingSummary = computeSmokeTimingSummary({
        combinedXml: xml,
        submitXml,
        provenance,
        smokeMeta,
    });
    const timingPreview = formatTimingPreviewForConsole(timingSummary);
    console.log(
        `TestMo timing: feature sum ${timingSummary.featureDurationSumSeconds.total}s; intended run ${timingSummary.intendedTestmoRunDurationSeconds}s (${timingSummary.executionMode}); wall clock ${timingSummary.wallClock.durationSeconds ?? 'n/a'}s`
    );
    console.log(JSON.stringify({ testmoTimingPreview: timingPreview, testmoTimingSummary: timingSummary }, null, 2));

    const featureValidationForPlan = enriched.enriched ? validateTestmoSubmitXml(enriched.xml) : null;
    const useParallelThreads =
        timingSummary.executionMode === EXECUTION_MODE_PARALLEL &&
        enriched.enriched &&
        featureValidationForPlan &&
        featureValidationForPlan.part1FeatureCount > 0 &&
        featureValidationForPlan.part2FeatureCount > 0;
    let threadArtifacts = null;
    let parallelPlan = null;
    if (useParallelThreads) {
        threadArtifacts = writeThreadSubmitArtifacts({
            submitXmlPath,
            timingSummary,
        });
        parallelPlan = buildParallelSubmissionPlan({
            runName,
            tags,
            artifacts: threadArtifacts,
            timingSummary,
        });
        console.log(
            `Parallel TestMo plan: ${path.relative(REPO_ROOT, threadArtifacts.part1Path)} + ${path.relative(REPO_ROOT, threadArtifacts.part2Path)} threads; complete with --no-measure-elapsed.`
        );
    }

    if (!mockSubmit) {
        const priorLive = findLiveSubmissionByPayload(state, payloadSha256, destination);
        if (priorLive?.testmoRunId) {
            throw new Error(
                `Duplicate submission blocked: this enriched TestMo payload was already submitted as automation run ${priorLive.testmoRunId} (${priorLive.runName ?? 'unknown name'}).`
            );
        }
        const priorUncertain = findUncertainByPayload(state, payloadSha256, destination);
        if (priorUncertain) {
            throw new Error(
                `Submission blocked: prior live attempt for this enriched payload ended uncertain at ${priorUncertain.recordedAt}. Inspect Testmo manually before retrying.`
            );
        }
    }

    if (useParallelThreads && threadArtifacts) {
        const parallelResult = executeParallelTestmoSubmission({
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
            runCli: options.runSubmit
                ? (args) => options.runSubmit(args)
                : mockSubmit
                  ? null
                  : (args) => runTestmoCli(args),
            saveState: saveSubmissionState,
            now,
            backupPath: path.relative(REPO_ROOT, backupPath),
            submitXmlPath: path.relative(REPO_ROOT, submitXmlPath),
        });
        console.log(
            mockSubmit
                ? 'Mock parallel-thread TestMo flow completed; no live upload.'
                : `Submitted parallel-thread TestMo automation run ${parallelResult.runId}.`
        );
        return {
            ...(parallelResult.mock ? { mock: true } : { runId: parallelResult.runId }),
            runName,
            baseResultsSha256,
            payloadSha256,
            backupPath,
            counts,
            testmoSubmitPreview: enriched.preview,
            testmoSubmitXml: submitXmlPath,
            testmoTimingPreview: timingPreview,
            testmoTimingSummary: timingSummary,
            parallelSubmissionPlan: parallelPlan,
            submissionPlan: 'parallel-threads',
        };
    }

    const args = buildTestmoSubmitArgs(runName, submitXmlPath, tags);
    let exitCode;
    let stdout;
    let stderr;

    if (mockSubmit) {
        exitCode = 0;
        stdout = '';
        stderr = '';
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
            backupPath: path.relative(REPO_ROOT, backupPath),
            testmoSubmitXml: path.relative(REPO_ROOT, submitXmlPath),
            part2FeatureCaseCount: enriched.preview?.featureCaseCount ?? 0,
            submissionPlan: 'single-submit',
            testmoTimingSummary: timingSummary,
        });
        saveSubmissionState(state, statePath);
        console.log('Mock completed; no TestMo upload performed.');
        return {
            mock: true,
            runName,
            baseResultsSha256,
            payloadSha256,
            backupPath,
            counts,
            testmoSubmitPreview: enriched.preview,
            testmoSubmitXml: submitXmlPath,
            testmoTimingPreview: timingPreview,
            testmoTimingSummary: timingSummary,
            submissionPlan: 'single-submit',
        };
    } else if (options.runSubmit) {
        ({ exitCode, stdout, stderr } = options.runSubmit(args));
    } else {
        if (!process.env.TESTMO_TOKEN) {
            throw new Error(
                'TESTMO_TOKEN is not set. Export a Testmo API token before submit:smoke, or use SMOKE_SUBMIT_MOCK=1 for local validation.'
            );
        }
        ({ exitCode, stdout, stderr } = runTestmoCli(args));
    }

    if (exitCode !== 0) {
        state.uncertain.push({
            payloadSha256,
            destination,
            baseResultsSha256,
            recordedAt: now.toISOString(),
            runName,
            reason: 'testmo_cli_nonzero_exit',
            exitCode,
            stderrSnippet: (stderr || stdout).slice(0, 500),
        });
        saveSubmissionState(state, statePath);
        throw new Error(
            `Testmo submit failed (exit ${exitCode}). Recorded as uncertain; not retrying automatically. Inspect Testmo and results-backups before a manual retry.`
        );
    }

    const runId = parseTestmoRunId(stdout, stderr);
    if (!runId || runId === MOCK_SUBMIT_SYNTHETIC_RUN_ID) {
        state.uncertain.push({
            payloadSha256,
            destination,
            baseResultsSha256,
            recordedAt: now.toISOString(),
            runName,
            reason: 'missing_run_id_in_cli_output',
            stdoutSnippet: stdout.slice(0, 500),
            stderrSnippet: stderr.slice(0, 500),
        });
        saveSubmissionState(state, statePath);
        throw new Error(
            'Testmo CLI succeeded but no automation run ID was detected. Recorded as uncertain; verify Testmo manually before retrying the same XML.'
        );
    }

    state.submissions.push({
        payloadSha256,
        destination,
        baseResultsSha256,
        sha256: baseResultsSha256,
        testmoRunId: runId,
        submittedAt: now.toISOString(),
        runName,
        backupPath: path.relative(REPO_ROOT, backupPath),
        testmoSubmitXml: path.relative(REPO_ROOT, submitXmlPath),
        part2FeatureCaseCount: enriched.preview?.featureCaseCount ?? 0,
        submissionPlan: 'single-submit',
        testmoTimingSummary: timingSummary,
    });
    saveSubmissionState(state, statePath);

    console.log(`Submitted to Testmo automation run ${runId}.`);
    return {
        runId,
        runName,
        baseResultsSha256,
        payloadSha256,
        backupPath,
        counts,
        testmoSubmitPreview: enriched.preview,
        testmoSubmitXml: submitXmlPath,
        testmoTimingPreview: timingPreview,
        testmoTimingSummary: timingSummary,
        submissionPlan: 'single-submit',
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const mockSubmit = process.env.SMOKE_SUBMIT_MOCK === '1' || process.argv.includes('--mock');
    try {
        submitSmokeResults({ mockSubmit });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
    }
}
