import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    POST_AUTH_LOGIN_URL,
    assertRejectedLoginInvalidCredentials,
    dismissLoginSessionExpiredDialogIfPresent,
    loginSessionExpiredDialogScope,
    verifyRejectedLoginInFreshContext,
} from './withdrawalFlow';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture-withdrawal-rejected.test';
const FIXTURE_LOGIN = `${FIXTURE_ORIGIN}/login`;

const rejectedLoginBody = {
    errors: [
        {
            message: '',
            extensions: { errorCode: 'InvalidParameter', statusCode: 401, attempts: 1 },
        },
    ],
};

const account: SmokeAccountRef = {
    email: 'withdrawn-rejected@fixture.test',
    password: 'FixturePass1',
};

function loginFixtureHtml(includeSessionExpiredDialog: boolean): string {
    const base = fs.readFileSync(path.join(e2eFixturesDir, 'withdrawalFlow.html'), 'utf8');
    const sessionBlock = includeSessionExpiredDialog
        ? `<div id="dialog-session-expired" role="dialog" aria-modal="true">
      <div>セッションの有効期限が切れました</div>
      <button type="button" id="session-expired-close">とじる</button>
    </div>
    <script>
      document.getElementById('session-expired-close')?.addEventListener('click', () => {
        const dialog = document.getElementById('dialog-session-expired');
        if (dialog) {
          dialog.hidden = true;
          dialog.style.display = 'none';
        }
      });
    </script>`
        : '';
    return base.replace('<body>', `<body>${sessionBlock}`);
}

async function installLoginFixtureRoutes(
    context: import('@playwright/test').BrowserContext,
    options: { sessionExpiredDialog?: boolean } = {}
) {
    const html = loginFixtureHtml(options.sessionExpiredDialog === true);
    await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/login') {
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
        }
        return route.fulfill({ status: 404, body: 'missing' });
    });
    await context.route(POST_AUTH_LOGIN_URL, async (route) => {
        await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify(rejectedLoginBody),
        });
    });
}

test('fresh context: rejected login without stale deleted-account session', async ({ browser }) => {
    const evidence = await verifyRejectedLoginInFreshContext(browser, account, {
        loginUrl: FIXTURE_LOGIN,
        prepareContext: (context) => installLoginFixtureRoutes(context),
    });
    expect(evidence.verificationMode).toBe('fresh_browser_context');
    expect(evidence.httpStatus).toBe(401);
    expect(evidence.invalidCredentialsMessageVisible).toBe(true);
});

test('scoped dismiss: session-expired dialog closes without page-wide とじる', async ({ browser }) => {
    const context = await browser.newContext();
    await installLoginFixtureRoutes(context, { sessionExpiredDialog: true });
    const page = await context.newPage();
    await page.goto(FIXTURE_LOGIN, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        const dialog = document.getElementById('dialog-session-expired');
        if (dialog) {
            dialog.hidden = false;
            (dialog as HTMLElement).style.display = 'block';
        }
        const login = document.getElementById('view-login');
        if (login) {
            login.hidden = false;
            (login as HTMLElement).style.display = 'block';
        }
    });
    const dialogs = loginSessionExpiredDialogScope(page);
    await expect(dialogs.first()).toBeVisible();
    await dismissLoginSessionExpiredDialogIfPresent(page);
    await expect(dialogs).toHaveCount(0);
    await assertRejectedLoginInvalidCredentials(page, account);
    await context.close();
});