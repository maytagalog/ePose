import { expect, type Locator, type Page, type Response } from '@playwright/test';
import {
    buildContractSubscriptionSnapshot,
    GET_CONTRACT_SUBSCRIPTION_URL,
} from '../accountPayment/creditCard/planPurchaseFlow';
import {
    AUTH_PROFILE_URL,
    type AuthProfileResponse,
} from '../mypage/profile/myPageProfileFlow';
import {
    resolveSmokePart2Account,
    validateSmokePart2AccountFields,
    type SmokePart2AccountCredentials,
} from '../e2e/shared/smokePart2Config';

const AUTH_PROFILE_LOGIN_TIMEOUT_MS = 30000;

export const STG_LOGIN_URL = 'https://app-stg.epose.com/login';
export const STG_APP_ORIGIN = 'https://app-stg.epose.com';

export const POST_LOGIN_NAVIGATION_TIMEOUT_MS = 60000;
export const CONTINUE_BUTTON_NAME = '続行する';

/** Accessible name on staging simultaneous-login dialog (trace-confirmed). */
export const SESSION_TAKEOVER_DIALOG_ACCESSIBLE_NAME =
    '本アカウントは別の端末で使用中です。この端末でログインしますか？';

export function customersPathname(pathname: string): boolean {
    const normalized = pathname.replace(/\/$/, '') || '/';
    return normalized === '/customers' || normalized.startsWith('/customers/');
}

/** First-login Online Booking heading — must not appear for the Part 2 existing account. */
export const ONLINE_BOOKING_ONBOARDING_HEADING =
    'オンラインで使い方の説明を受ける';

export class ExistingUserLoginError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExistingUserLoginError';
    }
}

export type Part2LoginEnvironment = {
    loginUrl: string;
    appOrigin: string;
    /** When true (staging default), /customers must be on appOrigin. */
    requireStagingCustomersOrigin: boolean;
};

export const DEFAULT_PART2_LOGIN_ENV: Part2LoginEnvironment = {
    loginUrl: STG_LOGIN_URL,
    appOrigin: STG_APP_ORIGIN,
    requireStagingCustomersOrigin: true,
};

export type Part2LoginFlowOptions = {
    env?: Part2LoginEnvironment;
    postLoginNavigationTimeoutMs?: number;
    authProfileTimeoutMs?: number;
};

export type AuthProfileIdentityEvidence =
    | { status: 'verified'; authProfile: AuthProfileResponse }
    | { status: 'not_observed' }
    | {
          status: 'failed';
          reason: string;
          httpStatus?: number;
      };

export type PostLoginNavigationOutcome = {
    takeoverDetected: boolean;
    takeoverConfirmed: boolean;
};

export type ContractSubscriptionLoginEvidence =
    | { status: 'verified'; body: unknown }
    | { status: 'not_observed' }
    | { status: 'failed'; reason: string; httpStatus?: number };

export type ExistingUserCustomersReadiness = {
    profileEmailVerified: boolean;
    authProfile?: AuthProfileResponse;
    identityEvidence: AuthProfileIdentityEvidence;
    contractSubscription?: ContractSubscriptionLoginEvidence;
    takeoverDetected: boolean;
    takeoverConfirmed: boolean;
};

export type VerifyExistingUserCustomersOptions = {
    env?: Part2LoginEnvironment;
    /**
     * When set, use this profile outcome instead of waiting on the network
     * (fixture injection of capture result).
     */
    identityEvidence?: AuthProfileIdentityEvidence;
    authProfileWaitMs?: number;
};

type AuthProfileCaptureResult =
    | { kind: 'verified'; body: AuthProfileResponse }
    | { kind: 'not_observed' }
    | { kind: 'failed'; reason: string; httpStatus?: number };

type AuthProfileLoginCapture = {
    /** Starts the bounded auth/profile observation window (after authenticated /customers). */
    startObservationWindow: () => void;
    consume: () => Promise<AuthProfileCaptureResult>;
    dispose: () => void;
};

type ContractSubscriptionCaptureResult =
    | { kind: 'verified'; body: unknown }
    | { kind: 'not_observed' }
    | { kind: 'failed'; reason: string; httpStatus?: number };

type ContractSubscriptionLoginCapture = {
    startObservationWindow: () => void;
    consume: () => Promise<ContractSubscriptionCaptureResult>;
    dispose: () => void;
};

