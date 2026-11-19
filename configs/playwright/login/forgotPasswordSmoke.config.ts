import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

/** Standalone Forgot Password headed smoke (EPOSE_FORGOT_PASSWORD_EMAIL; Part 1 uses registration email). */
export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/login/forgotPassword/forgotPasswordStandalone.spec.ts'],
    retries: 0,
    workers: 1,
    repeatEach: 1,
    reporter: [['line']],
    use: {
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        headless: false,
        actionTimeout: 15000,
        navigationTimeout: 30000,
        viewport: { width: 1404, height: 856 },
        deviceScaleFactor: 2,
        launchOptions: {
            slowMo: 1000,
        },
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});