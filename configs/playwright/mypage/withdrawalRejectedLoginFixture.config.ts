import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

/** Local withdrawal rejected-login fixture (no staging). */
export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/withdrawal/withdrawalRejectedLoginFreshContext.fixture.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [['line']],
    use: {
        trace: 'off',
        headless: true,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});