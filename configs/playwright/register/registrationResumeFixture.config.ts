import { defineConfig, devices } from '@playwright/test';
import { fromRepo, testsDir } from '../paths';

/** Local registration resume fixture (no staging). */
export default defineConfig({
    testDir: testsDir,
    testMatch: ['**/register/registrationResume.fixture.spec.ts'],
    retries: 0,
    workers: 1,
    reporter: [['line']],
    use: {
        trace: 'off',
        headless: true,
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});