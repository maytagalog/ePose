import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/part2ComparisonReporting.fixture.spec.ts', '**/comparisonReportViewExit.fixture.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [['line']],
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});