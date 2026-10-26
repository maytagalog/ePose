import { defineConfig, devices } from '@playwright/test';

/** Temporary JUnit output for local Part 2 reporting validation only. */
export default defineConfig({
    testDir: './tests',
    testMatch: ['**/smokePart1Reporting.junit.spec.ts', '**/smokePart2Reporting.junit.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [['junit', { outputFile: 'tmp-part2-reporting-junit.xml' }]],
    use: {
        trace: 'off',
        headless: true,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
