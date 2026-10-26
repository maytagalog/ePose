import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { recoverMainSessionAfterPasswordChange } from './myPageChangePasswordFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const MY_PAGE_STUB = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailSuccessMyPageStub.html'),
    'utf8'
);

const STG = 'https://app-stg.epose.com';
const MY_PAGE = `${STG}/my-page`;
const LOGIN = `${STG}/login`;

const LOGIN_FORM_HTML = `<!DOCTYPE html><html><body>
  <input aria-label="メールアドレス" />
  <input aria-label="パスワード" />
  <button type="button">ログイン</button>
</body></html>`;

test('recoverMainSession: HTTP 302 to /login uses new password recovery', async ({ page }) => {
    const email = 'user@example.com';
    let myPageRequests = 0;
    let reauthPassword: string | undefined;

    await page.route(MY_PAGE, async (route) => {
        myPageRequests += 1;
        if (myPageRequests === 1) {
            await route.fulfill({
                status: 302,
                headers: { Location: LOGIN },
                body: '',
            });
            return;
        }
        await route.fulfill({
            body: MY_PAGE_STUB.replace('user.two.dot@example.com', email),
            contentType: 'text/html; charset=utf-8',
        });
    });

    await page.route(LOGIN, async (route) => {
        await route.fulfill({
            body: LOGIN_FORM_HTML,
            contentType: 'text/html; charset=utf-8',
        });
    });

    await page.route('**/auth/profile', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({
                    email,
                    directorFullName: 'A',
                    furiganaFullName: '',
                    showingName: 'B',
                }),
            });
            return;
        }
        await route.continue();
    });

    await recoverMainSessionAfterPasswordChange(
        page,
        { email, password: 'Password123' },
        {
            reauthenticate: async (_page, account) => {
                reauthPassword = account.password;
            },
        }
    );

    expect(reauthPassword).toBe('Password123');
    expect(myPageRequests).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test('recoverMainSession: delayed client redirect from /my-page to /login', async ({ page }) => {
    test.setTimeout(60000);
    const email = 'spa-user@example.com';
    let myPageRequests = 0;
    let reauthPassword: string | undefined;

    const delayedRedirectMyPage = `<!DOCTYPE html><html><body>
      <div>My Page shell (not authenticated UI)</div>
      <script>
        setTimeout(function () {
          window.location.href = ${JSON.stringify(LOGIN)};
        }, 400);
      </script>
    </body></html>`;

    await page.route(MY_PAGE, async (route) => {
        myPageRequests += 1;
        if (myPageRequests === 1) {
            await route.fulfill({
                body: delayedRedirectMyPage,
                contentType: 'text/html; charset=utf-8',
            });
            return;
        }
        await route.fulfill({
            body: MY_PAGE_STUB.replace('user.two.dot@example.com', email),
            contentType: 'text/html; charset=utf-8',
        });
    });

    await page.route(LOGIN, async (route) => {
        await route.fulfill({
            body: LOGIN_FORM_HTML,
            contentType: 'text/html; charset=utf-8',
        });
    });

    await page.route('**/auth/profile', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({
                    email,
                    directorFullName: 'A',
                    furiganaFullName: '',
                    showingName: 'B',
                }),
            });
            return;
        }
        await route.continue();
    });

    await recoverMainSessionAfterPasswordChange(
        page,
        { email, password: 'Password123' },
        {
            reauthenticate: async (_page, account) => {
                reauthPassword = account.password;
            },
        }
    );

    expect(reauthPassword).toBe('Password123');
    expect(myPageRequests).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
});
