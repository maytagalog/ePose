import { defineConfig, devices } from '@playwright/test';
import { testsDir } from '../paths';

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/fixtures/analysisReport/comparisonReportView/*.fixture.spec.ts'],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    use: {
        trace: 'off',
        headless: true,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});