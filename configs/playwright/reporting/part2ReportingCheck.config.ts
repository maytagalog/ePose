import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

/** Temporary JUnit output for local Part 2 reporting validation only. */
export default defineConfig({
    testDir: testsDir,
    testMatch: [
        '**/smokePart1Reporting.junit.spec.ts',
        '**/smokePart2Reporting.junit.spec.ts',
        '**/part1SmokeTestmoFeature.spec.ts',
        '**/smokePart2Reporting.spec.ts',
        '**/part2TestmoReporting.spec.ts',
    ],
    retries: 0,
    workers: 1,
    reporter: [['junit', { outputFile: fromRepo('tmp-part2-reporting-junit.xml') }]],
    use: {
        trace: 'off',
        headless: true,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
