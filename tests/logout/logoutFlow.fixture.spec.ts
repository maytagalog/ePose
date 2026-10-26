import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appNavigationMenuDialog } from '../mypage/profile/myPageProfileFlow';
import { LogoutFlowError, runLogoutAndVerify, type LogoutEnvironment } from './logoutFlow';

test.describe.configure({ timeout: 90000 });

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures');
const FIXTURE_ORIGIN = 'https://logout-fixture.test';

const FIXTURE_LOGOUT_ENV: LogoutEnvironment = {
    appOrigin: FIXTURE_ORIGIN,
    loginUrl: `${FIXTURE_ORIGIN}/login`,
    protectedCustomersUrl: `${FIXTURE_ORIGIN}/customers`,
};

type ShellOptions = {
    skipLogoutRedirect?: boolean;
    keepSessionAfterLogout?: boolean;
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'logoutNavigationMenu.html'), 'utf8');
}

async function installLogoutShell(
    page: import('@playwright/test').Page,
    options?: ShellOptions
): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.addInitScript((cfg) => {
        const flags = cfg as ShellOptions;
        (window as unknown as { __skipLogoutRedirect?: boolean }).__skipLogoutRedirect =
            flags.skipLogoutRedirect ?? false;
        (window as unknown as { __keepSessionAfterLogout?: boolean }).__keepSessionAfterLogout =
            flags.keepSessionAfterLogout ?? false;
    }, {
        skipLogoutRedirect: options?.skipLogoutRedirect ?? false,
        keepSessionAfterLogout: options?.keepSessionAfterLogout ?? false,
    });
}

test('post-logout empty login form with disabled submit, then protected probe (fixture)', async ({
    page,
}) => {
    await installLogoutShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    const evidence = await runLogoutAndVerify(page, { env: FIXTURE_LOGOUT_ENV });

    expect(evidence.loginFormVerified).toBe(true);
    expect(evidence.protectedRouteRejected).toBe(true);
    await expect(page.getByRole('textbox', { name: 'メールアドレス' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'パスワード' })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeDisabled();
});

test('Menu → one logout click → app-driven login navigation (fixture)', async ({ page }) => {
    await installLogoutShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    const evidence = await runLogoutAndVerify(page, { env: FIXTURE_LOGOUT_ENV });

    expect(evidence.logoutAttempted).toBe(true);
    expect(evidence.appRedirectVerified).toBe(true);
    expect(evidence.loginFormVerified).toBe(true);
    expect(evidence.protectedRouteRejected).toBe(true);
    expect(evidence.finalPathname).toBe('/login');
    expect(await page.evaluate(() => (window as unknown as { __logoutClickCount?: number }).__logoutClickCount)).toBe(
        1
    );
});

test('scoped menu dialog ignores hidden logout-text decoy (fixture)', async ({ page }) => {
    await installLogoutShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('img', { name: 'Menu' }).click();
    const dialog = appNavigationMenuDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('ログアウト', { exact: true })).toHaveCount(1);
    await expect(page.locator('#logout-decoy')).toBeHidden();
});

test('missing app-driven redirect fails without manual login navigation (fixture)', async ({ page }) => {
    await installLogoutShell(page, { skipLogoutRedirect: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await expect(
        runLogoutAndVerify(page, {
            env: FIXTURE_LOGOUT_ENV,
            loginNavigationTimeoutMs: 8000,
        })
    ).rejects.toThrow(/waitForURL|Timeout|LogoutFlowError|login/i);
    expect(await page.evaluate(() => (window as unknown as { __logoutClickCount?: number }).__logoutClickCount)).toBe(
        1
    );
    expect(page.url()).toContain('/customers');
});

test('protected /customers access is rejected after logout (fixture)', async ({ page }) => {
    await installLogoutShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await runLogoutAndVerify(page, { env: FIXTURE_LOGOUT_ENV });
    expect(page.url()).toMatch(/^https:\/\/logout-fixture\.test\/login(?:\?|$)/);
});

test('protected access remaining authenticated fails (fixture)', async ({ page }) => {
    await installLogoutShell(page, { keepSessionAfterLogout: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await expect(runLogoutAndVerify(page, { env: FIXTURE_LOGOUT_ENV })).rejects.toThrow(
        LogoutFlowError
    );
});

test('no second logout click or automatic re-login (fixture)', async ({ page }) => {
    await installLogoutShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await runLogoutAndVerify(page, { env: FIXTURE_LOGOUT_ENV });

    expect(await page.evaluate(() => (window as unknown as { __logoutClickCount?: number }).__logoutClickCount)).toBe(
        1
    );
    expect(await page.evaluate(() => (window as unknown as { __loginSubmitCount?: number }).__loginSubmitCount)).toBe(
        0
    );
});
