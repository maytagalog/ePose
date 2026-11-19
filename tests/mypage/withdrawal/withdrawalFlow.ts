import {
    expect,
    test,
    type Browser,
    type BrowserContext,
    type Locator,
    type Page,
    type Response,
} from '@playwright/test';
import { newStagingSmokeBrowserContextOptions } from '../../e2e/shared/stagingSmokeBrowserContext';
import type { CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';
import {
    assertMyPageSignedInEmail,
    navigateToMyPage,
    waitForMyPageReadOnlyReady,
} from '../profile/myPageProfileFlow';
import {
    GET_CONTRACT_SUBSCRIPTION_URL,
    STG_CONTRACT_URL,
    assertContractInformationReady,
    captureContractSubscriptionBodyForTrigger,
    parseSubscriptionEnvelope,
    parseSubscriptionPeriodNode,
    subscriptionPeriodIsActivePaidCurrent,
} from '../../accountPayment/creditCard/planPurchaseFlow';
import { STG_APP_ORIGIN } from '../../referralCoupon/referralCouponFlow';
import {
    pickResponseCorrelationHeaders,
    sanitizeApiResponseBody,
} from '../../e2e/shared/smokeDiagnosticSanitize';
import { summarizeSubscriptionForDiagnostics } from '../../e2e/shared/withdrawalSubscriptionDiagnostics';

const ACTION_TIMEOUT_MS = 15000;
const WITHDRAWAL_HYDRATION_TIMEOUT_MS = 60000;
const LOGIN_REDIRECT_TIMEOUT_MS = 90000;
/** Rejected-login probe after account deletion (UI actions only). */
const REJECTED_LOGIN_UI_TIMEOUT_MS = ACTION_TIMEOUT_MS;
const REJECTED_LOGIN_API_TIMEOUT_MS = WITHDRAWAL_HYDRATION_TIMEOUT_MS;

function logRejectedLoginBoundary(
    step: string,
    payload?: Record<string, unknown>
): void {
    console.log(
        'WITHDRAWAL_REJECTED_LOGIN_BOUNDARY',
        JSON.stringify({ step, ...(payload ?? {}) })
    );
}

export const STG_LOGIN_URL = 'https://app-stg.epose.com/login';
export const STG_MY_PAGE_URL = 'https://app-stg.epose.com/my-page';
export const STG_MY_PAGE_UNSUBSCRIBE_URL = 'https://app-stg.epose.com/my-page/unsubscribe';
export const STG_MY_PAGE_UNSUBSCRIBE_REASON_URL =
    'https://app-stg.epose.com/my-page/unsubscribe/reason';
export const STG_MY_PAGE_UNSUBSCRIBE_COMPLETED_URL =
    'https://app-stg.epose.com/my-page/unsubscribe/completed';

export function contractPageUrlForOrigin(pageOrigin: string): string {
    if (pageOrigin === STG_APP_ORIGIN) {
        return STG_CONTRACT_URL;
    }
    return `${pageOrigin.replace(/\/$/, '')}/contract`;
}

/** Bundle: ContractRepository.cancelAutoRenewal → PATCH cancel_auto_renewal. */
export const PATCH_CANCEL_AUTO_RENEWAL_URL =
    'https://api-stg.epose.com/contract/cancel_auto_renewal';
export const POST_INSERT_UNSUBSCRIBED_REASON_URL =
    'https://api-stg.epose.com/menu/insert_unsubscribed_reason';
export const POST_AUTH_DELETE_ACCOUNT_URL = 'https://api-stg.epose.com/auth/delete';
export const POST_AUTH_LOGIN_URL = 'https://api-stg.epose.com/auth/login';

export const MY_PAGE_UNSUBSCRIBE_LINK_LABEL = '退会のお手続きはこちら';
export const CANNOT_DELETE_DIALOG_TITLE = '自動更新の停止が必要です';
export const CANNOT_DELETE_CONTRACT_BUTTON = 'ご契約情報へ';
export const CONTRACT_AUTO_RENEWAL_SECTION_LABEL = 'お支払いの自動更新';
export const STOP_AUTO_RENEWAL_BUTTON = '自動更新を停止する(解約)';
export const STOP_RENEWAL_AGREE_LABEL = '同意する';
export const STOP_RENEWAL_SUBMIT_BUTTON = '停止する';
export const AUTO_RENEWAL_STOPPED_MESSAGE = '自動更新を停止しました。';
export const UNSUBSCRIBE_PAGE_TITLE = '退会';
export const UNSUBSCRIBE_INTRO_BUTTON = '退会する';
export const UNSUBSCRIBE_REASON_OTHER = 'その他';
export const UNSUBSCRIBE_REASON_NEXT = '次へ';
export const UNSUBSCRIBE_FINAL_BUTTON = '退会する';
export const UNSUBSCRIBE_REASON_TEXT = 'OTHERS';
/** Staging trace (2026-10-25): confirmation modal on `/my-page/unsubscribe/reason`. */
export const WITHDRAWAL_FINAL_CONFIRM_MODAL_TITLE = '確認';
export const WITHDRAWAL_FINAL_CONFIRM_MODAL_WARNING =
    '退会すると、データは全て削除されます。データの復旧はできません。';
export const WITHDRAWAL_FINAL_CONFIRM_MODAL_QUESTION = '本当に退会しますか？';
export const WITHDRAWAL_FINAL_CONFIRM_MODAL_CANCEL = 'キャンセル';
export const LOGIN_INVALID_CREDENTIALS_MESSAGE =
    'メールアドレスもしくはパスワードが正しくありません。';

/** Staging probe (2026-10-25): invalid credentials → HTTP 401 + InvalidParameter. */
export const LOGIN_REJECTED_CREDENTIALS_HTTP_STATUS = 401;
export const LOGIN_REJECTED_CREDENTIALS_ERROR_CODE = 'InvalidParameter';

export type AuthLoginErrorBody = {
    errors?: Array<{
        message?: string;
        extensions?: { errorCode?: string; statusCode?: number };
    }>;
};

export type WithdrawalFlowOptions = {
    /** Fixture seam: expected app origin (default {@link STG_APP_ORIGIN}). */
    pageOrigin?: string;
    /** Explicit login URL for fresh-context rejected-login probe (default staging /login). */
    loginUrl?: string;
    /** Required for post-deletion rejected-login verification (isolated browser context). */
    browser?: Browser;
    /** Install fixture/API routes on the fresh rejected-login context (same as main session). */
    prepareRejectedLoginContext?: (context: BrowserContext) => Promise<void>;
    /**
     * Standalone only: verified at start — renewal already cancelled (`cancelAtPeriodEnd`).
     * Skips the paid-plan blocking dialog + stop-renewal sequence; fails if dialog appears unexpectedly.
     */
    renewalAlreadyDisabled?: boolean;
};

export type WithdrawalAccountDeletionEvidence = {
    accountEmail: string;
    finalPathname: string;
    deleteApiObserved: boolean;
    loginRouteReached: boolean;
};

export type RejectedLoginVerificationEvidence = {
    loginUrl: string;
    httpStatus: number;
    errorCode: string;
    invalidCredentialsMessageVisible: boolean;
    remainedOnLoginRoute: boolean;
    verificationMode: 'fresh_browser_context';
};

export type WithdrawalCancelAutoRenewalDiagnostics = {
    httpStatus: number;
    responseBodySanitized: string;
    requestUrl: string;
    responseHeaders: Record<string, string>;
    subscriptionBeforeStop: ReturnType<
        typeof import('../../e2e/shared/withdrawalSubscriptionDiagnostics').summarizeSubscriptionForDiagnostics
    >;
};

export class WithdrawalFlowError extends Error {
    readonly cancelAutoRenewalDiagnostics?: WithdrawalCancelAutoRenewalDiagnostics;

    constructor(
        message: string,
        options?: { cancelAutoRenewalDiagnostics?: WithdrawalCancelAutoRenewalDiagnostics }
    ) {
        super(message);
        this.name = 'WithdrawalFlowError';
        this.cancelAutoRenewalDiagnostics = options?.cancelAutoRenewalDiagnostics;
    }
}

export class WithdrawalSubmitGuard {
    private finalWithdrawalAttempted = false;

    markFinalWithdrawalAttempted(): void {
        if (this.finalWithdrawalAttempted) {
            throw new WithdrawalFlowError(
                'Final 退会する was already attempted; refusing a second destructive submission.'
            );
        }
        this.finalWithdrawalAttempted = true;
    }
}

export function unsubscribePageTitle(page: Page): Locator {
    return page.locator(
        `xpath=//div[normalize-space(.)='${UNSUBSCRIBE_PAGE_TITLE}' and not(ancestor-or-self::*[@role='dialog']) and not(.//div[normalize-space(.)='${UNSUBSCRIBE_PAGE_TITLE}'])]`
    );
}

async function assertExactlyOneVisibleUnsubscribeTitle(page: Page): Promise<void> {
    const candidates = unsubscribePageTitle(page);
    const count = await candidates.count();
    let visibleCount = 0;
    for (let index = 0; index < count; index += 1) {
        if (await candidates.nth(index).isVisible()) {
            visibleCount += 1;
        }
    }
    if (visibleCount !== 1) {
        throw new WithdrawalFlowError(
            `Expected exactly one visible "${UNSUBSCRIBE_PAGE_TITLE}" page title, saw ${visibleCount}.`
        );
    }
}

function cannotAccountDeleteDialog(page: Page): Locator {
    return page.getByRole('dialog').filter({
        has: page.getByText(CANNOT_DELETE_DIALOG_TITLE, { exact: true }),
    });
}

function stopAutoRenewalDialog(page: Page): Locator {
    return page.getByRole('dialog').filter({
        has: page.getByRole('button', { name: STOP_RENEWAL_SUBMIT_BUTTON, exact: true }),
    });
}

function isCancelAutoRenewalPatch(res: Response): boolean {
    return (
        res.url().startsWith(PATCH_CANCEL_AUTO_RENEWAL_URL) &&
        res.request().method() === 'PATCH'
    );
}

function isAuthDeleteAccountPost(res: Response): boolean {
    return (
        res.url().startsWith(POST_AUTH_DELETE_ACCOUNT_URL) &&
        res.request().method() === 'POST'
    );
}

function isAuthLoginPost(res: Response): boolean {
    return (
        res.url().startsWith(POST_AUTH_LOGIN_URL) &&
        res.request().method() === 'POST'
    );
}

async function readResponseJsonSafely(res: Response, label: string): Promise<unknown> {
    try {
        return await res.json();
    } catch (err) {
        throw new WithdrawalFlowError(
            `${label} response body unavailable (consume JSON before navigation): ${String(err)}`
        );
    }
}

export function assertInvalidCredentialsLoginResponse(
    httpStatus: number,
    body: unknown
): AuthLoginErrorBody {
    if (httpStatus === 429) {
        throw new WithdrawalFlowError(
            `Login returned HTTP 429 (rate limit); not treated as rejected credentials.`
        );
    }
    if (httpStatus >= 500) {
        throw new WithdrawalFlowError(
            `Login returned HTTP ${httpStatus} (server error); not treated as rejected credentials.`
        );
    }
    if (httpStatus !== LOGIN_REJECTED_CREDENTIALS_HTTP_STATUS) {
        throw new WithdrawalFlowError(
            `Expected withdrawn-account login HTTP ${LOGIN_REJECTED_CREDENTIALS_HTTP_STATUS}, got ${httpStatus}.`
        );
    }
    const parsed = body as AuthLoginErrorBody;
    const first = parsed?.errors?.[0];
    const errorCode = first?.extensions?.errorCode;
    const statusCode = first?.extensions?.statusCode;
    if (errorCode !== LOGIN_REJECTED_CREDENTIALS_ERROR_CODE) {
        throw new WithdrawalFlowError(
            `Expected login errorCode ${JSON.stringify(LOGIN_REJECTED_CREDENTIALS_ERROR_CODE)}, got ${JSON.stringify(errorCode)}.`
        );
    }
    if (statusCode !== LOGIN_REJECTED_CREDENTIALS_HTTP_STATUS) {
        throw new WithdrawalFlowError(
            `Expected login extensions.statusCode ${LOGIN_REJECTED_CREDENTIALS_HTTP_STATUS}, got ${JSON.stringify(statusCode)}.`
        );
    }
    return parsed;
}

export function assertSubscriptionRenewalDisabled(subscriptionBody: unknown): void {
    const { current } = parseSubscriptionEnvelope(subscriptionBody);
    if (!current) {
        throw new WithdrawalFlowError(
            'Subscription current period missing after stop-renewal; cannot verify cancelAtPeriodEnd.'
        );
    }
    const parsed = parseSubscriptionPeriodNode(current);
    if (!parsed) {
        throw new WithdrawalFlowError('Subscription current period shape was unexpected.');
    }
    if (!subscriptionPeriodIsActivePaidCurrent(parsed)) {
        throw new WithdrawalFlowError(
            `Expected active paid current subscription; got ${JSON.stringify(parsed)}`
        );
    }
    if (parsed.cancelAtPeriodEnd !== true) {
        throw new WithdrawalFlowError(
            `Expected cancelAtPeriodEnd true after stop-renewal; got ${JSON.stringify(parsed)}`
        );
    }
}

/** Ant Design final delete confirmation (trace: role=dialog, accessible name 確認). */
export function finalWithdrawalConfirmModalScope(page: Page): Locator {
    return page.getByRole('dialog', { name: WITHDRAWAL_FINAL_CONFIRM_MODAL_TITLE, exact: true });
}

async function openMyPageUnsubscribeLink(page: Page, account: SmokeAccountRef): Promise<void> {
    await navigateToMyPage(page);
    await waitForMyPageReadOnlyReady(page);
    await assertMyPageSignedInEmail(page, account.email);
    const link = page.getByText(MY_PAGE_UNSUBSCRIBE_LINK_LABEL, { exact: true });
    await expect(link).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await link.click();
}

async function assertUnsubscribeIntroReady(page: Page, pageOrigin: string): Promise<void> {
    await expect(page).toHaveURL(
        (url) => {
            const parsed = new URL(url);
            const path = parsed.pathname.replace(/\/$/, '') || '/';
            return parsed.origin === pageOrigin && path === '/my-page/unsubscribe';
        },
        { timeout: WITHDRAWAL_HYDRATION_TIMEOUT_MS }
    );
    await assertExactlyOneVisibleUnsubscribeTitle(page);
    await expect(
        page.getByRole('button', { name: UNSUBSCRIBE_INTRO_BUTTON, exact: true })
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
}

async function assertUnsubscribeReasonRoute(page: Page, pageOrigin: string): Promise<void> {
    await expect(page).toHaveURL(
        (url) => {
            const parsed = new URL(url);
            const path = parsed.pathname.replace(/\/$/, '') || '/';
            return parsed.origin === pageOrigin && path === '/my-page/unsubscribe/reason';
        },
        { timeout: WITHDRAWAL_HYDRATION_TIMEOUT_MS }
    );
}

async function handlePaidPlanBlockingDialogToContract(page: Page): Promise<void> {
    const dialog = cannotAccountDeleteDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const contractButton = dialog.getByRole('button', {
        name: CANNOT_DELETE_CONTRACT_BUTTON,
        exact: true,
    });
    await expect(contractButton).toHaveCount(1);

    const subscriptionBody = await captureContractSubscriptionBodyForTrigger(
        page,
        () => contractButton.click(),
        WITHDRAWAL_HYDRATION_TIMEOUT_MS
    );
    await page.waitForURL(
        (url) => new URL(url).pathname.replace(/\/$/, '') === '/contract',
        { timeout: WITHDRAWAL_HYDRATION_TIMEOUT_MS }
    );
    const { current } = parseSubscriptionEnvelope(subscriptionBody);
    const parsed = current ? parseSubscriptionPeriodNode(current) : null;
    if (!parsed || !subscriptionPeriodIsActivePaidCurrent(parsed)) {
        throw new WithdrawalFlowError(
            'Contract subscription was not an active paid plan when stopping auto-renewal.'
        );
    }
    if (parsed.cancelAtPeriodEnd === true) {
        throw new WithdrawalFlowError(
            'Expected auto-renewal still enabled before stop-renewal; cancelAtPeriodEnd was already true.'
        );
    }

    await assertContractInformationReady(page);
}

async function stopAutoRenewalOnContract(page: Page): Promise<{
    renewalStopAttempted: boolean;
    renewalStopVerified: boolean;
}> {
    const subscriptionBodyBeforeStop = await captureContractSubscriptionBodyForTrigger(
        page,
        () => page.reload({ waitUntil: 'domcontentloaded' }),
        WITHDRAWAL_HYDRATION_TIMEOUT_MS
    );
    const subscriptionBeforeStop = summarizeSubscriptionForDiagnostics(subscriptionBodyBeforeStop);

    await assertContractInformationReady(page);
    await expect(page.getByText(CONTRACT_AUTO_RENEWAL_SECTION_LABEL, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });

    const stopButton = page.getByRole('button', { name: STOP_AUTO_RENEWAL_BUTTON, exact: true });
    await expect(stopButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await stopButton.click();

    const dialog = stopAutoRenewalDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const agree = dialog.getByRole('checkbox', { name: STOP_RENEWAL_AGREE_LABEL });
    await expect(agree).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await agree.check();
    await expect(agree).toBeChecked();

    const submit = dialog.getByRole('button', { name: STOP_RENEWAL_SUBMIT_BUTTON, exact: true });
    await expect(submit).toHaveCount(1);

    const patchPromise = page
        .waitForResponse(isCancelAutoRenewalPatch, { timeout: WITHDRAWAL_HYDRATION_TIMEOUT_MS })
        .then(async (res) => {
            if (res.status() < 200 || res.status() >= 300) {
                const rawBody = await res.text().catch(() => '');
                const cancelAutoRenewalDiagnostics: WithdrawalCancelAutoRenewalDiagnostics = {
                    httpStatus: res.status(),
                    responseBodySanitized: sanitizeApiResponseBody(rawBody),
                    requestUrl: res.url(),
                    responseHeaders: pickResponseCorrelationHeaders(res.headers()),
                    subscriptionBeforeStop,
                };
                console.log(
                    'WITHDRAWAL_CANCEL_AUTO_RENEWAL_FAILED',
                    JSON.stringify(cancelAutoRenewalDiagnostics)
                );
                const snippet = sanitizeApiResponseBody(rawBody).slice(0, 500);
                throw new WithdrawalFlowError(
                    `PATCH ${PATCH_CANCEL_AUTO_RENEWAL_URL} returned HTTP ${res.status()}${snippet ? `: ${snippet}` : ''}`,
                    { cancelAutoRenewalDiagnostics }
                );
            }
            return readResponseJsonSafely(res, 'cancel_auto_renewal PATCH');
        });

    await Promise.all([patchPromise, submit.click()]);
    await patchPromise;
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    await expect(page.getByText(AUTO_RENEWAL_STOPPED_MESSAGE, { exact: true })).toBeVisible({
        timeout: WITHDRAWAL_HYDRATION_TIMEOUT_MS,
    });

    const subscriptionBody = await captureContractSubscriptionBodyForTrigger(
        page,
        () => page.reload({ waitUntil: 'domcontentloaded' }),
        WITHDRAWAL_HYDRATION_TIMEOUT_MS
    );
    assertSubscriptionRenewalDisabled(subscriptionBody);
    await assertContractInformationReady(page);
    return { renewalStopAttempted: true, renewalStopVerified: true };
}

async function assertUnsubscribeReasonFormReady(page: Page): Promise<void> {
    const otherReason = page.getByText(UNSUBSCRIBE_REASON_OTHER, { exact: true });
    await expect(otherReason).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    const nextButton = page.getByRole('button', { name: UNSUBSCRIBE_REASON_NEXT, exact: true });
    await expect(nextButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
}

async function completeUnsubscribeReasonEntry(page: Page): Promise<void> {
    const otherReason = page.getByText(UNSUBSCRIBE_REASON_OTHER, { exact: true });
    await otherReason.click();

    const reasonField = page.getByRole('textbox');
    await expect(reasonField).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await reasonField.fill(UNSUBSCRIBE_REASON_TEXT);
    await expect(reasonField).toHaveValue(UNSUBSCRIBE_REASON_TEXT);

    const nextButton = page.getByRole('button', { name: UNSUBSCRIBE_REASON_NEXT, exact: true });
    await expect(nextButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await nextButton.click();
}

async function assertFinalWithdrawalConfirmationReady(
    page: Page,
    pageOrigin: string
): Promise<void> {
    await assertUnsubscribeReasonRoute(page, pageOrigin);

    await expect(
        page.getByRole('button', { name: UNSUBSCRIBE_REASON_NEXT, exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const modal = finalWithdrawalConfirmModalScope(page);
    await expect(modal).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(modal).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(modal).toContainText(WITHDRAWAL_FINAL_CONFIRM_MODAL_WARNING);
    await expect(modal).toContainText(WITHDRAWAL_FINAL_CONFIRM_MODAL_QUESTION);

    await expect(
        modal.getByRole('button', { name: WITHDRAWAL_FINAL_CONFIRM_MODAL_CANCEL, exact: true })
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const finalButton = modal.getByRole('button', { name: UNSUBSCRIBE_FINAL_BUTTON, exact: true });
    await expect(finalButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(finalButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
}

async function submitFinalWithdrawalDelete(
    page: Page,
    account: SmokeAccountRef,
    submitGuard: WithdrawalSubmitGuard,
    onFinalDeleteAttempted?: () => void
): Promise<void> {
    const modal = finalWithdrawalConfirmModalScope(page);
    await expect(modal).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(modal).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const finalButton = modal.getByRole('button', { name: UNSUBSCRIBE_FINAL_BUTTON, exact: true });
    await expect(finalButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(finalButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });

    const deleteResponsePromise = page
        .waitForResponse(isAuthDeleteAccountPost, { timeout: WITHDRAWAL_HYDRATION_TIMEOUT_MS })
        .then(async (res) => {
            const requestEmail = (() => {
                try {
                    const body = res.request().postDataJSON() as { email?: unknown };
                    return typeof body?.email === 'string' ? body.email.trim() : null;
                } catch {
                    return null;
                }
            })();
            if (requestEmail !== account.email) {
                throw new WithdrawalFlowError(
                    `Delete account API email ${JSON.stringify(requestEmail)} did not match ${JSON.stringify(account.email)}.`
                );
            }
            if (res.status() < 200 || res.status() >= 300) {
                const snippet = (await res.text().catch(() => '')).slice(0, 500);
                throw new WithdrawalFlowError(
                    `POST ${POST_AUTH_DELETE_ACCOUNT_URL} returned HTTP ${res.status()}${snippet ? `: ${snippet}` : ''}`
                );
            }
            return readResponseJsonSafely(res, 'auth/delete POST');
        });

    submitGuard.markFinalWithdrawalAttempted();
    onFinalDeleteAttempted?.();
    console.log(
        'WITHDRAWAL_FINAL_DELETE_ATTEMPTED',
        JSON.stringify({ accountEmail: account.email })
    );
    await Promise.all([
        deleteResponsePromise,
        page.waitForURL(
            (url) => {
                const path = new URL(url).pathname.replace(/\/$/, '') || '/';
                return path === '/login' || path === '/my-page/unsubscribe/completed';
            },
            { timeout: LOGIN_REDIRECT_TIMEOUT_MS }
        ),
        finalButton.click(),
    ]);

    await deleteResponsePromise;

    await expect(page).toHaveURL(/\/login/, { timeout: LOGIN_REDIRECT_TIMEOUT_MS });
}

/** Session-invalid overlay on /login after account deletion (not withdrawal confirm modals). */
export function loginSessionExpiredDialogScope(page: Page): Locator {
    return page
        .getByRole('dialog')
        .filter({ has: page.getByRole('button', { name: 'とじる', exact: true }) })
        .filter({ hasNot: page.getByText(WITHDRAWAL_FINAL_CONFIRM_MODAL_TITLE, { exact: true }) });
}

/**
 * Dismisses the session-expired dialog on /login when present.
 * Scoped to role=dialog; does not use page-wide とじる (avoids unrelated modals).
 */
export async function dismissLoginSessionExpiredDialogIfPresent(page: Page): Promise<boolean> {
    const dialogs = loginSessionExpiredDialogScope(page);
    const count = await dialogs.count().catch(() => 0);
    if (count === 0) {
        return false;
    }
    const dialog = dialogs.first();
    if (!(await dialog.isVisible().catch(() => false))) {
        return false;
    }
    logRejectedLoginBoundary('dismiss_session_expired_dialog');
    const closeButton = dialog.getByRole('button', { name: 'とじる', exact: true });
    await expect(closeButton).toBeVisible({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    await closeButton.click({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    const emailField = page.getByRole('textbox', { name: 'メールアドレス' });
    await expect(emailField).toBeEditable({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    if (await dialog.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden({ timeout: 5000 });
    }
    return true;
}

export async function assertRejectedLoginInvalidCredentials(
    page: Page,
    account: SmokeAccountRef
): Promise<Omit<RejectedLoginVerificationEvidence, 'verificationMode' | 'loginUrl'>> {
    const emailField = page.getByRole('textbox', { name: 'メールアドレス' });
    const passwordField = page.getByRole('textbox', { name: 'パスワード' });
    await expect(emailField).toBeVisible({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    await expect(passwordField).toBeVisible({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    await expect(emailField).toBeEditable({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    await expect(passwordField).toBeEditable({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });

    logRejectedLoginBoundary('fill_email');
    await emailField.fill(account.email, { timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    logRejectedLoginBoundary('fill_password');
    await passwordField.fill(account.password, { timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });

    const loginButton = page.getByRole('button', { name: 'ログイン', exact: true });
    await expect(loginButton).toBeVisible({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    await expect(loginButton).toBeEnabled({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });

    const loginResponsePromise = page.waitForResponse(isAuthLoginPost, {
        timeout: REJECTED_LOGIN_API_TIMEOUT_MS,
    });

    logRejectedLoginBoundary('login_click');
    let loginResponse: Response;
    try {
        await loginButton.click({ timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
        loginResponse = await loginResponsePromise;
    } catch (error) {
        await loginResponsePromise.catch(() => undefined);
        throw error;
    }

    const loginBody = await readResponseJsonSafely(loginResponse, 'auth/login POST (rejected)');
    assertInvalidCredentialsLoginResponse(loginResponse.status(), loginBody);

    logRejectedLoginBoundary('invalid_credentials_message');
    await expect(page.getByText(LOGIN_INVALID_CREDENTIALS_MESSAGE, { exact: true })).toBeVisible({
        timeout: REJECTED_LOGIN_UI_TIMEOUT_MS,
    });
    await expect(page).toHaveURL(/\/login/, { timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    await expect(page).not.toHaveURL(/\/customers/, { timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    logRejectedLoginBoundary('invalid_credentials_verified');
    return {
        httpStatus: loginResponse.status(),
        errorCode: LOGIN_REJECTED_CREDENTIALS_ERROR_CODE,
        invalidCredentialsMessageVisible: true,
        remainedOnLoginRoute: true,
    };
}

/**
 * Same-page rejected-login probe (legacy). Prefer {@link verifyRejectedLoginInFreshContext}.
 */
export async function assertRejectedLoginAfterWithdrawal(
    page: Page,
    account: SmokeAccountRef
): Promise<void> {
    logRejectedLoginBoundary('login_route');
    await expect(page).toHaveURL(/\/login/, { timeout: REJECTED_LOGIN_UI_TIMEOUT_MS });
    await dismissLoginSessionExpiredDialogIfPresent(page);
    await assertRejectedLoginInvalidCredentials(page, account);
    logRejectedLoginBoundary('verified');
}

export async function verifyRejectedLoginInFreshContext(
    browser: Browser,
    account: SmokeAccountRef,
    options?: {
        loginUrl?: string;
        /** Optional route/install hook on the isolated context (fixtures). */
        prepareContext?: (context: BrowserContext) => Promise<void>;
    }
): Promise<RejectedLoginVerificationEvidence> {
    const loginUrl = options?.loginUrl ?? STG_LOGIN_URL;
    const context = await browser.newContext(newStagingSmokeBrowserContextOptions());
    if (options?.prepareContext) {
        await options.prepareContext(context);
    }
    const page = await context.newPage();
    try {
        logRejectedLoginBoundary('fresh_context_open', { loginUrl });
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
        logRejectedLoginBoundary('fresh_context_login_route', {
            pathname: new URL(page.url()).pathname,
        });
        const core = await assertRejectedLoginInvalidCredentials(page, account);
        const evidence: RejectedLoginVerificationEvidence = {
            loginUrl,
            verificationMode: 'fresh_browser_context',
            ...core,
        };
        logRejectedLoginBoundary('fresh_context_verified', {
            httpStatus: evidence.httpStatus,
            errorCode: evidence.errorCode,
        });
        return evidence;
    } finally {
        await context.close().catch(() => undefined);
        logRejectedLoginBoundary('fresh_context_closed');
    }
}

export type WithdrawalBoundaryEvidence = {
    lastBoundary: string;
    renewalStopAttempted: boolean;
    renewalStopVerified: boolean;
    reasonEntryCompleted: boolean;
    finalConfirmationReached: boolean;
    finalDeleteAttempted: boolean;
};

export type WithdrawalRunResult = {
    renewalStopped: boolean;
    finalPathname: string;
    accountDeletionVerified: boolean;
    rejectedLoginVerified: boolean;
    accountDeletionEvidence?: WithdrawalAccountDeletionEvidence;
    rejectedLoginEvidence?: RejectedLoginVerificationEvidence;
    boundaries: WithdrawalBoundaryEvidence;
};

export async function runWithdrawalAndVerify(
    page: Page,
    account: SmokeAccountRef,
    evidence?: CustomerFlowEvidence,
    options?: WithdrawalFlowOptions
): Promise<WithdrawalRunResult> {
    const pageOrigin = options?.pageOrigin ?? STG_APP_ORIGIN;
    const submitGuard = new WithdrawalSubmitGuard();
    let renewalStopped = false;
    const boundaries: WithdrawalBoundaryEvidence = {
        lastBoundary: 'withdrawal:start',
        renewalStopAttempted: false,
        renewalStopVerified: false,
        reasonEntryCompleted: false,
        finalConfirmationReached: false,
        finalDeleteAttempted: false,
    };
    let accountDeletionEvidence: WithdrawalAccountDeletionEvidence | undefined;
    let rejectedLoginEvidence: RejectedLoginVerificationEvidence | undefined;

    try {
        if (!options?.renewalAlreadyDisabled) {
            await test.step('withdrawal: My Page → paid-plan blocking dialog → Contract', async () => {
                boundaries.lastBoundary = 'withdrawal:paid-plan-dialog';
                await openMyPageUnsubscribeLink(page, account);
                await handlePaidPlanBlockingDialogToContract(page);
                if (evidence) {
                    await evidence.attachScreenshot('withdrawal-contract-from-dialog');
                }
            });

            await test.step('withdrawal: stop auto-renewal once on Contract', async () => {
                boundaries.lastBoundary = 'withdrawal:stop-auto-renewal';
                boundaries.renewalStopAttempted = true;
                const stopResult = await stopAutoRenewalOnContract(page);
                boundaries.renewalStopAttempted = stopResult.renewalStopAttempted;
                boundaries.renewalStopVerified = stopResult.renewalStopVerified;
                renewalStopped = boundaries.renewalStopVerified;
                if (evidence) {
                    await evidence.attachScreenshot('withdrawal-auto-renewal-stopped');
                }
            });
        } else {
            await test.step('withdrawal: verify renewal already disabled (standalone)', async () => {
                boundaries.lastBoundary = 'withdrawal:renewal-already-disabled-check';
                const body = await captureContractSubscriptionBodyForTrigger(
                    page,
                    () =>
                        page.goto(contractPageUrlForOrigin(pageOrigin), {
                            waitUntil: 'domcontentloaded',
                        }),
                    WITHDRAWAL_HYDRATION_TIMEOUT_MS
                );
                assertSubscriptionRenewalDisabled(body);
                boundaries.renewalStopVerified = true;
                renewalStopped = true;
            });
        }

        await test.step('withdrawal: My Page → unsubscribe introduction', async () => {
            boundaries.lastBoundary = 'withdrawal:unsubscribe-intro';
            await openMyPageUnsubscribeLink(page, account);
            if (options?.renewalAlreadyDisabled) {
                const blocking = cannotAccountDeleteDialog(page);
                await expect(blocking).toHaveCount(0, { timeout: ACTION_TIMEOUT_MS });
            }
            await assertUnsubscribeIntroReady(page, pageOrigin);
            if (evidence) {
                await evidence.attachScreenshot('withdrawal-unsubscribe-intro');
            }
        });

        await test.step('withdrawal: introduction → reason route', async () => {
            boundaries.lastBoundary = 'withdrawal:unsubscribe-intro-nav';
            const introButton = page.getByRole('button', {
                name: UNSUBSCRIBE_INTRO_BUTTON,
                exact: true,
            });
            await Promise.all([
                page.waitForURL(
                    (url) =>
                        new URL(url).pathname.replace(/\/$/, '') ===
                        '/my-page/unsubscribe/reason',
                    { timeout: WITHDRAWAL_HYDRATION_TIMEOUT_MS }
                ),
                introButton.click(),
            ]);
            await assertUnsubscribeReasonRoute(page, pageOrigin);
        });

        await test.step('withdrawal: reason entry on reason route', async () => {
            boundaries.lastBoundary = 'withdrawal:reason-entry';
            await assertUnsubscribeReasonFormReady(page);
            await completeUnsubscribeReasonEntry(page);
            boundaries.reasonEntryCompleted = true;
        });

        await test.step('withdrawal: final confirmation before delete', async () => {
            boundaries.lastBoundary = 'withdrawal:final-confirmation';
            await assertFinalWithdrawalConfirmationReady(page, pageOrigin);
            boundaries.finalConfirmationReached = true;
        });

        await test.step('withdrawal: final delete once', async () => {
            boundaries.lastBoundary = 'withdrawal:final-delete-submit';
            await submitFinalWithdrawalDelete(page, account, submitGuard, () => {
                boundaries.finalDeleteAttempted = true;
            });
            if (evidence) {
                await evidence.attachScreenshot('withdrawal-login-after-delete');
            }
        });

        await test.step('withdrawal: account deletion evidence on login route', async () => {
            boundaries.lastBoundary = 'withdrawal:account-deletion-verified';
            await expect(page).toHaveURL(/\/login/, { timeout: LOGIN_REDIRECT_TIMEOUT_MS });
            accountDeletionEvidence = {
                accountEmail: account.email,
                finalPathname: new URL(page.url()).pathname.replace(/\/$/, '') || '/',
                deleteApiObserved: boundaries.finalDeleteAttempted,
                loginRouteReached: true,
            };
            console.log(
                'WITHDRAWAL_ACCOUNT_DELETION_VERIFIED',
                JSON.stringify(accountDeletionEvidence)
            );
            if (evidence) {
                await evidence.attachJson(
                    'WITHDRAWAL_ACCOUNT_DELETION_VERIFIED',
                    accountDeletionEvidence
                );
            }
        });

        await test.step('withdrawal: rejected login (fresh browser context)', async () => {
            boundaries.lastBoundary = 'withdrawal:rejected-login-fresh-context';
            const browser = options?.browser ?? page.context().browser();
            if (!browser) {
                throw new WithdrawalFlowError(
                    'Rejected-login verification requires Playwright browser for a fresh unauthenticated context.'
                );
            }
            const loginUrl =
                options?.loginUrl ??
                (options?.pageOrigin
                    ? `${options.pageOrigin.replace(/\/$/, '')}/login`
                    : STG_LOGIN_URL);
            rejectedLoginEvidence = await verifyRejectedLoginInFreshContext(browser, account, {
                loginUrl,
                prepareContext: options?.prepareRejectedLoginContext,
            });
            console.log('WITHDRAWAL_REJECTED_LOGIN_VERIFIED', JSON.stringify(rejectedLoginEvidence));
            if (evidence) {
                await evidence.attachJson(
                    'WITHDRAWAL_REJECTED_LOGIN_VERIFIED',
                    rejectedLoginEvidence
                );
            }
        });
    } catch (err) {
        const detail: Record<string, unknown> = {
            ...boundaries,
            renewalStopped,
            accountEmail: account.email,
            currentUrl: page.url(),
        };
        if (err instanceof WithdrawalFlowError && err.cancelAutoRenewalDiagnostics) {
            detail.cancelAutoRenewalDiagnostics = err.cancelAutoRenewalDiagnostics;
        }
        console.log('WITHDRAWAL_FLOW_FAILED', JSON.stringify(detail));
        if (evidence) {
            await evidence.attachJson('WITHDRAWAL_FLOW_FAILED', detail).catch(() => undefined);
            await evidence.attachScreenshot('withdrawal-flow-failure').catch(() => undefined);
        }
        if (err instanceof Error) {
            err.message = `${err.message} (boundary: ${boundaries.lastBoundary})`;
        }
        throw err;
    }

    const finalPathname = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
    const summary = {
        accountEmail: account.email,
        renewalStopped,
        accountDeletionVerified: true,
        rejectedLoginVerified: true,
        finalPathname,
        boundaries,
        rejectedLoginVerificationMode: 'fresh_browser_context' as const,
    };
    console.log('WITHDRAWAL_FLOW_VERIFIED', JSON.stringify(summary));
    if (evidence) {
        await evidence.attachJson('WITHDRAWAL_FLOW_VERIFIED', summary);
    }

    return {
        renewalStopped,
        finalPathname,
        accountDeletionVerified: true,
        rejectedLoginVerified: true,
        accountDeletionEvidence:
            accountDeletionEvidence ?? {
                accountEmail: account.email,
                finalPathname,
                deleteApiObserved: boundaries.finalDeleteAttempted,
                loginRouteReached: true,
            },
        rejectedLoginEvidence,
        boundaries,
    };
}
