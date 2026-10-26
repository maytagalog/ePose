import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
    assertChangePasswordSuccessContent,
    CHANGE_PASSWORD_SUCCESS_HEADLINE,
    returnToMyPageAfterPasswordChangeSuccess,
} from './changePasswordSuccessContent';
import { ChangePasswordSuccessContentError } from './changePasswordErrors';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const SUCCESS_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changePasswordSuccessContent.html'),
    'utf8'
);
const NAV_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changePasswordSuccessNavigationSuccess.html'),
    'utf8'
);
const MY_PAGE_STUB = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailSuccessMyPageStub.html'),
    'utf8'
);

const STUB_EMAIL = 'user.two.dot@example.com';

test('success region: exact headline with return button in container', async ({ page }) => {
    await page.setContent(SUCCESS_HTML);
    await assertChangePasswordSuccessContent(page);
    const region = page.locator('[data-e2e-change-password-success-region]');
    await expect(region.getByText(CHANGE_PASSWORD_SUCCESS_HEADLINE, { exact: true })).toHaveCount(1);
    await expect(region.getByRole('button', { name: 'マイページへもどる' })).toHaveCount(1);
});

test('required navigation: delayed sibling button → My Page with email (fixture)', async ({
    page,
}) => {
    test.setTimeout(60000);
    await page.setContent(`<!DOCTYPE html><html><body><div id="root"><div class="leaf">
      <div class="headline-only"><span>新しいパスワードを設定しました。</span></div>
    </div></div>
    <script>
      setTimeout(() => {
        const b = document.createElement('button');
        b.textContent = 'マイページへもどる';
        b.onclick = () => { window.location.href = 'https://app-stg.epose.com/my-page'; };
        document.querySelector('.leaf').appendChild(b);
      }, 400);
    </script></body></html>`);
    await page.route(/\/my-page\/?(\?.*)?$/, async (route) => {
        await route.fulfill({
            body: MY_PAGE_STUB,
            contentType: 'text/html; charset=utf-8',
        });
    });
    await returnToMyPageAfterPasswordChangeSuccess(page, STUB_EMAIL);
    await expect(page.getByText(STUB_EMAIL, { exact: true })).toBeVisible();
});

test('required navigation: missing button fails', async ({ page }) => {
    test.setTimeout(60000);
    await page.setContent(
        '<div id="root"><div class="leaf">新しいパスワードを設定しました。</div></div>'
    );
    await expect(returnToMyPageAfterPasswordChangeSuccess(page, STUB_EMAIL)).rejects.toThrow(
        ChangePasswordSuccessContentError
    );
});

test('required navigation: present button that does not navigate fails', async ({ page }) => {
    test.setTimeout(60000);
    await page.setContent(SUCCESS_HTML);
    await expect(returnToMyPageAfterPasswordChangeSuccess(page, STUB_EMAIL)).rejects.toThrow(
        /マイページへもどる must navigate/
    );
});

test('required navigation: sibling button present but broken fails', async ({ page }) => {
    test.setTimeout(60000);
    await page.setContent(`<!DOCTYPE html><html><body><div id="root"><div class="leaf">
      <div class="headline-only"><span>新しいパスワードを設定しました。</span></div>
    </div></div>
    <script>
      setTimeout(() => {
        const b = document.createElement('button');
        b.textContent = 'マイページへもどる';
        document.querySelector('.leaf').appendChild(b);
      }, 200);
    </script></body></html>`);
    await expect(returnToMyPageAfterPasswordChangeSuccess(page, STUB_EMAIL)).rejects.toThrow(
        /マイページへもどる must navigate/
    );
});

test('return helper: form submit navigates to /my-page with email', async ({ page }) => {
    const STG = 'https://app-stg.epose.com';
    const successUrl = `${STG}/e2e-fixtures/change-password-success-nav`;
    await page.route(/\/my-page\/?(\?.*)?$/, async (route) => {
        await route.fulfill({ body: MY_PAGE_STUB, contentType: 'text/html; charset=utf-8' });
    });
    await page.route(successUrl, async (route) => {
        await route.fulfill({ body: NAV_HTML, contentType: 'text/html; charset=utf-8' });
    });
    await page.goto(successUrl, { waitUntil: 'domcontentloaded' });
    await returnToMyPageAfterPasswordChangeSuccess(page, STUB_EMAIL);
});
