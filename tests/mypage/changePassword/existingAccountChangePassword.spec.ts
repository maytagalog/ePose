import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { runMyPageChangePasswordAndVerify } from './myPageChangePasswordFlow';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';

/**
 * Continuation: login → Change Password only (no registration, booking, profile, or email change).
 *
 * Permanently changes the account password on staging when successful.
 *
 * Required env (secrets are not logged; not the full-E2E default Password123):
 *   EPOSE_CHANGE_PASSWORD_EMAIL
 *   EPOSE_CHANGE_PASSWORD_CURRENT_PASSWORD
 *   EPOSE_CHANGE_PASSWORD_NEW_PASSWORD
 *
 * Example account after latest full smoke (if password not yet changed):
 *   a.ardva.rkomonstrosesquip1230000@gmail.com
 *
 * Run:
 *   EPOSE_CHANGE_PASSWORD_EMAIL='...' \\
 *   EPOSE_CHANGE_PASSWORD_CURRENT_PASSWORD='***' \\
 *   EPOSE_CHANGE_PASSWORD_NEW_PASSWORD='***' \\
 *     npx playwright test tests/mypage/changePassword/existingAccountChangePassword.spec.ts --workers=1
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
        throw new Error(`Missing ${name} for Change Password continuation.`);
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

test('Existing account: My Page Change Password', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_CHANGE_PASSWORD_EMAIL');
    const currentPassword = requireEnv('EPOSE_CHANGE_PASSWORD_CURRENT_PASSWORD');
    const newPassword = requireEnv('EPOSE_CHANGE_PASSWORD_NEW_PASSWORD');
    const account: SmokeAccountRef = { email, password: currentPassword };
    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await runMyPageChangePasswordAndVerify(page, account, newPassword, { evidence });
});
