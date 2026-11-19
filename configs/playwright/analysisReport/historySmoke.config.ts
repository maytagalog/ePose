import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';
import { resolveHistorySmokeRunOutputRoot } from '../../../tests/analysisReport/reportHistory/analysisReportHistoryRunContext';

/**
 * Standalone Analysis Report History smoke — outputs under test-output/analysisReportHistory/<runId>/.
 */
const smokeOutput = resolveHistorySmokeRunOutputRoot();

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/analysisReport/reportHistory/analysisReportHistoryStandalone.spec.ts'],
    retries: 0,
    workers: 1,
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
