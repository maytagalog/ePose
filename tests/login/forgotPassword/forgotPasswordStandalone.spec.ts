import { test } from '@playwright/test';
import {
    resolveForgotPasswordEmail,
    resolveForgotPasswordNewPassword,
} from './forgotPasswordConfig';
import { runForgotPasswordResetAndLogin } from './forgotPasswordFlow';

/**
 * Standalone Forgot Password (same helper as fullE2ESmokePart1 after Online Booking + logout).
 *
 * Permanently changes the account password on staging when successful.
 * The previous password is not used — reset is email + OTP only.
 *
 * Required env:
 *   EPOSE_FORGOT_PASSWORD_EMAIL   (mailbox must receive OTP)
 *
 * Optional:
 *   EPOSE_FORGOT_PASSWORD_NEW_PASSWORD (defaults to P@ssw0rd)
 *
 * Gmail API (token.json) must be authorized for the reset recipient inbox.
 *
 * Run:
 *   EPOSE_FORGOT_PASSWORD_EMAIL='…' npm run pw:forgot-password
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

test('Forgot Password: reset via login, sign in with new password, customers visible', async ({
    page,
}) => {
    test.setTimeout(300000);

    const email = resolveForgotPasswordEmail();
    const newPassword = resolveForgotPasswordNewPassword();

    const result = await runForgotPasswordResetAndLogin(page, email, newPassword);

    await test.info().attach('forgot-password-outcome', {
        body: JSON.stringify({ email: result.email, passwordUpdated: true }, null, 2),
        contentType: 'application/json',
    });
});