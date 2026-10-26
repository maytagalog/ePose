import { expect, test, type Browser, type Page } from '@playwright/test';
import { login } from '../../../utils/login';
import { waitForPasswordResetVerificationCode } from '../../../utils/gmail';
import type { CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import {
    assertChangePasswordSuccessContent,
    returnToMyPageAfterPasswordChangeSuccess,
} from './changePasswordSuccessContent';
import {
    performChangePasswordConfirmationBoundary,
    performChangePasswordOtpRequestBoundary,
} from './changePasswordFlowBoundaries';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';
import {
    assertMyPageSignedInEmail,
    myPageReadOnlyPathname,
    navigateToMyPage,
    waitForAuthProfilePost,
    waitForMyPageReadOnlyReady,
} from '../profile/myPageProfileFlow';
import { validateSmokeNewPassword } from '../../e2e/shared/smokePasswordConfig';
import {
    createChangePasswordProgress,
    changePasswordProgressSnapshot,
} from './changePasswordProgress';
import { runChangePasswordVerificationOrchestration } from './changePasswordOrchestration';
import {
    ChangePasswordFlowError,
    ChangePasswordSessionInvalidatedError,
    ChangePasswordUncertainOutcomeError,
    ChangePasswordVerificationError,
    enrichChangePasswordFailure,
    uncertainSuccessScreenMessage,
} from './changePasswordErrors';

export {
    ChangePasswordFlowError,
    ChangePasswordSessionInvalidatedError,
    ChangePasswordVerificationError,
    ChangePasswordUncertainOutcomeError,
    enrichChangePasswordFailure,
} from './changePasswordErrors';

const ACTION_TIMEOUT_MS = 15000;
const CONFIRMATION_SUBMIT_TIMEOUT_MS = 60000;
const MAIN_SESSION_RECOVERY_TIMEOUT_MS = 60000;
const STG_MY_PAGE = 'https://app-stg.epose.com/my-page';

/**
 * Verified from tests/mypage/mypage.spec.ts (staging, legacy Change Password test):
 * - My Page → パスワード section → 編 集 (prefer myPagePasswordSection)
 * - input[type="email"] for account email; 送 信 disabled until filled
 * - Gmail: subject 認証コードをお送りします + body パスワード再設定
 * - OTP route: /my-page/change-new-password
 * - Success: 新しいパスワードを設定しました。 + required マイページへもどる → /my-page
 */

export const CHANGE_PASSWORD_NEW_PATH =
    'https://app-stg.epose.com/my-page/change-new-password';
export const CHANGE_PASSWORD_NEW_URL = /\/my-page\/change-new-password\/?(?:\?|$)/;

export function myPagePasswordSection(page: Page) {
    return page
        .locator('div')
        .filter({ has: page.getByText('パスワード', { exact: true }) })
        .filter({ has: page.getByRole('button', { name: /編\s*集/ }) })
        .filter({ hasNot: page.getByText('メールアドレス', { exact: true }) })
        .filter({ hasNot: page.getByText('プロフィール', { exact: true }) });
}

function changePasswordRequestEmailInput(page: Page) {
    return page.locator('input[type="email"]');
}

async function openChangePasswordRequestFromMyPage(
    page: Page,
    accountEmail: string
): Promise<void> {
    await waitForMyPageReadOnlyReady(page);
    await assertMyPageSignedInEmail(page, accountEmail);
    const passwordBlock = myPagePasswordSection(page);
    await expect(
        passwordBlock,
        'Expected exactly one My Page password section (パスワード row)'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await passwordBlock.getByRole('button', { name: /編\s*集/ }).click();
    const emailInput = changePasswordRequestEmailInput(page);
    await expect(emailInput).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(emailInput).toBeEmpty({ timeout: ACTION_TIMEOUT_MS });
    await expect(page.getByRole('button', { name: /送\s*信/ })).toBeDisabled({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function submitPasswordOtpRequestOnce(page: Page, accountEmail: string): Promise<void> {
    const emailInput = changePasswordRequestEmailInput(page);
    await emailInput.fill(accountEmail);
    await expect(emailInput).toHaveValue(accountEmail);
    const sendButton = page.getByRole('button', { name: /送\s*信/ });
    await expect(sendButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await sendButton.click();
}

async function openChangeNewPasswordRoute(page: Page): Promise<void> {
    if (!CHANGE_PASSWORD_NEW_URL.test(new URL(page.url()).pathname)) {
        await page.goto(CHANGE_PASSWORD_NEW_PATH, { waitUntil: 'domcontentloaded' });
    }
    await assertChangeNewPasswordFormReady(page);
}

export async function assertChangeNewPasswordFormReady(page: Page): Promise<void> {
    if (page.url().includes('/login')) {
        throw new ChangePasswordFlowError(
            'Change Password confirmation redirected to /login before OTP entry.'
        );
    }
    await expect(page).toHaveURL(CHANGE_PASSWORD_NEW_URL, { timeout: ACTION_TIMEOUT_MS });
    await expect(page.locator('input[type="text"]')).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const passwordFields = page.locator('input[type="password"]');
    await expect(passwordFields.first()).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(passwordFields.nth(1)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(passwordFields.first()).toBeEmpty({ timeout: ACTION_TIMEOUT_MS });
    await expect(passwordFields.nth(1)).toBeEmpty({ timeout: ACTION_TIMEOUT_MS });
    await expect(page.getByRole('button', { name: /送\s*信/ })).toBeDisabled({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function submitChangeNewPasswordOnce(
    page: Page,
    otpCode: string,
    newPassword: string
): Promise<void> {
    const otpInput = page.locator('input[type="text"]');
    await otpInput.fill(otpCode);
    await expect(otpInput).toHaveValue(otpCode);
    const passwordFields = page.locator('input[type="password"]');
    await passwordFields.first().fill(newPassword);
    await passwordFields.nth(1).fill(newPassword);
    await expect(passwordFields.first()).toHaveValue(newPassword);
    await expect(passwordFields.nth(1)).toHaveValue(newPassword);
    const sendButton = page.getByRole('button', { name: /送\s*信/ });
    await expect(sendButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await sendButton.click();
}

export async function waitForPasswordChangeSuccessAfterSubmit(page: Page): Promise<void> {
    try {
        await expect(async () => {
            await assertChangePasswordSuccessContent(page);
        }).toPass({ timeout: CONFIRMATION_SUBMIT_TIMEOUT_MS });
    } catch (cause) {
        throw new ChangePasswordUncertainOutcomeError(uncertainSuccessScreenMessage(), { cause });
    }
}

/**
 * After マイページへもどる on the same tab: fail clearly if the app sent the user to /login
 * instead of preserving the session (no goto/re-login bypass).
 */
export async function assertMainSessionAuthenticatedAfterPasswordReturn(
    page: Page,
    expectedEmail: string
): Promise<void> {
    if (page.url().includes('/login')) {
        throw new ChangePasswordSessionInvalidatedError(
            'Original browser session is on /login immediately after マイページへもどる. ' +
                'The application may invalidate sessions when the password changes. ' +
                'Smoke automation does not re-login to hide this behavior.'
        );
    }
    await waitForMyPageReadOnlyReady(page);
    await assertMyPageSignedInEmail(page, expectedEmail);
}

export async function verifyAccountWithNewPasswordInFreshContext(
    browser: Browser,
    account: SmokeAccountRef
): Promise<void> {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 60000 });
        const profileResponsePromise = waitForAuthProfilePost(page);
        await page.goto(STG_MY_PAGE, { waitUntil: 'domcontentloaded' });
        const profile = await profileResponsePromise;
        if (profile.email !== account.email) {
            throw new ChangePasswordVerificationError(
                `Fresh login auth/profile email ${JSON.stringify(profile.email)} !== ${JSON.stringify(account.email)}`
            );
        }
        await waitForMyPageReadOnlyReady(page);
        await assertMyPageSignedInEmail(page, account.email);
    } finally {
        await context.close();
    }
}

export type MainSessionConcreteOutcome = 'pending' | 'login_form' | 'authenticated_my_page';

export async function detectMainSessionConcreteOutcome(
    page: Page,
    accountEmail: string
): Promise<MainSessionConcreteOutcome> {
    const url = page.url();
    if (url.includes('/login')) {
        const emailField = page.getByRole('textbox', { name: 'メールアドレス' });
        const passwordField = page.getByRole('textbox', { name: 'パスワード' });
        const loginFormReady =
            (await emailField.isVisible().catch(() => false)) &&
            (await passwordField.isVisible().catch(() => false));
        return loginFormReady ? 'login_form' : 'pending';
    }
    if (myPageReadOnlyPathname(new URL(url).pathname)) {
        try {
            await waitForMyPageReadOnlyReady(page);
            await assertMyPageSignedInEmail(page, accountEmail);
            return 'authenticated_my_page';
        } catch {
            return 'pending';
        }
    }
    return 'pending';
}

export async function waitForMainSessionConcreteOutcome(
    page: Page,
    accountEmail: string,
    timeoutMs: number = MAIN_SESSION_RECOVERY_TIMEOUT_MS
): Promise<'login_form' | 'authenticated_my_page'> {
    let resolved: 'login_form' | 'authenticated_my_page' | undefined;
    await expect(async () => {
        const outcome = await detectMainSessionConcreteOutcome(page, accountEmail);
        expect(outcome, 'URL match alone is insufficient — wait for My Page UI or login form').not.toBe(
            'pending'
        );
        resolved = outcome as 'login_form' | 'authenticated_my_page';
    }).toPass({ timeout: timeoutMs });
    return resolved!;
}

async function reauthenticateMainSessionWithNewPassword(
    page: Page,
    account: SmokeAccountRef
): Promise<void> {
    await waitForMainSessionConcreteOutcome(page, account.email, MAIN_SESSION_RECOVERY_TIMEOUT_MS);
    await expect(page).toHaveURL(/\/login/, { timeout: ACTION_TIMEOUT_MS });
    await login(page, {
        email: account.email,
        password: account.password,
        skipNavigation: true,
    });
    await page.waitForURL(/\/customers/, { timeout: 60000 });
}

/**
 * Navigate to My Page and recover when the app redirects to /login during navigation.
 * Uses only the new password — never the previous password.
 */
export type MainSessionRecoveryOptions = {
    /** Test injection only — production uses login() with the new password. */
    reauthenticate?: (page: Page, account: SmokeAccountRef) => Promise<void>;
};

export async function recoverMainSessionAfterPasswordChange(
    page: Page,
    account: SmokeAccountRef,
    recoveryOptions?: MainSessionRecoveryOptions
): Promise<void> {
    await page.goto(STG_MY_PAGE, { waitUntil: 'domcontentloaded' });
    let outcome = await waitForMainSessionConcreteOutcome(
        page,
        account.email,
        MAIN_SESSION_RECOVERY_TIMEOUT_MS
    );

    if (outcome === 'login_form') {
        if (recoveryOptions?.reauthenticate) {
            await recoveryOptions.reauthenticate(page, account);
        } else {
            await reauthenticateMainSessionWithNewPassword(page, account);
        }
        await page.goto(STG_MY_PAGE, { waitUntil: 'domcontentloaded' });
        outcome = await waitForMainSessionConcreteOutcome(
            page,
            account.email,
            MAIN_SESSION_RECOVERY_TIMEOUT_MS
        );
    }

    if (outcome !== 'authenticated_my_page') {
        throw new ChangePasswordVerificationError(
            'Main session recovery did not reach authenticated My Page with the expected email after using the new password.'
        );
    }
}

async function attachFailureEvidence(
    page: Page,
    evidence: CustomerFlowEvidence | undefined,
    label: string,
    extra?: Record<string, unknown>
): Promise<void> {
    if (!evidence) {
        return;
    }
    if (extra) {
        await evidence.attachJson(`${label}-context`, extra);
    }
    await evidence.attachScreenshot(label);
    await evidence.attachPageHtml(`${label}-dom`);
}

export type ChangePasswordFlowOptions = {
    browser?: Browser;
    evidence?: CustomerFlowEvidence;
    /** Separate explicit check; requires browser. Not part of default smoke. */
    verifyNewPasswordViaFreshContext?: boolean;
    /** Legacy continuation only; performs goto + re-login and masks same-tab logout. */
    recoverMainSessionAfterFreshVerify?: boolean;
};

export async function runMyPageChangePasswordAndVerify(
    page: Page,
    account: SmokeAccountRef,
    newPassword: string,
    options: ChangePasswordFlowOptions = {}
): Promise<SmokeAccountRef> {
    const progress = createChangePasswordProgress();
    const accountEmail = account.email;

    const logProgress = (patch: Partial<ReturnType<typeof changePasswordProgressSnapshot>>) => {
        console.log('CHANGE_PASSWORD_PROGRESS', JSON.stringify({ accountEmail, ...patch }));
    };

    try {
        return await test.step('change password: orchestrated flow', async () => {
            console.log(
                'CHANGE_PASSWORD_INTENT',
                JSON.stringify({ accountEmail, otpRequested: false })
            );
            if (options.evidence) {
                await options.evidence.attachJson('CHANGE_PASSWORD_INTENT', { accountEmail });
            }

            const orchestrationOptions = {
                verifyNewPasswordViaFreshContext:
                    options.verifyNewPasswordViaFreshContext === true,
                recoverMainSessionAfterFreshVerify:
                    options.recoverMainSessionAfterFreshVerify === true,
            };
            if (orchestrationOptions.verifyNewPasswordViaFreshContext && !options.browser) {
                throw new ChangePasswordFlowError(
                    'verifyNewPasswordViaFreshContext requires a Browser instance.'
                );
            }

            const result = await runChangePasswordVerificationOrchestration({
                account,
                newPassword,
                progress,
                options: orchestrationOptions,
                deps: {
                    openMyPageAndVerifyEmail: async () => {
                        await navigateToMyPage(page, { expectedEmail: accountEmail });
                        await assertMyPageSignedInEmail(page, accountEmail);
                    },
                    openPasswordRequestForm: () =>
                        openChangePasswordRequestFromMyPage(page, accountEmail),
                    submitOtpRequestOnce: async () => {
                        await performChangePasswordOtpRequestBoundary({
                            submitOtpRequest: () =>
                                submitPasswordOtpRequestOnce(page, accountEmail),
                        });
                    },
                    waitForPasswordResetOtp: (notBefore) =>
                        waitForPasswordResetVerificationCode(accountEmail, notBefore),
                    openConfirmationRoute: () => openChangeNewPasswordRoute(page),
                    submitConfirmationOnce: async (otpCode) => {
                        await performChangePasswordConfirmationBoundary({
                            submitConfirmation: () =>
                                submitChangeNewPasswordOnce(page, otpCode, newPassword),
                        });
                    },
                    waitForSuccessUi: () => waitForPasswordChangeSuccessAfterSubmit(page),
                    completeSuccessNavigation: () =>
                        returnToMyPageAfterPasswordChangeSuccess(page, accountEmail),
                    assertMainSessionAuthenticatedAfterReturn: () =>
                        assertMainSessionAuthenticatedAfterPasswordReturn(page, accountEmail),
                    verifyFreshContextLogin:
                        options.browser &&
                        (orchestrationOptions.verifyNewPasswordViaFreshContext ||
                            orchestrationOptions.recoverMainSessionAfterFreshVerify)
                            ? (updated) =>
                                  verifyAccountWithNewPasswordInFreshContext(
                                      options.browser!,
                                      updated
                                  )
                            : undefined,
                    recoverMainSession:
                        orchestrationOptions.recoverMainSessionAfterFreshVerify
                            ? (verified) =>
                                  recoverMainSessionAfterPasswordChange(page, verified)
                            : undefined,
                },
            });

            logProgress(changePasswordProgressSnapshot(accountEmail, progress));
            return result;
        });
    } catch (err) {
        await attachFailureEvidence(page, options.evidence, 'change-password-failure', {
            ...changePasswordProgressSnapshot(accountEmail, progress),
        });
        throw err;
    }
}
