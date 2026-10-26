import { test, expect } from '@playwright/test';
import { assertMainSessionAuthenticatedAfterPasswordReturn } from './myPageChangePasswordFlow';
import { ChangePasswordSessionInvalidatedError } from './changePasswordErrors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const MY_PAGE_STUB = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailSuccessMyPageStub.html'),
    'utf8'
);

test('assertMainSessionAuthenticatedAfterPasswordReturn fails on /login without re-login', async ({
    page,
}) => {
    await page.goto('https://app-stg.epose.com/login', { waitUntil: 'domcontentloaded' });
    await page.setContent(`<!DOCTYPE html><html><body>
      <input aria-label="メールアドレス" />
      <input aria-label="パスワード" />
    </body></html>`);

    await expect(
        assertMainSessionAuthenticatedAfterPasswordReturn(page, 'user@example.com')
    ).rejects.toThrow(ChangePasswordSessionInvalidatedError);
});

test('assertMainSessionAuthenticatedAfterPasswordReturn passes on authenticated my-page stub', async ({
    page,
}) => {
    await page.route('https://app-stg.epose.com/my-page', async (route) => {
        await route.fulfill({
            body: MY_PAGE_STUB,
            contentType: 'text/html; charset=utf-8',
        });
    });
    await page.goto('https://app-stg.epose.com/my-page', { waitUntil: 'domcontentloaded' });
    await assertMainSessionAuthenticatedAfterPasswordReturn(
        page,
        'user.two.dot@example.com'
    );
});
