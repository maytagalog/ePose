import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

/** Standalone Analysis Report share-email smoke — JUnit to results-analysisReportShareEmail.xml. */
export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/analysisReport/sharing/email/analysisReportShareEmail.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [
        ['line'],
        ['junit', { outputFile: fromRepo('results-analysisReportShareEmail.xml') }],
    ],
    use: {
        trace: 'on',
        headless: false,
        actionTimeout: 15000,
        navigationTimeout: 30000,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
