import { expect, test, type Page } from '@playwright/test';
import { waitForChangeEmailVerificationCode } from '../../../utils/gmail';
import {
    finalizeChangeEmailAccountAfterSuccess,
    performChangeEmailConfirmationBoundary,
    performChangeEmailOtpRequestBoundary,
} from './changeEmailFlowBoundaries';
import type { ChangeEmailSessionContext } from './changeEmailOrchestration';
import type { ChangeEmailRecoverySessionContext } from './changeEmailRecoveryOrchestration';
import { otpRequestNotBeforeEpochMs } from './changeEmailRecovery';
import { readChangeEmailState } from './changeEmailState';
import type { CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { assertChangeEmailOtpInstructionsContainer } from './changeEmailOtpInstructions';
import {
    assertChangeEmailSuccessContent,
    CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL,
} from './changeEmailSuccessContent';
import {
    assertMyPageSignedInEmail,
    gotoMyPageReadOnly,
    myPageEmailAddressBlock,
    myPageReadOnlyPathname,
    waitForMyPageReadOnlyReady,
} from '../profile/myPageProfileFlow';

export { CHANGE_EMAIL_OTP_UI_VALIDITY_COPY } from './changeEmailOtpInstructions';

const ACTION_TIMEOUT_MS = 15000;
const CHANGE_EMAIL_OTP_URL = /\/my-page\/change-email-confirmation-code\/?(?:\?|$)/;
const CHANGE_EMAIL_CONFIRMATION_PATH =
    'https://app-stg.epose.com/my-page/change-email-confirmation-code';
const CHANGE_EMAIL_NEW_ADDRESS_PATH = /\/my-page\/change-email-address\/?(?:\?|$)/;

/** Observed when a fresh session cannot resume OTP confirmation (not proof of OTP expiry). */
export const CHANGE_EMAIL_CONFIRMATION_FLOW_UNAVAILABLE_DIAGNOSTIC =
    'CONFIRMATION_FLOW_UNAVAILABLE_IN_SESSION: navigated to /my-page/change-email-address instead of OTP confirmation. This does not prove the OTP expired; the pending change is not resumable through this UI path in the current session.';

/**
 * Verified from tests/mypage/mypage.spec.ts (staging, legacy Change Email test):
 * - My Page → メールアドレス section → second global 編 集 (prefer email block 編 集)
 * - Current email visible; input[type="email"] for new address; 送 信 disabled until filled
 * - OTP route: /my-page/change-email-confirmation-code; input[type="text"]; 送 信
 * - Success: 新しいメールアドレスを設定しました。 + new email visible; マイページへもどる
 * - Same session after success in legacy test (no re-login observed)
 *
 * Staging observation (not re-run this pass): success screen exposes マイページへもどる (legacy).
 * Assumption: OTP route follows 送 信 on new-email form (URL wait in helper).
 * Assumption: session remains signed in after success (legacy); no automatic re-login path implemented.
 */

export type SmokeAccountRef = {
    email: string;
    password: string;
};

export class ChangeEmailFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChangeEmailFlowError';
    }
}

export class ChangeEmailPersistenceVerificationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChangeEmailPersistenceVerificationError';
    }
}

