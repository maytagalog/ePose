import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

/** Temporary JUnit output for local Analysis Report share-email reporting validation only. */
export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/analysisReportShareEmailReporting.junit.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [['junit', { outputFile: fromRepo('tmp-analysis-report-share-email-reporting-junit.xml') }]],
    use: {
        trace: 'off',
        headless: true,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
