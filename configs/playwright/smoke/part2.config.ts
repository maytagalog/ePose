import { defineConfig } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';
import { stagingSmokeProjectUse } from './stagingSmokeBrowser.mjs';

const part2Headless =
    process.env.PART2_HEADLESS === '1' ||
    process.env.PART2_HEADLESS === 'true' ||
    process.env.CI === 'true';

/** Part 2 smoke only — JUnit to results-part2.xml so Part 1 output is not overwritten. */
export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/fullE2ESmokePart2.spec.ts'],
    testIgnore: ['**/smokePart2Reporting.junit.spec.ts'],
    retries: 0,
    workers: 1,
    timeout: 900000,
    reporter: [
        ['junit', { outputFile: fromRepo('results-part2.xml') }],
        ['line'],
    ],
    use: {
        trace: 'on-first-retry',
        headless: part2Headless,
        launchOptions: part2Headless ? undefined : { slowMo: 1000 },
    },
    projects: [{ name: 'chromium', use: { ...stagingSmokeProjectUse } }],
});