function contractSubscriptionCaptureResultToEvidence(
    result: ContractSubscriptionCaptureResult
): ContractSubscriptionLoginEvidence {
    switch (result.kind) {
        case 'verified':
            return { status: 'verified', body: result.body };
        case 'not_observed':
            return { status: 'not_observed' };
        case 'failed':
            return {
                status: 'failed',
                reason: result.reason,
                httpStatus: result.httpStatus,
            };
    }
}

/**
 * Observes GET contract/subscription after authenticated /customers is reached (same window as auth/profile).
 */
export function beginContractSubscriptionLoginCapture(
    page: Page,
    timeoutMs = AUTH_PROFILE_LOGIN_TIMEOUT_MS,
    env: Part2LoginEnvironment = DEFAULT_PART2_LOGIN_ENV
): ContractSubscriptionLoginCapture {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observationStarted = false;
    let consumeResolve!: (result: ContractSubscriptionCaptureResult) => void;
    const consumePromise = new Promise<ContractSubscriptionCaptureResult>((resolve) => {
        consumeResolve = resolve;
    });

    const settle = (result: ContractSubscriptionCaptureResult) => {
        if (settled) {
            return;
        }
        settled = true;
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        page.off('response', onResponse);
        consumeResolve(result);
    };

    const startObservationWindow = () => {
        if (observationStarted || settled) {
            return;
        }
        observationStarted = true;
        timer = setTimeout(() => {
            settle({ kind: 'not_observed' });
        }, timeoutMs);
    };

    const onResponse = async (response: Response) => {
        if (!response.url().startsWith(GET_CONTRACT_SUBSCRIPTION_URL)) {
            return;
        }
        if (response.request().method() !== 'GET') {
            return;
        }
        try {
            if (!customersUrlReady(new URL(page.url()), env)) {
                return;
            }
        } catch {
            return;
        }
        const status = response.status();
        if (status !== 200) {
            settle({
                kind: 'failed',
                reason: `contract/subscription responded with HTTP ${status}`,
                httpStatus: status,
            });
            return;
        }
        try {
            const body = await response.json();
            buildContractSubscriptionSnapshot(body);
            settle({ kind: 'verified', body });
        } catch (err) {
            settle({
                kind: 'failed',
                reason:
                    err instanceof Error
                        ? err.message
                        : 'contract/subscription response could not be parsed as subscription schema',
            });
        }
    };

    page.on('response', onResponse);

    void consumePromise.catch(() => {
        /* consume() is the public await point */
    });

    return {
        startObservationWindow,
        consume: async () => {
            startObservationWindow();
            return consumePromise;
        },
        dispose: () => {
            if (!settled) {
                settle({ kind: 'not_observed' });
            }
        },
    };
}

/** Staging simultaneous-login dialog (role=dialog, aria-modal, trace-confirmed name). */
export function sessionTakeoverModalRoot(page: Page): Locator {
    return page.getByRole('dialog', {
        name: SESSION_TAKEOVER_DIALOG_ACCESSIBLE_NAME,
        exact: true,
    });
}

export async function isSessionTakeoverModalVisible(page: Page): Promise<boolean> {
    const dialog = sessionTakeoverModalRoot(page);
    const count = await dialog.count();
    if (count === 0) {
        return false;
    }
    if (count > 1) {
        return true;
    }
    return dialog.isVisible();
}

/**
 * Confirms session takeover: exactly one dialog, one enabled Continue, click once, dialog closes.
 */
export async function confirmSessionTakeoverModal(page: Page): Promise<void> {
    const dialog = sessionTakeoverModalRoot(page);
    await expect(
        dialog,
        'Expected exactly one session-takeover dialog'
    ).toHaveCount(1);
    await expect(dialog).toBeVisible({ timeout: 15000 });

    const continueButton = dialog.getByRole('button', { name: CONTINUE_BUTTON_NAME });
    await expect(
        continueButton,
        'Expected exactly one Continue button in session-takeover dialog'
    ).toHaveCount(1);
    await expect(continueButton).toBeEnabled();
    await continueButton.click({ noWaitAfter: true });
    await expect(dialog).toBeHidden({ timeout: 15000 });
}

/**
 * Observes POST auth/profile after authenticated /customers is reached.
 * Rejection is always consumed via {@link AuthProfileLoginCapture.consume}.
 */
