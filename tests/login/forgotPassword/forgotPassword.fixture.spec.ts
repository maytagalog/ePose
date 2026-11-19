import { test, expect } from '@playwright/test';
import { assertCustomersListInitReady } from '../../accountRegistration/customerFlow';
import {
    FORGOT_PASSWORD_FIXTURE_ORIGIN,
    FORGOT_PASSWORD_FIXTURE_OTP,
    installForgotPasswordFixtureShell,
} from './forgotPasswordFixtureShell';
import {
    openForgotPasswordFromLogin,
    runForgotPasswordResetAndLogin,
    submitForgotPasswordEmailRequestOnce,
    waitForForgotPasswordNewPasswordForm,
} from './forgotPasswordFlow';
import { waitForPasswordChangeSuccessAfterSubmit } from '../../mypage/changePassword/myPageChangePasswordFlow';
import { submitForgotPasswordNewPasswordOnce } from './forgotPasswordFlow';

test.describe.configure({ retries: 0 });

test('fixture happy path: leading-zero OTP, success message, customers visible', async ({ page }) => {
    await installForgotPasswordFixtureShell(page);
    await page.goto(`${FORGOT_PASSWORD_FIXTURE_ORIGIN}/login`);

    const result = await runForgotPasswordResetAndLogin(page, 'fixture-user@example.com', 'P@ssw0rd', {
            loginUrl: `${FORGOT_PASSWORD_FIXTURE_ORIGIN}/login`,
            waitForResetOtp: async () => FORGOT_PASSWORD_FIXTURE_OTP,
            verifyLoginAfterReset: async (pg) => {
                await pg.evaluate(() => {
                    (window as unknown as { __fixtureCompleteLogin: () => void }).__fixtureCompleteLogin();
                });
                await assertCustomersListInitReady(pg);
            },
        }
    );

    expect(result.password).toBe('P@ssw0rd');
});

test('fixture reset failure: missing success message fails the stage', async ({ page }) => {
    await installForgotPasswordFixtureShell(page, { suppressSuccess: true });
    await page.goto(`${FORGOT_PASSWORD_FIXTURE_ORIGIN}/login`);

    await openForgotPasswordFromLogin(page, `${FORGOT_PASSWORD_FIXTURE_ORIGIN}/login`);
    await submitForgotPasswordEmailRequestOnce(page, 'fixture-user@example.com');
    await waitForForgotPasswordNewPasswordForm(page);
    await submitForgotPasswordNewPasswordOnce(page, FORGOT_PASSWORD_FIXTURE_OTP, 'P@ssw0rd');

    await expect(waitForPasswordChangeSuccessAfterSubmit(page)).rejects.toThrow();
});