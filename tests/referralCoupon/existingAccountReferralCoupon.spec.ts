import { test, type TestInfo } from '@playwright/test';
import { login } from '../../utils/login';
import { type CustomerFlowEvidence } from '../accountRegistration/customerFlow';
import {
    navigateToContractInformationReadOnly,
    runReferralCouponEmailAndVerify,
} from './referralCouponFlow';
import type { SmokeAccountRef } from '../mypage/changeEmail/myPageChangeEmailFlow';

/**
 * Read-only continuation: login → Contract Information → referral coupon email + Gmail verify.
 * Does not register, purchase, change email/password, or touch allocator state files.
 *
 * Required env:
 *   EPOSE_REFERRAL_EMAIL — current subscribed account login email (exact Gmail recipient)
 *   EPOSE_REFERRAL_PASSWORD
 *
 * Run:
 *   EPOSE_REFERRAL_EMAIL='current-email-of-subscribed-account' \\
 *   EPOSE_REFERRAL_PASSWORD='current-password' \\
 *     npx playwright test tests/referralCoupon/existingAccountReferralCoupon.spec.ts --workers=1
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
        throw new Error(`Missing ${name} for referral coupon continuation.`);
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

test('Existing account: referral coupon email (Contract Information start)', async ({
    page,
}, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_REFERRAL_EMAIL');
    const password = requireEnv('EPOSE_REFERRAL_PASSWORD');
    const account: SmokeAccountRef = { email, password };
    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 60000 });
    });

    await test.step('navigate to Contract Information (read-only)', async () => {
        await navigateToContractInformationReadOnly(page);
    });

    await runReferralCouponEmailAndVerify(page, account, evidence);
});
