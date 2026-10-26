import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { runWithdrawalAndVerify } from './withdrawalFlow';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';

/**
 * Destructive continuation: login → stop paid-plan auto-renewal → account withdrawal → rejected login.
 *
 * Permanently cancels renewal and deletes the supplied staging account when successful.
 *
 * Required env:
 *   EPOSE_WITHDRAWAL_EMAIL — paid account intended for deletion (current login email)
 *   EPOSE_WITHDRAWAL_PASSWORD
 *
 * Optional:
 *   EPOSE_WITHDRAWAL_RENEWAL_ALREADY_DISABLED=1 — skip stop-renewal when already verified disabled
 *
 * Run (renewal already stopped — skip stop-renewal):
 *   EPOSE_WITHDRAWAL_EMAIL='paid-staging-account-to-delete' \\
 *   EPOSE_WITHDRAWAL_PASSWORD='its-current-password' \\
 *   EPOSE_WITHDRAWAL_RENEWAL_ALREADY_DISABLED=1 \\
 *     npx playwright test tests/mypage/withdrawal/existingAccountWithdrawal.spec.ts --workers=1
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
        throw new Error(`Missing ${name} for withdrawal continuation.`);
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

test('Existing account: withdrawal (stop renewal + delete + rejected login)', async ({
    page,
}, testInfo) => {
    test.setTimeout(900000);

    const email = requireEnv('EPOSE_WITHDRAWAL_EMAIL');
    const password = requireEnv('EPOSE_WITHDRAWAL_PASSWORD');
    const account: SmokeAccountRef = { email, password };
    const evidence = createEvidence(page, testInfo);
    const renewalAlreadyDisabled =
        process.env.EPOSE_WITHDRAWAL_RENEWAL_ALREADY_DISABLED?.trim() === '1';

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 60000 });
    });

    await runWithdrawalAndVerify(page, account, evidence, {
        renewalAlreadyDisabled,
    });
});
