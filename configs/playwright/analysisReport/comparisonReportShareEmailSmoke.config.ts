import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';
import { resolveComparisonReportShareEmailSmokeOutputRoot } from '../../../tests/analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailRunContext';

const smokeOutput = resolveComparisonReportShareEmailSmokeOutputRoot();

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/comparisonReportView/sharing/email/comparisonReportShareEmailStandalone.spec.ts'],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    outputDir: path.join(smokeOutput.runOutputRoot, 'playwright-output'),
    reporter: [
        ['line'],
        ['junit', { outputFile: smokeOutput.junitPath }],
    ],
    use: {
        trace: 'on',
        actionTimeout: 15000,
        navigationTimeout: 30000,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});