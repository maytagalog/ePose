import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { assertChangeEmailSuccessContent } from './changeEmailSuccessContent';
import { returnToMyPageAfterChangeSuccess } from './myPageChangeEmailFlow';
import { finalizeChangeEmailAccountAfterSuccess } from './changeEmailFlowBoundaries';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const NAV_SUCCESS_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailSuccessNavigationSuccess.html'),
    'utf8'
);
const SUCCESS_NO_NAV_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailSuccessContent.html'),
    'utf8'
);
const MY_PAGE_STUB_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailSuccessMyPageStub.html'),
    'utf8'
);

const STG = 'https://app-stg.epose.com';
const SUCCESS_FIXTURE_URL = `${STG}/e2e-fixtures/change-email-success`;
const MY_PAGE_URL = `${STG}/my-page`;
const TARGET = 'user.two.dot@example.com';

test('return helper: button navigates to /my-page and verifies new email', async ({ page }) => {
    const successUrl = `${STG}/e2e-fixtures/change-email-success-nav`;
    await page.route(/\/my-page\/?(\?.*)?$/, async (route) => {
        await route.fulfill({ body: MY_PAGE_STUB_HTML, contentType: 'text/html; charset=utf-8' });
    });
    await page.route(successUrl, async (route) => {
        await route.fulfill({ body: NAV_SUCCESS_HTML, contentType: 'text/html; charset=utf-8' });
    });
    await page.goto(successUrl, { waitUntil: 'domcontentloaded' });
    await returnToMyPageAfterChangeSuccess(page, TARGET);
});

test('return helper: button that does not navigate fails clearly', async ({ page }) => {
    await page.setContent(SUCCESS_NO_NAV_HTML);
    await assertChangeEmailSuccessContent(page, TARGET);
    await expect(returnToMyPageAfterChangeSuccess(page, TARGET)).rejects.toThrow(
        /マイページへもどる must navigate/
    );
});

test('orchestration: failed return prevents commit in combined flow', async ({ page }) => {
    await page.setContent(SUCCESS_NO_NAV_HTML);
    let commitCalled = false;
    try {
        await returnToMyPageAfterChangeSuccess(page, TARGET);
        await finalizeChangeEmailAccountAfterSuccess({
            account: { email: 'old@example.com', password: 'x' },
            targetEmail: TARGET,
            verifyFreshLoad: async () => {},
            commitChangeEmailSuccess: () => {
                commitCalled = true;
            },
        });
    } catch {
        /* return must fail first */
    }
    expect(commitCalled).toBe(false);
});