async function openChangeEmailFormFromMyPage(
    page: Page,
    currentEmail: string
): Promise<void> {
    await waitForMyPageReadOnlyReady(page);
    const emailBlock = myPageEmailAddressBlock(page);
    await expect(emailBlock).toHaveCount(1);
    await emailBlock.getByRole('button', { name: /編\s*集/ }).click();
    await expect(page.getByText(currentEmail, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const newEmailInput = page.locator('input[type="email"]');
    await expect(newEmailInput).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(newEmailInput).toBeEmpty({ timeout: ACTION_TIMEOUT_MS });
    await expect(page.getByRole('button', { name: /送\s*信/ })).toBeDisabled({
        timeout: ACTION_TIMEOUT_MS,
    });
}

export async function assertChangeEmailOtpConfirmationPageReady(
    page: Page,
    pendingTargetEmail: string
): Promise<void> {
    if (page.url().includes('/login')) {
        throw new ChangeEmailFlowError(
            'Change Email OTP confirmation redirected to /login. Pending server transaction may have expired or session is missing.'
        );
    }
    if (CHANGE_EMAIL_NEW_ADDRESS_PATH.test(new URL(page.url()).pathname)) {
        throw new ChangeEmailFlowError(CHANGE_EMAIL_CONFIRMATION_FLOW_UNAVAILABLE_DIAGNOSTIC);
    }
    await expect(
        page,
        'Expected OTP confirmation route without redirect away from change-email-confirmation-code'
    ).toHaveURL(CHANGE_EMAIL_OTP_URL, { timeout: ACTION_TIMEOUT_MS });
    await expect(page.locator('input[type="text"]')).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(page.getByRole('button', { name: /送\s*信/ })).toBeDisabled({
        timeout: ACTION_TIMEOUT_MS,
    });
    await assertChangeEmailOtpInstructionsContainer(page, pendingTargetEmail);
}

async function openOtpConfirmationRouteWithoutSend(
    page: Page,
    pendingTargetEmail: string
): Promise<void> {
    await page.goto(CHANGE_EMAIL_CONFIRMATION_PATH, {
        waitUntil: 'domcontentloaded',
    });
    await assertChangeEmailOtpConfirmationPageReady(page, pendingTargetEmail);
}

async function submitNewEmailOnce(page: Page, targetEmail: string): Promise<void> {
    const newEmailInput = page.locator('input[type="email"]');
    await newEmailInput.fill(targetEmail);
    await expect(newEmailInput).toHaveValue(targetEmail);
    const sendButton = page.getByRole('button', { name: /送\s*信/ });
    await expect(sendButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await sendButton.click();
    await expect(page).toHaveURL(CHANGE_EMAIL_OTP_URL, { timeout: 60000 });
    await expect(page.locator('input[type="text"]')).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(page.getByRole('button', { name: /送\s*信/ })).toBeDisabled({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function submitOtpOnce(page: Page, otpCode: string, targetEmail: string): Promise<void> {
    const otpInput = page.locator('input[type="text"]');
    await otpInput.fill(otpCode);
    await expect(otpInput).toHaveValue(otpCode);
    const sendButton = page.getByRole('button', { name: /送\s*信/ });
    await expect(sendButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await sendButton.click();
    await assertChangeEmailSuccessContent(page, targetEmail);
}

export async function returnToMyPageAfterChangeSuccess(
    page: Page,
    newEmail: string
): Promise<void> {
    await assertChangeEmailSuccessContent(page, newEmail);
    const region = page.locator('[data-e2e-change-email-success-region]');
    const backButton = region.getByRole('button', {
        name: CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL,
    });
    await expect(backButton).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(backButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await backButton.click();
    await expect(
        page,
        'マイページへもどる must navigate to read-only /my-page (no silent goto fallback)'
    ).toHaveURL((url) => myPageReadOnlyPathname(new URL(url).pathname), {
        timeout: ACTION_TIMEOUT_MS,
    });
    await waitForMyPageReadOnlyReady(page);
    await assertMyPageSignedInEmail(page, newEmail);
}

async function ensureSignedInForMyPage(
    page: Page,
    account: SmokeAccountRef,
    expectedEmail: string
): Promise<void> {
    if (page.url().includes('/login')) {
        throw new ChangeEmailFlowError(
            'Change Email expected an active session on My Page but /login is shown. Re-login after email change is not implemented in this helper.'
        );
    }
    await gotoMyPageReadOnly(page);
    await assertMyPageSignedInEmail(page, expectedEmail);
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

/**
 * Change Email smoke: one target from two-dot pool, one OTP send, one confirmation, one fresh-load check.
 */
export async function runMyPageChangeEmailAndVerify(
    page: Page,
    account: SmokeAccountRef,
    session: ChangeEmailSessionContext,
    evidence?: CustomerFlowEvidence
): Promise<SmokeAccountRef> {
    const { currentEmail } = { currentEmail: account.email };
    const { targetEmail, targetIndex } = session;

    try {
        await test.step('change email: verify signed-in email on my-page', async () => {
            await ensureSignedInForMyPage(page, account, currentEmail);
        });

        await test.step('change email: open change-email form', async () => {
            console.log(
                'CHANGE_EMAIL_INTENT',
                JSON.stringify({ currentEmail, targetEmail, targetIndex })
            );
            if (evidence) {
                await evidence.attachJson('CHANGE_EMAIL_INTENT', {
                    currentEmail,
                    targetEmail,
                    targetIndex,
                    runId: session.runId,
                });
            }
            await openChangeEmailFormFromMyPage(page, currentEmail);
        });

        let otpRequestStartedAt = 0;
        await test.step('change email: submit new address once', async () => {
            otpRequestStartedAt = Date.now();
            await performChangeEmailOtpRequestBoundary({
                persistOtpRequestSubmitted: () => session.persistOtpRequestSubmitted(),
                submitNewEmail: () => submitNewEmailOnce(page, targetEmail),
            });
        });

        await test.step('change email: confirm OTP once', async () => {
            const otpCode = await waitForChangeEmailVerificationCode(
                targetEmail,
                otpRequestStartedAt
            );
            await performChangeEmailConfirmationBoundary({
                persistConfirmationSubmitted: () => session.persistConfirmationSubmitted(),
                submitConfirmation: async () => {
                    await submitOtpOnce(page, otpCode, targetEmail);
                    await returnToMyPageAfterChangeSuccess(page, targetEmail);
                },
            });
        });

        return await test.step('change email: fresh load verification and commit', async () => {
            return finalizeChangeEmailAccountAfterSuccess({
                account,
                targetEmail,
                verifyFreshLoad: async () => {
                    await gotoMyPageReadOnly(page);
                    try {
                        await assertMyPageSignedInEmail(page, targetEmail);
                    } catch (err) {
                        throw new ChangeEmailPersistenceVerificationError(
                            `Fresh load did not show new email ${targetEmail}: ${err}`
                        );
                    }
                },
                commitChangeEmailSuccess: () => session.commitChangeEmailSuccess(),
            });
        });
    } catch (err) {
        let pendingPhase = 'unknown';
        try {
            const state = readChangeEmailState(
                session.statePath,
                session.localBase,
                session.domain,
                { allowUnresolvedPending: true }
            );
            pendingPhase = state.pendingChange?.phase ?? 'none';
        } catch {
            pendingPhase = 'state-unreadable';
        }
        await attachFailureEvidence(page, evidence, 'change-email-failure', {
            currentEmail,
            targetEmail,
            pendingPhase,
        });
        throw err;
    }
}

/**
 * Resume after otp_request_submitted: no new-email Send, Gmail filtered from original OTP request time.
 */
export async function runMyPageChangeEmailRecoveryAndVerify(
    page: Page,
    account: SmokeAccountRef,
    session: ChangeEmailRecoverySessionContext,
    evidence?: CustomerFlowEvidence
): Promise<SmokeAccountRef> {
    const currentEmail = session.currentEmail;
    const { targetEmail, targetIndex } = session;

    try {
        await test.step('change email recovery: verify signed-in current email', async () => {
            await ensureSignedInForMyPage(page, account, currentEmail);
        });

        await test.step('change email recovery: open OTP confirmation without resend', async () => {
            if (evidence) {
                await evidence.attachJson('CHANGE_EMAIL_RECOVERY_INTENT', {
                    currentEmail,
                    targetEmail,
                    targetIndex,
                    pendingRunId: session.runId,
                    otpRequestSubmittedAt: session.otpRequestSubmittedAt,
                });
            }
            await openOtpConfirmationRouteWithoutSend(page, targetEmail);
        });

        await test.step('change email recovery: confirm OTP once', async () => {
            await assertChangeEmailOtpConfirmationPageReady(page, targetEmail);
            const notBefore = otpRequestNotBeforeEpochMs(session.pending);
            const otpCode = await waitForChangeEmailVerificationCode(
                targetEmail,
                notBefore
            );
            await performChangeEmailConfirmationBoundary({
                persistConfirmationSubmitted: () => session.persistConfirmationSubmitted(),
                submitConfirmation: async () => {
                    await submitOtpOnce(page, otpCode, targetEmail);
                    await returnToMyPageAfterChangeSuccess(page, targetEmail);
                },
            });
        });

        return await test.step('change email recovery: fresh load verification and commit', async () => {
            return finalizeChangeEmailAccountAfterSuccess({
                account,
                targetEmail,
                verifyFreshLoad: async () => {
                    await gotoMyPageReadOnly(page);
                    try {
                        await assertMyPageSignedInEmail(page, targetEmail);
                    } catch (err) {
                        throw new ChangeEmailPersistenceVerificationError(
                            `Fresh load did not show new email ${targetEmail}: ${err}`
                        );
                    }
                },
                commitChangeEmailSuccess: () => session.commitChangeEmailSuccess(),
            });
        });
    } catch (err) {
        let pendingPhase = 'unknown';
        try {
            const state = readChangeEmailState(
                session.statePath,
                session.localBase,
                session.domain,
                { allowUnresolvedPending: true }
            );
            pendingPhase = state.pendingChange?.phase ?? 'none';
        } catch {
            pendingPhase = 'state-unreadable';
        }
        await attachFailureEvidence(page, evidence, 'change-email-recovery-failure', {
            currentEmail,
            targetEmail,
            pendingPhase,
        });
        throw err;
    }
}
