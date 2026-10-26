import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    REFERRAL_EMAIL_SEND_BUTTON,
    REFERRAL_EMAIL_SHARE_BUTTON,
    REFERRAL_EMAIL_SHARE_DIALOG_TITLE,
    openReferralCouponFromContractMenu,
    referralCouponCodeLocator,
    referralCouponPageTitle,
    referralEmailShareDialog,
    readReferralCouponCodeFromPage,
} from './referralCouponFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_CONTRACT_URL = `${FIXTURE_ORIGIN}/contract`;

test('fixture: openReferralCouponFromContractMenu exposes dynamic code and single send', async ({
    page,
}) => {
    test.setTimeout(60000);
    const html = fs.readFileSync(path.join(e2eFixturesDir, 'referralCouponPage.html'), 'utf8');

    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        const pathName = new URL(route.request().url()).pathname;
        if (pathName === '/contract' || pathName === '/coupon') {
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
        }
        return route.fulfill({ status: 404, body: 'missing' });
    });

    await page.goto(FIXTURE_CONTRACT_URL, { waitUntil: 'domcontentloaded' });

    await openReferralCouponFromContractMenu(page, { pageOrigin: FIXTURE_ORIGIN });

    await expect(page).toHaveURL(`${FIXTURE_ORIGIN}/coupon`);
    await expect(referralCouponPageTitle(page)).toHaveText('紹介クーポン');

    const code = await readReferralCouponCodeFromPage(page, { pageOrigin: FIXTURE_ORIGIN });
    expect(code).toBe('FIXTURE9X');

    await page.getByRole('button', { name: REFERRAL_EMAIL_SHARE_BUTTON, exact: true }).click();
    const dialog = referralEmailShareDialog(page);
    await expect(dialog.getByText(REFERRAL_EMAIL_SHARE_DIALOG_TITLE, { exact: true })).toBeVisible();
    await dialog.getByPlaceholder('example@epose.com').fill('a.test@gmail.com');
    await dialog.getByRole('button', { name: REFERRAL_EMAIL_SEND_BUTTON, exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(referralCouponCodeLocator(page)).toHaveText('FIXTURE9X');
});
