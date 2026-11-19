import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';
import { resolveDeletionSmokeRunOutputRoot } from '../../../tests/analysisReport/reportDeletion/analysisReportDeletionRunContext';

const smokeOutput = resolveDeletionSmokeRunOutputRoot();

const deletionHeaded =
    process.env.ANALYSIS_REPORT_DELETION_HEADED === '1' ||
    process.env.ANALYSIS_REPORT_DELETION_HEADED === 'true';

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/analysisReport/reportDeletion/analysisReportDeletionResumeDeleteOnce.spec.ts'],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    forbidOnly: true,
    outputDir: path.join(smokeOutput.runOutputRoot, 'playwright-output'),
    reporter: [
        ['line'],
        [
            'junit',
            {
                outputFile: path.join(
                    path.dirname(smokeOutput.junitPath),
                    'results-analysisReportDeletionResumeDeleteOnce.xml'
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
            use: { ...devices['Desktop Chrome'], headless: !deletionHeaded },
        },
    ],
});
