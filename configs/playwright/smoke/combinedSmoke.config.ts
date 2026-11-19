import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { fromRepo } from '../paths';
import { stagingSmokeProjectUse } from './stagingSmokeBrowser.mjs';

function parseSmokeParts(): Array<1 | 2> {
    const raw = process.env.EPOSE_SMOKE_PARTS?.trim();
    if (!raw) {
        return [1, 2];
    }
    const parts = [
        ...new Set(
            raw
                .split(/[,;\s]+/)
                .map((s) => Number.parseInt(s, 10))
                .filter((n): n is 1 | 2 => n === 1 || n === 2)
        ),
    ].sort((a, b) => a - b);
    return parts.length === 0 ? [1, 2] : parts;
}

const smokeParts = parseSmokeParts();
const workers = smokeParts.length === 2 ? 2 : 1;
const junitFileName =
    smokeParts.length === 2
        ? 'results-smoke.xml'
        : smokeParts[0] === 1
          ? 'results-part1.xml'
          : 'results-part2.xml';
const testMatch =
    smokeParts.length === 2
        ? ['**/fullE2ESmokePart1.spec.ts', '**/fullE2ESmokePart2.spec.ts']
        : smokeParts[0] === 1
          ? ['**/fullE2ESmokePart1.spec.ts']
          : ['**/fullE2ESmokePart2.spec.ts'];

const runRoot = process.env.EPOSE_SMOKE_RUN_ROOT?.trim();
const junitPath = runRoot ? path.join(runRoot, junitFileName) : fromRepo(junitFileName);
const outputDir = runRoot ? path.join(runRoot, 'playwright-output') : fromRepo('test-results');

/** Diagnostic staging smoke (Part 1, Part 2, or both via EPOSE_SMOKE_PARTS). */
export default defineConfig({
    testDir: fromRepo('tests'),
    testMatch,
    testIgnore: [
        '**/part1SmokeTestmoFeature.spec.ts',
        '**/smokePart1Reporting.junit.spec.ts',
        '**/smokePart2Reporting.junit.spec.ts',
    ],
    retries: 0,
    workers,
    repeatEach: 1,
    forbidOnly: !!process.env.CI,
    outputDir,
    reporter: [
        ['junit', { outputFile: junitPath }],
        ['line'],
    ],
    use: {
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        headless: false,
        launchOptions: {
            slowMo: 1000,
        },
    },
    projects: [{ name: 'chromium', use: { ...stagingSmokeProjectUse } }],
});