#!/usr/bin/env node
/**
 * Prepares a unique smoke-combined run directory and launches Playwright (does not stage data).
 *
 * Usage:
 *   npm run test:smoke              — Part 1 + Part 2 (workers 2)
 *   npm run test:smoke:part1       — Part 1 only (workers 1, results-part1.xml in run dir)
 *
 * Optional:
 *   EPOSE_SMOKE_RUN_ID=my-run-id npm run test:smoke
 *   EPOSE_SMOKE_PARTS=1|2|1,2    — override selected parts (default both)
 *   EPOSE_SMOKE_MIRROR_JUNIT=0   — skip publishing JUnit to repo root after run
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseSmokeDiagnosticParts,
    smokeDiagnosticJUnitFileName,
    smokeDiagnosticSpecArgs,
    smokeDiagnosticWorkers,
} from './smokeDiagnosticParts.mjs';
import { publishSmokeDiagnosticRun } from './publishSmokeResults.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function defaultRunId() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = Math.random().toString(16).slice(2, 10);
    return `${stamp}-chromium-${suffix}`;
}

const smokeParts = parseSmokeDiagnosticParts();
const workers = smokeDiagnosticWorkers(smokeParts);
const junitFileName = smokeDiagnosticJUnitFileName(smokeParts);

const runId = (process.env.EPOSE_SMOKE_RUN_ID || '').trim() || defaultRunId();
const runRoot = path.join(repoRoot, 'test-output', 'smoke-combined', runId);
const playwrightOutput = path.join(runRoot, 'playwright-output');
const evidenceDir = path.join(runRoot, 'evidence');

fs.mkdirSync(playwrightOutput, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const junitPath = path.join(runRoot, junitFileName);

const meta = {
    schemaVersion: 1,
    runId,
    runRoot,
    playwrightOutputDir: playwrightOutput,
    junitPath,
    junitFileName,
    evidenceDir,
    startedAt: new Date().toISOString(),
    smokeParts,
    workers,
    retries: 0,
    repeatEach: 1,
    headed: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    mirrorRepoJUnit: smokeParts.length === 1 ? junitFileName : null,
    executionMode:
        smokeParts.includes(1) && smokeParts.includes(2) && workers >= 2 ? 'parallel' : 'sequential',
};

fs.writeFileSync(path.join(runRoot, 'smoke-run.meta.json'), JSON.stringify(meta, null, 2));

console.log('SMOKE_DIAGNOSTIC_RUN_PREPARED', JSON.stringify({ runId, runRoot, smokeParts, workers, junitFileName }));

const env = {
    ...process.env,
    EPOSE_SMOKE_RUN_ID: runId,
    EPOSE_SMOKE_RUN_ROOT: runRoot,
    EPOSE_SMOKE_PARTS: smokeParts.join(','),
};

const configPath = path.join(repoRoot, 'configs/playwright/smoke/combinedSmoke.config.ts');
const specArgs = smokeDiagnosticSpecArgs(smokeParts, repoRoot);

const result = spawnSync(
    'npx',
    [
        'playwright',
        'test',
        ...specArgs,
        '--config',
        configPath,
        `--workers=${workers}`,
        '--project=chromium',
    ],
    { cwd: repoRoot, env, stdio: 'inherit' }
);

const publishDisabled =
    process.env.EPOSE_SMOKE_MIRROR_JUNIT === '0' ||
    process.env.EPOSE_SMOKE_MIRROR_JUNIT === 'false' ||
    process.env.EPOSE_SMOKE_PUBLISH === '0';
const exitCode = result.status ?? 1;

if (!publishDisabled && fs.existsSync(junitPath)) {
    try {
        const published = publishSmokeDiagnosticRun({
            repoRoot,
            runRoot,
            junitPath,
            smokeParts,
            meta,
        });
        console.log('SMOKE_RESULTS_PUBLISHED', JSON.stringify({
            mode: published.mode,
            paths: published.paths ?? { part: published.path },
            recombinationRequired: published.publication?.recombinationRequired ?? false,
        }));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('SMOKE_RESULTS_PUBLISH_FAILED', message);
    }
} else if (!fs.existsSync(junitPath)) {
    console.error('SMOKE_RESULTS_PUBLISH_SKIPPED', JSON.stringify({ reason: 'missing_junit', junitPath }));
}

process.exit(exitCode);