export function beginAuthProfileLoginCapture(
    page: Page,
    timeoutMs = AUTH_PROFILE_LOGIN_TIMEOUT_MS,
    env: Part2LoginEnvironment = DEFAULT_PART2_LOGIN_ENV
): AuthProfileLoginCapture {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observationStarted = false;
    let consumeResolve!: (result: AuthProfileCaptureResult) => void;
    const consumePromise = new Promise<AuthProfileCaptureResult>((resolve) => {
        consumeResolve = resolve;
    });

    const settle = (result: AuthProfileCaptureResult) => {
        if (settled) {
            return;
        }
        settled = true;
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        page.off('response', onResponse);
        consumeResolve(result);
    };

    const startObservationWindow = () => {
        if (observationStarted || settled) {
            return;
        }
        observationStarted = true;
        timer = setTimeout(() => {
            settle({ kind: 'not_observed' });
        }, timeoutMs);
    };

    const onResponse = async (response: Response) => {
        if (response.url() !== AUTH_PROFILE_URL) {
            return;
        }
        if (response.request().method() !== 'POST') {
            return;
        }
        try {
            if (!customersUrlReady(new URL(page.url()), env)) {
                return;
            }
        } catch {
            return;
        }
        const status = response.status();
        if (status !== 200) {
            settle({
                kind: 'failed',
                reason: `auth/profile responded with HTTP ${status}`,
                httpStatus: status,
            });
            return;
        }
        try {
            const body = (await response.json()) as AuthProfileResponse;
            if (!body || typeof body !== 'object') {
                settle({
                    kind: 'failed',
                    reason: 'auth/profile response was not a JSON object',
                });
                return;
            }
            settle({ kind: 'verified', body });
        } catch {
            settle({
                kind: 'failed',
                reason: 'auth/profile response JSON could not be parsed',
            });
        }
    };

    page.on('response', onResponse);

    void consumePromise.catch(() => {
        /* consume() is the public await point */
    });

    return {
        startObservationWindow,
        consume: async () => {
            startObservationWindow();
            return consumePromise;
        },
        dispose: () => {
            if (!settled) {
                settle({ kind: 'not_observed' });
            }
        },
    };
}

export function customersUrlReady(url: URL, env: Part2LoginEnvironment): boolean {
    if (!customersPathname(url.pathname)) {
        return false;
    }
    if (env.requireStagingCustomersOrigin && url.origin !== env.appOrigin) {
        return false;
    }
    return true;
}

/** Playwright urlMatches passes a parsed URL; use directly (do not wrap with new URL()). */
export function customersUrlMatchPredicate(
    env: Part2LoginEnvironment
): (url: URL) => boolean {
    return (url) => customersUrlReady(url, env);
}

/**
 * Synchronous customers-route check. Prefer this over expect(page).toHaveURL(predicate):
 * when the URL already matches, Playwright's predicate toHaveURL waits for the "load" event
 * (see Frame.waitForURL → waitForLoadState), which can time out on a hung SPA shell even
 * though page.url() is already https://app-stg.epose.com/customers.
 */
export function assertCustomersPageUrlReady(
    page: Page,
    env: Part2LoginEnvironment = DEFAULT_PART2_LOGIN_ENV,
    context?: string
): void {
    const label = context ? ` (${context})` : '';
    let parsed: URL;
    try {
        parsed = new URL(page.url());
    } catch {
        throw new ExistingUserLoginError(
            `Customers route check failed${label}: page.url() is not a valid URL (${page.url()}).`
        );
    }
    if (!customersUrlReady(parsed, env)) {
        throw new ExistingUserLoginError(
            `Customers route check failed${label}: expected authenticated route on ${env.appOrigin} ` +
                `(/customers…), received ${parsed.href}.`
        );
    }
}

export type PostLoginNavigationState =
    | 'customers'
    | 'session_takeover'
    | 'login_failed'
    | 'pending';

export async function detectPostLoginNavigationState(
    page: Page,
    env: Part2LoginEnvironment
): Promise<PostLoginNavigationState> {
    let parsed: URL;
    try {
        parsed = new URL(page.url());
    } catch {
        return 'pending';
    }

    if (customersUrlReady(parsed, env)) {
        return 'customers';
    }

    if (await isSessionTakeoverModalVisible(page)) {
        return 'session_takeover';
    }

    const onLoginRoute =
        parsed.pathname.includes('/login') || page.url().includes('/login');
    if (onLoginRoute) {
        const loginError = page.locator('div[data-cy="error-label"]');
        if (await loginError.isVisible().catch(() => false)) {
            const errorText = (await loginError.textContent())?.trim() ?? '';
            if (errorText.length > 0) {
                return 'login_failed';
            }
        }
    }

    return 'pending';
}

