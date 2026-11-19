import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';
import { resolveAnalysisReportFullSmokeOutputRoot } from '../../../tests/analysisReport/smoke/analysisReportFullRunContext';

const smokeOutput = resolveAnalysisReportFullSmokeOutputRoot();

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/analysisReport/smoke/analysisReportReservedPlanRecoveryStandalone.spec.ts'],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    outputDir: path.join(smokeOutput.runOutputRoot, 'playwright-output'),
    reporter: [
        ['line'],
        [
            'junit',
            {
                outputFile: path.join(
                    path.dirname(smokeOutput.junitPath),
                    'results-analysisReportReservedPlanRecovery.xml'
                ),
            },
        ],
    ],
    use: {
        trace: 'on',
        actionTimeout: 15000,
        navigationTimeout: 30000,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], headless: true },
        },
    ],
});
