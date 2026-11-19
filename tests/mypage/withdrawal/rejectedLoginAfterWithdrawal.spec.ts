import { test, expect } from '@playwright/test';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';
import { verifyRejectedLoginInFreshContext } from './withdrawalFlow';

/**
 * Verification-only: one rejected-login probe on an already-withdrawn staging account.
 * Does not register, purchase, stop renewal, or delete the account.
 *
 * Required env:
 *   EPOSE_WITHDRAWN_ACCOUNT_EMAIL
 *   EPOSE_WITHDRAWN_ACCOUNT_PASSWORD
 *
 * Run:
 *   EPOSE_WITHDRAWN_ACCOUNT_EMAIL='...' EPOSE_WITHDRAWN_ACCOUNT_PASSWORD='...' \\
 *     npx playwright test tests/mypage/withdrawal/rejectedLoginAfterWithdrawal.spec.ts --project=chromium --reporter=line
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
        throw new Error(`Missing ${name} for withdrawn-account rejected-login verification.`);
    }
    return value;
}

test('withdrawn account: rejected login verification only', async ({ browser }) => {
    test.setTimeout(120000);

    const account: SmokeAccountRef = {
        email: requireEnv('EPOSE_WITHDRAWN_ACCOUNT_EMAIL'),
        password: requireEnv('EPOSE_WITHDRAWN_ACCOUNT_PASSWORD'),
    };

    const evidence = await verifyRejectedLoginInFreshContext(browser, account);
    expect(evidence.verificationMode).toBe('fresh_browser_context');
    expect(evidence.httpStatus).toBe(401);
});
