import { test, expect } from '@playwright/test';
import { login } from "../../../utils/login";
import moment from 'moment';

test('credit card payment - 3 months', async ({ page }) => {
    test.setTimeout(350000);
    //must be a new user or user's subscription already ended
    
    //new email every test
    await login(page, { email: "l.l.a.nfairpwllgwyngyl.lgoger111@gmail.com", password: "qwert6y7u" });
    await page.waitForTimeout(3000)
    await expect(page.getByRole('img', { name: 'Menu' })).toBeVisible()

    await page.getByRole('img', { name: 'Menu' }).click();
    await page.getByText('設定').click();

    await expect(page.getByText('フリープラン')).toBeVisible();

    await page.getByRole('button', { name: 'プランの確認・変更はこちら' }).click();

    await page.waitForURL('https://app-stg.epose.com/contract', { waitUntil: "domcontentloaded", timeout: 500000 });

    await expect(page.getByText('フリープラン')).toBeVisible();

    await page.getByRole('button', { name: 'プランを変更する' }).click();

    // 0 - 3 months, 1 - 6 months, 2 - 12 months
    const creditCardOption = page.getByText('このプランを選択');

    await creditCardOption.first().isEnabled();
    await creditCardOption.nth(1).isEnabled();
    await creditCardOption.nth(2).isEnabled();

    await expect(page.getByText('お支払い情報入力')).toBeDisabled();

    //3 Month Plan
    await creditCardOption.first().click();
    await expect(page.getByText('選択中')).toBeVisible();
    await expect(page.getByText('選択中')).toBeDisabled();

    await page.waitForTimeout(7000);
    await expect(page.locator('div').filter({ hasText: /^3 ヶ月プラン¥29,400$/ }).first()).toBeVisible();
    await expect(page.getByText('¥29,400').nth(2)).toBeVisible();
    await expect(page.getByRole('button', { name: 'お支払い情報入力' })).toBeEnabled();
    // check other footer elements
    await page.getByRole('button', { name: 'お支払い情報入力' }).click();

    await page.waitForURL('https://app-stg.epose.com/contract/payment-information', { waitUntil: "domcontentloaded", timeout: 50000 });

    await expect(page.getByRole('textbox', { name: 'クーポンコードをお持ちの方はご入力ください' })).toBeVisible();
    await expect(page.getByRole('button', { name: '適用' })).toBeVisible();
    await expect(page.getByRole('button', { name: '適用' })).toBeEnabled();

    await page.getByText('クレジットカード').first().click();
    await page.locator('iframe[title="セキュアな支払い入力フレーム"]').contentFrame().getByRole('textbox', { name: 'カード番号' }).fill('4242 4242 4242 4242');
    await page.locator('iframe[title="セキュアな支払い入力フレーム"]').contentFrame().getByRole('textbox', { name: '有効期限' }).fill('04 / 29');
    await page.locator('iframe[title="セキュアな支払い入力フレーム"]').contentFrame().getByRole('textbox', { name: 'セキュリティコード' }).fill('832');
    await expect(page.getByRole('button', { name: '決済を実行する' })).toBeEnabled();
    await page.getByRole('button', { name: '決済を実行する' }).click();

    await page.waitForURL('https://app-stg.epose.com/contract/payment-complete', { waitUntil: "domcontentloaded" });

    const expectedEndDate = moment(Date.now()).add(3, 'months').format('YYYY/MM/D');

    await expect(page.getByText('クレジットカード決済が完了しました')).toBeVisible();
    await expect(page.locator('.invoice-details-header')).toBeVisible();
    await expect(page.locator('.invoice-details-header')).toHaveText(`${moment(Date.now()).format('YYYY/M/D')}から適用される契約プラン`);
    await expect(page.locator('.invoice-details-item-plan')).toBeVisible();
    await expect(page.locator('.invoice-details-item-plan')).toHaveText('3ヶ月プラン');

    await expect(page.locator('.invoice-details-item').nth(1).locator('div').nth(1)).toBeVisible();
    await expect(page.locator('.invoice-details-item').nth(1).locator('div').nth(1)).toHaveText(`
        ${moment(Date.now()).format('YYYY/MM/DD')}~${moment(Date.now()).add(3, 'months').format('YYYY/MM/DD')}
    `);

    await expect(page.locator('.invoice-details-item').nth(2).locator('div').nth(1)).toBeVisible();
    await expect(page.locator('.invoice-details-item').nth(2).locator('div').nth(1)).toHaveText(`${expectedEndDate}`);

    await expect(page.locator('.invoice-details-item').nth(3).locator('div').nth(1)).toBeVisible();
    await expect(page.locator('.invoice-details-item').nth(3).locator('div').nth(1)).toHaveText(`クレジットカード`);

    await page.getByRole('img', { name: 'Menu' }).click();
    await expect(page.getByText('紹介クーポン')).toBeVisible();
    await expect(page.getByText('すぐにePoseを利用する')).toBeVisible();
    await expect(page.getByText('ご契約情報へもどる')).toBeVisible();
    await page.getByText('CLOSE').click()

    await page.getByText('ご契約情報へもどる').click();

    await page.waitForURL('https://app-stg.epose.com/contract', { waitUntil: "domcontentloaded" });

    await page.locator('.active .break-row > div > div > div:first-child').isVisible();
    await expect(page.locator('div.active.break-row > div > div:first-child > div:nth-child(2)')).toHaveText('3ヶ月プラン');

    await page.locator('.active .break-row > div > div > div:nth-child(2)').isVisible();
    await expect(page.locator('div.active.break-row > div > div:nth-child(2) > div:nth-child(2)')).toHaveText(`
        ${moment(Date.now()).format('YYYY/MM/D')}~${moment(Date.now()).add(3, 'months').format('YYYY/MM/D')}
    `);

    await page.locator('.active .break-row > div > div > div:nth-child(3)').isVisible();
    await expect(page.locator('div.active.break-row > div > div:nth-child(3) > div:nth-child(2)')).toHaveText(`入金確認済み`);

    await page.getByRole('button', { name: 'ご契約情報へもどる' }).isVisible();

    const renewalParent = page.getByText('次回更新される契約プラン').locator('..');

    await expect(renewalParent.locator('div:nth-child(2) > div:nth-child(2)')).toHaveText('3ヶ月プラン（自動更新）');

    await expect(renewalParent.locator('div:nth-child(3) > div:nth-child(2)')).toHaveText(`
        ${moment(Date.now()).add(3, 'months').format('YYYY/MM/D')}~${moment(Date.now()).add(6, 'months').format('YYYY/MM/D')}
    `);

    await expect(renewalParent.locator('div:nth-child(4) > div:nth-child(2)')).toHaveText(`${moment(Date.now()).add(3, 'months').format('YYYY/MM/D')}`);

    await expect(renewalParent.locator('div:nth-child(5) > div:nth-child(2) .label')).toHaveText(`なし`);
    await expect(renewalParent.locator('div:nth-child(6) > div:nth-child(2)')).toHaveText(`ご請求日になりましたらお支払い方法に登録されたクレジットカードより引き落としされます。`);

    await expect(page.locator('.payment-method-label').first()).toBeVisible();
    await expect(page.locator('.payment-method-label').locator('..').locator('div:nth-child(2)')).toHaveText('xxxx xxxx xxxx 4242  (VISA) ');

    await expect(page.locator('.automatic-updates-label')).toBeVisible();
    await expect(page.locator('.automatic-updates-label ~ div')).toHaveText('有効');

    await expect(page.locator('.coupon-list-label')).toBeVisible();
    await expect(page.locator('.coupon-list-item')).toHaveText('なし');

    await page.getByRole('img', { name: 'Menu' }).click();

    await expect(page.getByText('紹介クーポン', { exact: true })).toBeVisible();
    await page.getByText('紹介クーポン', { exact: true }).click();

    await expect(page.locator('.coupon-code-description > span')).toContainText('5');

    await expect(page.locator('.coupon-code-text')).toBeVisible();
});