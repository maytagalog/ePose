import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';
import { resolveSmokeRunOutputRoot } from '../../../tests/analysisReport/reportPDF/analysisReportPdfRunContext';

const smokeOutput = resolveSmokeRunOutputRoot();

export default defineConfig({
    testDir: testsDir,
    testMatch: [
        '**/analysisReport/reportPDF/analysisReportPdfMenuAction.spec.ts',
        '**/analysisReport/reportPDF/analysisReportPdfA4Generation.spec.ts',
    ],
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
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], headless: true },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'], headless: false },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], headless: false },
        },
    ],
});
