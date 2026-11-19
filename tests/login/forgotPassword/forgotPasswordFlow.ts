import { expect, type Page } from '@playwright/test';
import { assertCustomersListInitReady } from '../../accountRegistration/customerFlow';
import {
    submitChangeNewPasswordOnce,
    waitForPasswordChangeSuccessAfterSubmit,
} from '../../mypage/changePassword/myPageChangePasswordFlow';
import {
    assertChangePasswordSuccessContent,
    CHANGE_PASSWORD_SUCCESS_HEADLINE,
} from '../../mypage/changePassword/changePasswordSuccessContent';
import { waitForPasswordResetVerificationCode } from '../../../utils/gmail';
import { DEFAULT_PART2_LOGIN_ENV, loginExistingUserForPart2 } from '../existingUserLoginFlow';
import type { ForgotPasswordCredentials } from './forgotPasswordConfig';
import { ForgotPasswordFlowError } from './forgotPasswordErrors';

const ACTION_TIMEOUT_MS = 15000;
const FORM_READY_TIMEOUT_MS = 60000;

export const FORGOT_PASSWORD_LINK_BUTTON = 'パスワードを忘れた方はこちら';
export const FORGOT_PASSWORD_REQUEST_SEND_BUTTON = '送信する';
/** Staging reset-password OTP form submit (differs from My Page change-new-password 送 信). */
export const FORGOT_PASSWORD_REGISTER_PASSWORD_BUTTON = 'パスワードを登録する';
export const FORGOT_PASSWORD_RETURN_TO_LOGIN_PATTERN = /ログイン画面へ/;

export function forgotPasswordRegisterPasswordButton(page: Page) {
    return page.getByRole('button', {
        name: FORGOT_PASSWORD_REGISTER_PASSWORD_BUTTON,
        exact: true,
    });
}

export const RESET_PASSWORD_PATH = /\/reset-password\/?(?:\?|$)/;

export { CHANGE_PASSWORD_SUCCESS_HEADLINE as FORGOT_PASSWORD_SUCCESS_HEADLINE };

export type ForgotPasswordFlowResult = {
    email: string;
    password: string;
};

export type RunForgotPasswordFlowOptions = {
    waitForResetOtp?: (accountEmail: string, notBeforeEpochMs: number) => Promise<string>;
    verifyLoginAfterReset?: (page: Page, account: ForgotPasswordCredentials) => Promise<void>;
    loginUrl?: string;
};

async function dismissLoginOverlayIfPresent(page: Page): Promise<void> {
    const closeButton = page.locator('button', { hasText: 'とじる' });
    if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
    }
}

export async function openForgotPasswordFromLogin(
    page: Page,
    loginUrl: string = DEFAULT_PART2_LOGIN_ENV.loginUrl
): Promise<void> {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await dismissLoginOverlayIfPresent(page);
    await page.getByRole('button', { name: FORGOT_PASSWORD_LINK_BUTTON }).click();
    await expect(page).toHaveURL(RESET_PASSWORD_PATH, { timeout: ACTION_TIMEOUT_MS });
}

export async function submitForgotPasswordEmailRequestOnce(
    page: Page,
    accountEmail: string
): Promise<void> {
    const emailInput = page.getByRole('textbox', { name: 'メールアドレス' });
    await expect(emailInput).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(emailInput).toBeEmpty({ timeout: ACTION_TIMEOUT_MS });
    const sendButton = page.getByRole('button', { name: FORGOT_PASSWORD_REQUEST_SEND_BUTTON });
    await expect(sendButton).toBeDisabled({ timeout: ACTION_TIMEOUT_MS });
    await emailInput.fill(accountEmail);
    await expect(emailInput).toHaveValue(accountEmail);
    await expect(sendButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await sendButton.click();
}

/**
 * After OTP email request, staging opens the shared new-password form (OTP + two password fields).
 */
export async function waitForForgotPasswordNewPasswordForm(page: Page): Promise<void> {
    await expect
        .poll(
            async () => {
                const otpVisible = await page.locator('input[type="text"]').first().isVisible();
                const passwordCount = await page.locator('input[type="password"]').count();
                return otpVisible && passwordCount >= 2;
            },
            {
                timeout: FORM_READY_TIMEOUT_MS,
                message:
                    'Expected password-reset form with OTP text field and two password fields',
            }
        )
        .toBe(true);
    const passwordFields = page.locator('input[type="password"]');
    await expect(page.locator('input[type="text"]').first()).toBeEmpty({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(passwordFields.first()).toBeEmpty({ timeout: ACTION_TIMEOUT_MS });
    await expect(passwordFields.nth(1)).toBeEmpty({ timeout: ACTION_TIMEOUT_MS });
    await expect(forgotPasswordRegisterPasswordButton(page)).toBeDisabled({
        timeout: ACTION_TIMEOUT_MS,
    });
}

export async function submitForgotPasswordNewPasswordOnce(
    page: Page,
    otpCode: string,
    newPassword: string
): Promise<void> {
    await submitChangeNewPasswordOnce(page, otpCode, newPassword, {
        submitButton: { name: FORGOT_PASSWORD_REGISTER_PASSWORD_BUTTON, exact: true },
    });
}

export async function returnToLoginAfterForgotPasswordSuccess(page: Page): Promise<void> {
    await assertChangePasswordSuccessContent(page);
    const returnButton = page.getByRole('button', { name: FORGOT_PASSWORD_RETURN_TO_LOGIN_PATTERN });
    await expect(returnButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(returnButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await returnButton.click();
    await expect(page).toHaveURL(/\/login\/?(?:\?|$)/, { timeout: ACTION_TIMEOUT_MS });
}

export async function verifyLoginWithNewPasswordOnCustomers(
    page: Page,
    account: ForgotPasswordCredentials
): Promise<void> {
    await loginExistingUserForPart2(page, account);
    await assertCustomersListInitReady(page);
}

/**
 * Login → forgot password → OTP → new password → success → return to login → sign in → customers list.
 * Returns the updated password for downstream Part 1 steps (e.g. later Change Password to Password123).
 * Does not log OTPs or passwords.
 */
export async function runForgotPasswordResetAndLogin(
    page: Page,
    accountEmail: string,
    newPassword: string,
    options?: RunForgotPasswordFlowOptions
): Promise<ForgotPasswordFlowResult> {
    if (!accountEmail?.trim() || !newPassword) {
        throw new ForgotPasswordFlowError('Forgot Password flow requires account email and new password.');
    }

    const waitForOtp =
        options?.waitForResetOtp ??
        ((email, notBefore) => waitForPasswordResetVerificationCode(email, notBefore));

    await openForgotPasswordFromLogin(page, options?.loginUrl);

    const otpRequestStartedAt = Date.now();
    await submitForgotPasswordEmailRequestOnce(page, accountEmail);

    const otpCode = await waitForOtp(accountEmail, otpRequestStartedAt);
    await waitForForgotPasswordNewPasswordForm(page);
    await submitForgotPasswordNewPasswordOnce(page, otpCode, newPassword);
    await waitForPasswordChangeSuccessAfterSubmit(page);
    await returnToLoginAfterForgotPasswordSuccess(page);

    const updatedAccount: ForgotPasswordCredentials = {
        email: accountEmail,
        password: newPassword,
    };
    const verifyLogin =
        options?.verifyLoginAfterReset ?? verifyLoginWithNewPasswordOnCustomers;
    await verifyLogin(page, updatedAccount);

    return { email: accountEmail, password: newPassword };
}