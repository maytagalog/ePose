import { defineConfig } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';
import { stagingSmokeProjectUse } from './stagingSmokeBrowser.mjs';

/** Part 1 smoke only — JUnit to results-part1.xml so Part 2 output is not overwritten. */
export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/fullE2ESmokePart1.spec.ts'],
    testIgnore: ['**/part1SmokeTestmoFeature.spec.ts', '**/smokePart1Reporting.junit.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [
        ['junit', { outputFile: fromRepo('results-part1.xml') }],
        ['line'],
    ],
    use: {
        trace: 'on-first-retry',
        headless: false,
        launchOptions: {
            slowMo: 1000,
        },
    },
    projects: [{ name: 'chromium', use: { ...stagingSmokeProjectUse } }],
});
