import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/comparisonReportPart2ChainStandalone.spec.ts'],
    retries: 0,
    workers: 1,
    timeout: 900000,
    reporter: [['line']],
    use: {
        trace: 'on-first-retry',
        headless: process.env.CI === 'true',
        launchOptions: process.env.CI === 'true' ? undefined : { slowMo: 1000 },
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1404, height: 856 },
                deviceScaleFactor: 2,
            },
        },
    ],
});