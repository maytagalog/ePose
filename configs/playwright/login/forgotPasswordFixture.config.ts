import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/login/forgotPassword/forgotPassword.fixture.spec.ts'],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    reporter: [['line']],
    use: {
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        headless: true,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});