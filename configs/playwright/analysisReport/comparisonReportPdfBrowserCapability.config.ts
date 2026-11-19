import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { testsDir, fromRepo } from '../paths';

const fixtureOutput = fromRepo('test-output', 'comparisonReportPDF-fixtures', 'browser-capability');

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/comparisonReportView/reportPDF/comparisonReportPdfBrowserCapability.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [['line']],
    outputDir: fixtureOutput,
    use: {
        actionTimeout: 15000,
        navigationTimeout: 30000,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
    },
    projects: [
        { name: 'firefox', use: { ...devices['Desktop Firefox'], headless: false } },
        { name: 'webkit', use: { ...devices['Desktop Safari'], headless: false } },
    ],
});