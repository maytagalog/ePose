import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { navigateToSettings } from '../../settings/companyInformation/companyInformationFlow';
import { runExistingPaidPlanVerificationOnly } from './planPurchaseFlow';
import type { SmokeAccountRef } from '../../mypage/changeEmail/myPageChangeEmailFlow';

/**
 * Verification-only continuation for an account that already completed the 3-month plan purchase.
 * Does not purchase again, enter card details, or change/cancel plans.
 * Ends on Contract Information (/contract) after payment-history verification.
 *
 * Required env:
 *   EPOSE_PLAN_EMAIL
 *   EPOSE_PLAN_PASSWORD
 *   EPOSE_PLAN_PAYMENT_HISTORY_ID — exact 決済履歴 row id (Ant `data-row-key` / API `id`)
 *
 * Optional:
 *   EPOSE_PLAN_CARD_LAST4 — defaults to Stripe test card last4 (4242)
 *
 * fullE2ESmokePart1 (2026-10-24) for a.ardvarko.monstrosesquip1230000@gmail.com:
 *   payment-history row id `pi_3UU5x7GOFKxlleFj01aYdJVv` (¥29,400, succeeded, created 2026-10-24T14:29:45Z).
 *   Do not reuse payment ids from other smoke accounts (e.g. pi_3UU4XQ…).
 *
 * Run:
 *   EPOSE_PLAN_EMAIL='…' \\
 *   EPOSE_PLAN_PASSWORD='…' \\
 *   EPOSE_PLAN_PAYMENT_HISTORY_ID='…' \\
 *     npx playwright test tests/accountPayment/creditCard/existingAccountPlanVerification.spec.ts --workers=1
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
        throw new Error(`Missing ${name} for paid plan verification continuation.`);
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

test('Existing account: verify paid 3-month plan (no purchase)', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_PLAN_EMAIL');
    const password = requireEnv('EPOSE_PLAN_PASSWORD');
    const paymentHistoryId = requireEnv('EPOSE_PLAN_PAYMENT_HISTORY_ID');
    const cardLast4 = process.env.EPOSE_PLAN_CARD_LAST4?.trim() || undefined;

    const account: SmokeAccountRef = { email, password };
    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await test.step('navigate to Settings', async () => {
        await navigateToSettings(page);
    });

    await runExistingPaidPlanVerificationOnly(page, account, {
        paymentHistoryId,
        cardLast4,
    });

    await evidence.attachJson('PLAN_PURCHASE_VERIFICATION_ONLY', {
        accountEmail: account.email,
        paymentHistoryId,
        cardLast4: cardLast4 ?? '(default test card last4)',
    });
});