/**
 * After Login submit: wait until /customers or the session-takeover modal (observed copy).
 * Clicks 続行する scoped to that modal once, verifies it closes, then waits for /customers.
 */
export async function waitForPostLoginCustomersLanding(
    page: Page,
    env: Part2LoginEnvironment = DEFAULT_PART2_LOGIN_ENV,
    options?: { timeoutMs?: number }
): Promise<PostLoginNavigationOutcome> {
    const timeoutMs = options?.timeoutMs ?? POST_LOGIN_NAVIGATION_TIMEOUT_MS;
    const outcome: PostLoginNavigationOutcome = {
        takeoverDetected: false,
        takeoverConfirmed: false,
    };

    let resolved: PostLoginNavigationState = 'pending';

    await expect
        .poll(
            async () => {
                resolved = await detectPostLoginNavigationState(page, env);
                return resolved;
            },
            {
                timeout: timeoutMs,
                intervals: [100, 250, 500],
                message:
                    'Expected login to reach /customers or show the session-takeover confirmation modal',
            }
        )
        .not.toBe('pending');

    const finalState = resolved as Exclude<PostLoginNavigationState, 'pending'>;

    if (finalState === 'login_failed') {
        const loginError = page.locator('div[data-cy="error-label"]');
        const detail = (await loginError.textContent().catch(() => null))?.trim();
        throw new ExistingUserLoginError(
            detail
                ? `Login failed on staging login form: ${detail}`
                : 'Login failed on staging login form (error label visible).'
        );
    }

    if (finalState === 'session_takeover') {
        outcome.takeoverDetected = true;
        await confirmSessionTakeoverModal(page);
        outcome.takeoverConfirmed = true;
        await page.waitForURL(customersUrlMatchPredicate(env), {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
        });
        return outcome;
    }

    if (finalState === 'customers') {
        return outcome;
    }

    throw new ExistingUserLoginError(
        `Login did not reach /customers on ${env.appOrigin} (last observed state: ${finalState}).`
    );
}

function captureResultToIdentityEvidence(
    result: AuthProfileCaptureResult
): AuthProfileIdentityEvidence {
    switch (result.kind) {
        case 'verified':
            return { status: 'verified', authProfile: result.body };
        case 'not_observed':
            return { status: 'not_observed' };
        case 'failed':
            return {
                status: 'failed',
                reason: result.reason,
                httpStatus: result.httpStatus,
            };
    }
}

function assertRequiredStagingIdentityEvidence(
    evidence: AuthProfileIdentityEvidence,
    account: SmokePart2AccountCredentials
): AuthProfileResponse {
    if (evidence.status === 'failed') {
        throw new ExistingUserLoginError(
            `Login identity check failed: ${evidence.reason}`
        );
    }
    if (evidence.status === 'not_observed') {
        throw new ExistingUserLoginError(
            'Login identity check failed: auth/profile POST was not observed within the post-login ' +
                'observation window after reaching /customers (required on staging). If login or session ' +
                'takeover was slow, the prior capture timer may have expired before authenticated API ' +
                'calls started; check trace for incomplete auth/profile or transport errors (e.g. HTTP/2).'
        );
    }
    const email = evidence.authProfile.email;
    if (!email) {
        throw new ExistingUserLoginError(
            'Login identity check failed: auth/profile response missing email.'
        );
    }
    if (email !== account.email) {
        throw new ExistingUserLoginError(
            `Login identity check failed: auth/profile email ${JSON.stringify(email)} !== ${JSON.stringify(account.email)}`
        );
    }
    return evidence.authProfile;
}

/**
 * Staging login for Part 2 existing account. Does not advance `#next` onboarding,
 * 「利用を開始する」, or post-onboarding OK — unlike {@link login} in utils/login.ts.
 * Does not dismiss post-login dialogs on /customers (including any Limit Dialog).
 */
