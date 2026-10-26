import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { navigateToSettings } from '../companyInformation/companyInformationFlow';
import { runDisplayItemSettingsUpdateAndVerify } from './displayItemSettingsFlow';
import type { SmokeAccountRef } from '../../mypage/changeEmail/myPageChangeEmailFlow';

/**
 * Continuation: login → Settings Display Item Settings update only.
 *
 * Toggles showExercisesAndStretches once on live staging (ON→OFF or OFF→ON) and leaves the new value in place.
 *
 * Required env (password is not logged):
 *   EPOSE_DISPLAY_ITEM_SETTINGS_EMAIL
 *   EPOSE_DISPLAY_ITEM_SETTINGS_PASSWORD
 *
 * Run:
 *   EPOSE_DISPLAY_ITEM_SETTINGS_EMAIL='you@example.com' \\
 *   EPOSE_DISPLAY_ITEM_SETTINGS_PASSWORD='***' \\
 *     npx playwright test tests/settings/displayItemSettings/existingAccountDisplayItemSettings.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing ${name} for Display Item Settings continuation.`);
    }
    return value;
}

function createEvidence(
    page: import('@playwright/test').Page,
    testInfo: TestInfo
): CustomerFlowEvidence {
    return {
        attachJson: async (name, data) => {
            await testInfo.attach(name, {
                body: JSON.stringify(data, null, 2),
                contentType: 'application/json',
            });
        },
        attachScreenshot: async (name) => {
            const png = await page.screenshot({ fullPage: true }).catch(() => null);
            if (png) {
                await testInfo.attach(name, { body: png, contentType: 'image/png' });
            }
        },
        attachPageHtml: async (name) => {
            const html = await page.content().catch(() => '');
            if (html) {
                await testInfo.attach(name, {
                    body: html,
                    contentType: 'text/html',
                });
            }
        },
    };
}

test('Existing account: Settings Display Item Settings', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_DISPLAY_ITEM_SETTINGS_EMAIL');
    const password = requireEnv('EPOSE_DISPLAY_ITEM_SETTINGS_PASSWORD');
    const account: SmokeAccountRef = { email, password };
    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await test.step('navigate to Settings', async () => {
        await navigateToSettings(page);
    });

    await runDisplayItemSettingsUpdateAndVerify(page, account, evidence);
});
