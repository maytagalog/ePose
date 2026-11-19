import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';

export default defineConfig({
    testDir: testsDir,
    testMatch: [
        '**/fixtures/analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmail.fixture.spec.ts',
        '**/comparisonReportView/sharing/email/comparisonReportShareEmailGmailMatch.spec.ts',
    ],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    reporter: [['line']],
    use: {
        trace: 'on-first-retry',
        actionTimeout: 15000,
        navigationTimeout: 30000,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    outputDir: path.join(testsDir, '..', 'test-output', 'comparisonReportEmail-fixtures', 'playwright-output'),
});