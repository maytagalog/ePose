import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { navigateToSettings } from '../../settings/companyInformation/companyInformationFlow';
import { beginStripeTestModeObservation, runPlanPurchaseAndVerify } from './planPurchaseFlow';
import type { SmokeAccountRef } from '../../mypage/changeEmail/myPageChangeEmailFlow';

/**
 * Continuation: login → Settings → 3-month plan credit-card purchase (live staging).
 *
 * Permanently charges the staging Stripe test flow and changes contract state when successful.
 *
 * Required env (password is not logged):
 *   EPOSE_PLAN_EMAIL
 *   EPOSE_PLAN_PASSWORD
 *
 * Optional Stripe test card overrides (defaults match creditCard.spec.ts):
 *   EPOSE_STRIPE_TEST_CARD_NUMBER
 *   EPOSE_STRIPE_TEST_CARD_EXPIRY
 *   EPOSE_STRIPE_TEST_CARD_CVC
 *
 * Run:
 *   EPOSE_PLAN_EMAIL='you@example.com' \\
 *   EPOSE_PLAN_PASSWORD='***' \\
 *     npx playwright test tests/accountPayment/creditCard/existingAccountPlan.spec.ts --workers=1
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
        throw new Error(`Missing ${name} for Plan purchase continuation.`);
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

test('Existing account: Settings Plan purchase (3-month credit card)', async ({ page }, testInfo) => {
    test.setTimeout(900000);

    const email = requireEnv('EPOSE_PLAN_EMAIL');
    const password = requireEnv('EPOSE_PLAN_PASSWORD');
    const account: SmokeAccountRef = { email, password };
    const evidence = createEvidence(page, testInfo);
    beginStripeTestModeObservation(page);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await test.step('navigate to Settings', async () => {
        await navigateToSettings(page);
    });

    await runPlanPurchaseAndVerify(page, account, evidence);
});