export async function loginExistingUserForPart2(
    page: Page,
    account: SmokePart2AccountCredentials,
    options?: Part2LoginFlowOptions
): Promise<ExistingUserCustomersReadiness> {
    validateSmokePart2AccountFields(account.email, account.password);

    const env = options?.env ?? DEFAULT_PART2_LOGIN_ENV;
    const authProfileTimeoutMs =
        options?.authProfileTimeoutMs ?? AUTH_PROFILE_LOGIN_TIMEOUT_MS;

    await page.goto(env.loginUrl, { waitUntil: 'domcontentloaded' });

    const closeButton = page.locator('button', { hasText: 'とじる' });
    if (await closeButton.isVisible()) {
        await closeButton.click();
    }

    await page
        .getByRole('textbox', { name: 'メールアドレス' })
        .fill(account.email);
    await page
        .getByRole('textbox', { name: 'パスワード' })
        .fill(account.password);
    const authProfileCapture = beginAuthProfileLoginCapture(
        page,
        authProfileTimeoutMs,
        env
    );
    const contractSubscriptionCapture = beginContractSubscriptionLoginCapture(
        page,
        authProfileTimeoutMs,
        env
    );

    await page.getByRole('button', { name: 'ログイン' }).click();

    let navigationOutcome: PostLoginNavigationOutcome;
    try {
        try {
            navigationOutcome = await waitForPostLoginCustomersLanding(page, env, {
                timeoutMs: options?.postLoginNavigationTimeoutMs,
            });
        } catch (err) {
            const stillOnLogin = page.url().includes('/login');
            if (stillOnLogin && !(err instanceof ExistingUserLoginError)) {
                const state = await detectPostLoginNavigationState(page, env);
                if (state === 'login_failed') {
                    throw err;
                }
                const detail =
                    err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
                throw new ExistingUserLoginError(
                    `Login did not leave the login route within the bounded wait (url: ${page.url()}). ${detail}`
                );
            }
            throw err;
        }

        authProfileCapture.startObservationWindow();
        contractSubscriptionCapture.startObservationWindow();

        const [captureResult, subscriptionCaptureResult] = await Promise.all([
            authProfileCapture.consume(),
            contractSubscriptionCapture.consume(),
        ]);
        const identityEvidence = captureResultToIdentityEvidence(captureResult);
        const contractSubscription = contractSubscriptionCaptureResultToEvidence(
            subscriptionCaptureResult
        );

        const readiness = await verifyExistingUserCustomersReady(page, account, {
            env,
            identityEvidence,
        });

        return {
            ...readiness,
            contractSubscription,
            takeoverDetected: navigationOutcome.takeoverDetected,
            takeoverConfirmed: navigationOutcome.takeoverConfirmed,
        };
    } finally {
        authProfileCapture.dispose();
        contractSubscriptionCapture.dispose();
    }
}

/** Same account module as fullE2ESmokePart2 — validates config at call time. */
export function resolvePart2LoginAccount(): SmokePart2AccountCredentials {
    return resolveSmokePart2Account();
}

/**
 * Post-login readiness on /customers for an existing account (Part 2 login step).
 * Positive signals first (route + Menu), required auth/profile identity on staging, then onboarding absent.
 */
export async function verifyExistingUserCustomersReady(
    page: Page,
    account: SmokePart2AccountCredentials,
    options?: VerifyExistingUserCustomersOptions
): Promise<ExistingUserCustomersReadiness> {
    validateSmokePart2AccountFields(account.email, account.password);

    const env = options?.env ?? DEFAULT_PART2_LOGIN_ENV;

    assertCustomersPageUrlReady(page, env, 'verifyExistingUserCustomersReady');

    const menu = page.getByRole('img', { name: 'Menu' });
    await expect(menu, 'Authenticated customers shell: header Menu control').toBeVisible({
        timeout: 15000,
    });

    let identityEvidence = options?.identityEvidence;
    if (!identityEvidence) {
        const capture = beginAuthProfileLoginCapture(
            page,
            options?.authProfileWaitMs ?? 15000,
            env
        );
        try {
            capture.startObservationWindow();
            const result = await capture.consume();
            identityEvidence = captureResultToIdentityEvidence(result);
        } finally {
            capture.dispose();
        }
    }

    let authProfile: AuthProfileResponse | undefined;
    let profileEmailVerified = false;

    if (env.requireStagingCustomersOrigin) {
        authProfile = assertRequiredStagingIdentityEvidence(identityEvidence, account);
        profileEmailVerified = true;
    } else if (identityEvidence.status === 'verified') {
        authProfile = assertRequiredStagingIdentityEvidence(identityEvidence, account);
        profileEmailVerified = true;
    } else if (identityEvidence.status === 'failed') {
        throw new ExistingUserLoginError(
            `Login identity check failed: ${identityEvidence.reason}`
        );
    }

    await expect(
        page.getByText(ONLINE_BOOKING_ONBOARDING_HEADING),
        'Existing account must not show first-login Online Booking onboarding'
    ).not.toBeVisible();

    return {
        profileEmailVerified,
        authProfile,
        identityEvidence,
        takeoverDetected: false,
        takeoverConfirmed: false,
    };
}
