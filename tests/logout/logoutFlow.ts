import { expect, type Locator, type Page } from '@playwright/test';
import { appNavigationMenuDialog } from '../mypage/profile/myPageProfileFlow';
import { STG_APP_ORIGIN, STG_LOGIN_URL } from '../login/existingUserLoginFlow';

const ACTION_TIMEOUT_MS = 15000;
const LOGOUT_NAVIGATION_TIMEOUT_MS = 60000;
const PROTECTED_ROUTE_TIMEOUT_MS = 30000;

/** Legacy logout.spec.ts + Part 2 login readiness: header Menu control. */
export const LOGOUT_MENU_CONTROL = { role: 'img' as const, name: 'Menu' };

/**
 * Legacy logout.spec.ts (staging): menu item label ログアウト (getByText, not role=button).
 * Scoped to {@link appNavigationMenuDialog} like other navigation-menu flows.
 */
export const LOGOUT_CONTROL_LABEL = 'ログアウト';

export const LOGIN_EMAIL_TEXTBOX_NAME = 'メールアドレス';
export const LOGIN_PASSWORD_TEXTBOX_NAME = 'パスワード';
export const LOGIN_SUBMIT_BUTTON_NAME = 'ログイン';

export const LOGOUT_LOCATOR_EVIDENCE = {
    menu: 'getByRole("img", { name: "Menu" }) — legacy logout.spec.ts, existingUserLoginFlow readiness',
    menuDialog: 'appNavigationMenuDialog(page) → getByRole("dialog") — myPageProfileFlow',
    logoutControl: `dialog.getByText("${LOGOUT_CONTROL_LABEL}", { exact: true }) — legacy logout.spec.ts`,
    loginRoute:
        'exact origin + pathname from env.loginUrl (query may vary); waitUntil domcontentloaded',
    loginFormAfterLogout:
        'empty メールアドレス/パスワード; visible disabled ログイン (staging post-logout trace)',
    protectedProbe: 'same context goto /customers after logout; expect configured login route + login form',
} as const;

export type LogoutEnvironment = {
    appOrigin: string;
    loginUrl: string;
    protectedCustomersUrl: string;
};

export const DEFAULT_LOGOUT_ENV: LogoutEnvironment = {
    appOrigin: STG_APP_ORIGIN,
    loginUrl: STG_LOGIN_URL,
    protectedCustomersUrl: `${STG_APP_ORIGIN}/customers`,
};

export class LogoutFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LogoutFlowError';
    }
}

export type LogoutRunEvidence = {
    logoutAttempted: boolean;
    appRedirectVerified: boolean;
    loginFormVerified: boolean;
    protectedRouteRejected: boolean;
    finalPathname: string;
};

export type RunLogoutOptions = {
    env?: LogoutEnvironment;
    onEvidence?: (evidence: LogoutRunEvidence) => void;
    loginNavigationTimeoutMs?: number;
};

export function logoutEvidenceAttachmentBody(evidence: LogoutRunEvidence): string {
    return JSON.stringify(evidence, null, 2);
}

function normalizePathnameForRouteMatch(pathname: string): string {
    if (pathname.length > 1 && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
    }
    return pathname || '/';
}

/**
 * Shared login-route predicate: same origin and pathname as env.loginUrl; query string may differ.
 */
export function isConfiguredLoginRoute(href: string, env: LogoutEnvironment): boolean {
    try {
        const expected = new URL(env.loginUrl);
        const actual = new URL(href);
        return (
            actual.origin === expected.origin &&
            normalizePathnameForRouteMatch(actual.pathname) ===
                normalizePathnameForRouteMatch(expected.pathname)
        );
    } catch {
        return false;
    }
}

function menuHeaderControl(page: Page): Locator {
    return page.getByRole(LOGOUT_MENU_CONTROL.role, { name: LOGOUT_MENU_CONTROL.name });
}

function logoutControlInMenuDialog(page: Page): Locator {
    return appNavigationMenuDialog(page).getByText(LOGOUT_CONTROL_LABEL, { exact: true });
}

/**
 * Post-logout login shell (staging trace): route reaches /login with empty fields and ログイン disabled.
 */
