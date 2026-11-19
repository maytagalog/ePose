import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';
import { fromRepo } from '../paths';

const fixtureOutput = fromRepo('test-output', 'comparisonReportPDF-fixtures', 'playwright-output');

export default defineConfig({
    testDir: testsDir,
    testMatch: [
        '**/fixtures/analysisReport/comparisonReportView/reportPDF/comparisonReportPdf.fixture.spec.ts',
        '**/comparisonReportView/reportPDF/comparisonReportPdfExecutionContext.spec.ts',
    ],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    reporter: [['line']],
    outputDir: fixtureOutput,
    use: {
        trace: 'on-first-retry',
        actionTimeout: 15000,
        navigationTimeout: 30000,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], headless: false } },
        { name: 'webkit', use: { ...devices['Desktop Safari'], headless: false } },
    ],
});