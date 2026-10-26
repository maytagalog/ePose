import { test, expect } from '@playwright/test';
import { verifyAccountWithNewPasswordInFreshContext } from './myPageChangePasswordFlow';

function requireEnv(name: string): string {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
        throw new Error(`Missing ${name} for Change Password new-password login verification.`);
    }
    return raw;
}

/**
 * Read-only: fresh browser context login with new password after a completed change.
 * Does not change password or request OTP. Not part of default smoke orchestration.
 */
test.describe.configure({ retries: 0 });

test('verify staging account accepts new password in fresh context', async ({ browser }) => {
    test.setTimeout(180000);
    const email = requireEnv('EPOSE_CHANGE_PASSWORD_VERIFY_EMAIL');
    const newPassword = requireEnv('EPOSE_CHANGE_PASSWORD_VERIFY_NEW_PASSWORD');

    await verifyAccountWithNewPasswordInFreshContext(browser, {
        email,
        password: newPassword,
    });

    console.log(JSON.stringify({ verifiedLoginEmail: email }, null, 2));
});
