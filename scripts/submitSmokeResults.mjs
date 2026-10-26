#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const DEFAULT_RESULTS_FILE = path.join(REPO_ROOT, 'results.xml');
export const BACKUP_DIR = path.join(REPO_ROOT, 'results-backups');
export const STATE_FILE = path.join(BACKUP_DIR, 'smoke-submission-state.json');

export const EXPECTED_SMOKE_TESTS = [
    { name: 'fullE2ESmokePart1', classname: 'e2e/fullE2ESmoke.spec.ts' },
    { name: 'fullE2ESmokePart2', classname: 'e2e/fullE2ESmokePart2.spec.ts' },
];

const SYNTHETIC_CLASSNAME_MARKERS = [
    'smokePart1Reporting.junit.spec.ts',
    'smokePart2Reporting.junit.spec.ts',
    'tmp-part2-reporting-junit',
];

const SYNTHETIC_NAME_MARKERS = ['synthetic Part 1', 'synthetic Part 2'];

const TESTMO_INSTANCE = 'https://vananaz-qa.testmo.net';
const TESTMO_PROJECT_ID = '6';
const TESTMO_SOURCE = 'frontend';

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

    if (cases.length !== EXPECTED_SMOKE_TESTS.length) {
        throw new Error(
            `Expected exactly ${EXPECTED_SMOKE_TESTS.length} smoke testcases, found ${cases.length}.`
        );
    }

    for (const expected of EXPECTED_SMOKE_TESTS) {
        const matches = cases.filter(
            (c) => c.name === expected.name && c.classname === expected.classname
        );
        if (matches.length !== 1) {
            throw new Error(
                `Expected one testcase name="${expected.name}" classname="${expected.classname}", found ${matches.length}.`
            );
        }
    }

    if (cases.some(isSyntheticCase)) {
        throw new Error('Rejected results: synthetic reporting-check testcase names present.');
    }

    if (counts.tests !== EXPECTED_SMOKE_TESTS.length) {
        throw new Error(
            `Root tests count is ${counts.tests}; expected ${EXPECTED_SMOKE_TESTS.length} for combined smoke.`
        );
    }

    return { counts, cases };
}

export function sha256Hex(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export function loadSubmissionState(statePath = STATE_FILE) {
    if (!fs.existsSync(statePath)) {
        return { submissions: [...SEED_SUBMISSIONS], uncertain: [] };
    }
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const submissions = Array.isArray(raw.submissions) ? raw.submissions : [];
    const uncertain = Array.isArray(raw.uncertain) ? raw.uncertain : [];
    for (const seed of SEED_SUBMISSIONS) {
        if (!submissions.some((s) => s.sha256 === seed.sha256)) {
            submissions.push(seed);
        }
    }
    return { submissions, uncertain };
}

export function saveSubmissionState(state, statePath = STATE_FILE) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function findSubmissionByHash(state, hash) {
    return state.submissions.find((s) => s.sha256 === hash);
}

export function findUncertainByHash(state, hash) {
    return state.uncertain.find((u) => u.sha256 === hash);
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
    return `${datePart} Staging Smoke Automation — Parts 1 & 2`;
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

export function buildTestmoSubmitArgs(runName, resultsPath) {
    return [
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

    const xml = fs.readFileSync(resultsPath, 'utf8');
    const hash = sha256Hex(xml);
    const { counts } = validateSmokeResultsXml(xml);

    console.log(
        `Smoke results summary: ${counts.tests} tests, ${counts.failures} failed, ${counts.skipped} skipped, ${counts.errors} errors`
    );

    const state = loadSubmissionState(statePath);
    const prior = findSubmissionByHash(state, hash);
    if (prior?.testmoRunId) {
        throw new Error(
            `Duplicate submission blocked: this results.xml was already submitted as Testmo automation run ${prior.testmoRunId} (${prior.runName ?? 'unknown name'}).`
        );
    }

    const priorUncertain = findUncertainByHash(state, hash);
    if (priorUncertain) {
        throw new Error(
            `Submission blocked: prior attempt for this results.xml ended uncertain at ${priorUncertain.recordedAt}. Inspect Testmo manually before retrying.`
        );
    }

    const backupPath = createTimestampedBackup(xml, backupDir, now);
    console.log(`Backed up results to ${path.relative(REPO_ROOT, backupPath)}`);

    const runName = buildSmokeRunTitle(now);
    console.log(`Testmo run name: ${runName}`);

    const args = buildTestmoSubmitArgs(runName, resultsPath);
    let exitCode;
    let stdout;
    let stderr;

    if (options.mockSubmit) {
        exitCode = 0;
        stdout = '99999\nCreated new thread (ID: 1)\nSuccessfully sent tests and completed run\n';
        stderr = '';
        console.log('Mock submit: skipped Testmo CLI (SMOKE_SUBMIT_MOCK).');
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
            sha256: hash,
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
    if (!runId) {
        state.uncertain.push({
            sha256: hash,
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
        sha256: hash,
        testmoRunId: runId,
        submittedAt: now.toISOString(),
        runName,
        backupPath: path.relative(REPO_ROOT, backupPath),
    });
    saveSubmissionState(state, statePath);

    console.log(`Submitted to Testmo automation run ${runId}.`);
    return { runId, runName, hash, backupPath, counts };
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