export async function assertLoginFormReady(page: Page, env: LogoutEnvironment): Promise<void> {
    if (!isConfiguredLoginRoute(page.url(), env)) {
        throw new LogoutFlowError(
            `Login form check failed: expected configured login route ${env.loginUrl}, received ${page.url()}.`
        );
    }
    const email = page.getByRole('textbox', { name: LOGIN_EMAIL_TEXTBOX_NAME });
    const password = page.getByRole('textbox', { name: LOGIN_PASSWORD_TEXTBOX_NAME });
    await expect(email).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(password).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(email).toHaveValue('');
    await expect(password).toHaveValue('');

    const submit = page.getByRole('button', { name: LOGIN_SUBMIT_BUTTON_NAME });
    await expect(submit).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(submit).toBeDisabled();
}

async function assertAuthenticatedMenuAbsent(page: Page): Promise<void> {
    const menu = menuHeaderControl(page);
    await expect(menu, 'Authenticated Menu must be hidden after logout').toBeHidden({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function waitForConfiguredLoginRoute(
    page: Page,
    env: LogoutEnvironment,
    timeoutMs: number
): Promise<void> {
    await page.waitForURL((url) => isConfiguredLoginRoute(url.href, env), {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
    });
}

async function verifyProtectedCustomersRouteRejected(
    page: Page,
    env: LogoutEnvironment
): Promise<void> {
    await page.goto(env.protectedCustomersUrl, {
        waitUntil: 'domcontentloaded',
        timeout: PROTECTED_ROUTE_TIMEOUT_MS,
    });

    let onLoginRoute = false;
    try {
        await expect
            .poll(() => isConfiguredLoginRoute(page.url(), env), {
                timeout: PROTECTED_ROUTE_TIMEOUT_MS,
                message:
                    'Protected /customers probe should return to the configured login route in the same browser context',
            })
            .toBe(true);
        onLoginRoute = true;
    } catch (pollError) {
        onLoginRoute = isConfiguredLoginRoute(page.url(), env);
        if (!onLoginRoute) {
            const menuVisible = await menuHeaderControl(page)
                .isVisible()
                .catch(() => false);
            if (menuVisible && isCustomersRoute(page.url(), env)) {
                throw new LogoutFlowError(
                    'Protected /customers remained accessible after logout (Menu still visible). ' +
                        'This is not proof of server-side token revocation unless API evidence confirms it.'
                );
            }
        }
        if (!onLoginRoute) {
            throw pollError;
        }
    }

    await assertLoginFormReady(page, env);
    await assertAuthenticatedMenuAbsent(page);
}

function isCustomersRoute(href: string, env: LogoutEnvironment): boolean {
    try {
        const url = new URL(href);
        return (
            url.origin === env.appOrigin &&
            (url.pathname === '/customers' || url.pathname.startsWith('/customers/'))
        );
    } catch {
        return false;
    }
}

/**
 * Opens Menu, clicks ログアウト once, verifies app-driven /login, login form, and protected-route rejection.
 */
export async function runLogoutAndVerify(
    page: Page,
    options?: RunLogoutOptions
): Promise<LogoutRunEvidence> {
    const env = options?.env ?? DEFAULT_LOGOUT_ENV;
    const loginNavigationTimeoutMs =
        options?.loginNavigationTimeoutMs ?? LOGOUT_NAVIGATION_TIMEOUT_MS;

    const evidence: LogoutRunEvidence = {
        logoutAttempted: false,
        appRedirectVerified: false,
        loginFormVerified: false,
        protectedRouteRejected: false,
        finalPathname: safePathname(page.url()),
    };

    const publish = (): void => {
        evidence.finalPathname = safePathname(page.url());
        options?.onEvidence?.({ ...evidence });
    };

    publish();

    await expect(menuHeaderControl(page)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await menuHeaderControl(page).click({ timeout: ACTION_TIMEOUT_MS });

    const dialog = appNavigationMenuDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const logoutControl = logoutControlInMenuDialog(page);
    await expect(
        logoutControl,
        'Navigation menu must expose exactly one ログアウト control'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(logoutControl).toBeVisible();
    await expect(logoutControl).toBeEnabled();

    evidence.logoutAttempted = true;
    publish();
    await logoutControl.click({ timeout: ACTION_TIMEOUT_MS });

    await waitForConfiguredLoginRoute(page, env, loginNavigationTimeoutMs);
    evidence.appRedirectVerified = true;
    publish();

    await assertLoginFormReady(page, env);
    evidence.loginFormVerified = true;
    publish();

    await assertAuthenticatedMenuAbsent(page);

    await verifyProtectedCustomersRouteRejected(page, env);
    evidence.protectedRouteRejected = true;
    evidence.finalPathname = safePathname(page.url());
    publish();

    return evidence;
}

function safePathname(href: string): string {
    try {
        return new URL(href).pathname;
    } catch {
        return href;
    }
}
