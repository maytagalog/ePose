import { test, expect } from '@playwright/test';
import { login } from "../../utils/login";
import moment from 'moment';
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

test('interaction record', async ({ page }) => {
    /*********************************** Account Register ***********************************/
    const name = "Absolute";

    test.setTimeout(500000);

    await login(page, {
        email: requireEnv('EPOSE_CIRS_EMAIL'),
        password: requireEnv('EPOSE_CIRS_PASSWORD'),
    });

    await page.getByText('新規登録').first().click();

    //Furigana
    await page.getByRole('textbox').nth(2).fill(`${name}`);

    //Height
    await page.locator('.ant-select-selector').first().click();
    await page.getByRole('option', { name: '142' }).click();

    //Sex
    await page.getByRole('radio', { name: '男性' }).click();
    // page.getByRole('radio', { name: '女性' })
    // page.getByRole('radio', { name: '無回答' })

    //Year
    await page.locator('.ant-select.ant-select-outlined.date-select > .ant-select-selector').first().click()
    await page.getByRole('option', { name: '2002' }).click();
    //Month
    await page.locator('div:nth-child(3) > .ant-select-selector').click();
    await page.getByRole('option', { name: '11' }).click();
    //Day
    await page.locator('div:nth-child(5) > .ant-select-selector').click();
    await page.getByRole('option', { name: '16' }).click();
    await page.getByRole('checkbox').click();
    //Submit
    await page.getByRole('button', { name: '保 存' }).click();
    await page.waitForTimeout(10000);

    await page.locator("div[role='dialog']").isVisible().then(async (isVisible) => {
        isVisible && await page.getByText('顧客一覧へもどる').click();
    });

    await expect(page.getByText(`${name}`)).not.toHaveCount(0);

    await page.getByText('顧客情報を表示').click();

    await expect(page.getByText('2002/11/16')).toBeVisible();
    await expect(page.getByText('142 cm')).toBeVisible();
    await expect(page.getByText('男性')).toBeVisible();
    /*********************************** /Account Register ***********************************/

    moment.locale('ja');
    const lastUpdated = moment(Date.now()).format('YYYY/M/D (dd)');
    const expectedDate = moment(Date.now()).format('YYYY/MM/DD');
    const buttons = await page.getByRole('button', { name: '一覧' });
    const today = moment(Date.now()).add(1, 'minute');

    await expect(page.getByRole('button', { name: 'new response report 新規応対' })).toBeVisible();
    await page.getByRole('button', { name: 'new response report 新規応対' }).click();

    await expect(page).toHaveURL(/customers\/.*\/interaction-records\/.*/);
    await expect(page.getByText('応対記録')).toBeVisible();

    await expect(page.locator('.date-time')).toBeVisible();
    await page.locator('.date-time').innerText().then((text) => {
        moment(text) > today && test.fail()
    });

    await expect(page.locator('.customer-name')).toBeVisible();
    await expect(page.locator('.customer-name')).toHaveText(name + name);
    await expect(page.getByText(name)).toHaveCount(2);

    await expect(page.getByRole('textbox')).toBeVisible();
    await expect(page.getByRole('textbox')).toBeEmpty();

    await expect(page.getByText('新規メモ')).toBeVisible();
    await expect(page.getByText('新規引き継ぎ')).toBeVisible();
    await expect(page.getByText('新規分析')).toBeVisible();
    await expect(buttons).toHaveCount(2);
    await expect(buttons.first()).toBeVisible();
    await expect(buttons.nth(1)).toBeVisible();

    await page.getByRole('textbox').fill('This is a test comment.');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(6000);
    await expect(page.locator('.last-updated-date')).toBeVisible();
    await expect(page.getByText(`最終更新 : ${lastUpdated}`)).toBeVisible();

    await page.getByText('新規メモ').click();


    /*********************************** Memo ***********************************/
    await expect(page).toHaveURL(/customers\/.*\/interaction-records\/.*\/memo\/new$/);

    await expect(page.locator('[style="background-color: rgb(0, 0, 0);"]')).toBeVisible();
    await expect(page.locator('[style="background-color: rgb(231, 68, 43);"]')).toBeVisible();
    await expect(page.locator('[style="background-color: rgb(0, 122, 255);"]')).toBeVisible();
    await expect(page.locator('.eraser-btn')).toBeVisible();
    await expect(page.locator('.eraser-btn')).toBeDisabled();

    await expect(page.locator('[src="/assets/delete-7fea600d.svg"]')).toBeVisible();
    await expect(page.locator('[src="/assets/reset-a9f02c37.svg"]')).toBeVisible();

    await expect(page.locator('[image="/assets/plainbg-icon-9f513cd4.svg"]')).toBeVisible();
    await expect(page.locator('[image="/assets/grid-icon-40028765.svg"]')).toBeVisible();
    await expect(page.locator('[image="/assets/outline-icon-6692502b.svg"]')).toBeVisible();

    await page.locator('[image="/assets/grid-icon-40028765.svg"]').click();
    await page.locator('[image="/assets/outline-icon-6692502b.svg"]').click();
    await page.locator('[image="/assets/plainbg-icon-9f513cd4.svg"]').click();
    await page.locator('[image="/assets/grid-icon-40028765.svg"]').click();
    await page.locator('canvas').nth(1).click({
        position: {
            x: 227,
            y: 356
        }
    });
    await page.getByRole('button').nth(2).click();
    await page.locator('canvas').nth(1).click({
        position: {
            x: 217,
            y: 250
        }
    });
    await page.locator('canvas').nth(1).click({
        position: {
            x: 302,
            y: 406
        }
    });
    await page.getByRole('button').nth(3).click();
    await page.locator('canvas').nth(1).click({
        position: {
            x: 274,
            y: 225
        }
    });
    await page.locator('canvas').nth(1).click({
        position: {
            x: 305,
            y: 235
        }
    });
    await page.getByRole('button').nth(4).click();
    await page.locator('canvas').nth(1).click({
        position: {
            x: 427,
            y: 336
        }
    });
    await page.locator('canvas').nth(1).click({
        position: {
            x: 409,
            y: 349
        }
    });
    await page.getByRole('button').nth(3).click();
    await page.locator('canvas').nth(1).click({
        position: {
            x: 259,
            y: 325
        }
    });
    await page.locator('canvas').nth(1).click({
        position: {
            x: 289,
            y: 288
        }
    });
    await page.getByText('保存').click();

    await expect(page).toHaveURL(/customers\/.*\/interaction-records\/.*/);
    await expect(page.locator('.hand-written-note-section-body > div > div').count()).not.toBe(0);

    await expect(page.locator('.img-wrapper').count()).not.toBe(0);

    await page.getByText('新規引き継ぎ').click();
    /*********************************** /Memo ***********************************/

    /*********************************** Handover Note ***********************************/
    await expect(page.getByRole('button', { name: '投 稿' })).toBeVisible();
    await expect(page.getByRole('button', { name: '投 稿' })).toBeDisabled();

    await expect(page.locator('.ant-picker')).toBeVisible();
    await expect(page.locator('.ant-picker-input > input')).toHaveValue(expectedDate);

    await expect(page.locator('[name="contents"]')).toBeVisible();
    await expect(page.locator('[name="contents"]')).toBeEmpty();
    await page.locator('[name="contents"]').fill('This is a handover note.');

    await expect(page.locator('.ant-select-selector')).toBeVisible();
    await expect(page.locator('.ant-select-selector')).not.toBeEmpty();

    await expect(page.getByRole('button', { name: '投 稿' })).toBeEnabled();
    await page.getByRole('button', { name: '投 稿' }).click();

    await expect(page.locator("section-body > div > *").count()).not.toBe(0);

    await page.locator(".back").click();

    await expect(page).toHaveURL(/customers\/.*/);

    const recordList = await page.locator("ant-layout-content > div").nth(3).locator("div");
    await expect(recordList.count()).not.toBe(1);

    await page.getByRole('button', { name: 'new response report 新規応対' }).click();

    await page.getByRole('textbox').fill('This is a test comment.');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(6000);

    await page.locator('.ant-float-btn-body').click();
    await page.getByText('過去の応対記録').click();
    await expect(page).toHaveURL(/customers\/.*\/interaction-records/);

    await expect(page.locator(".ant-list-items > div").count()).not.toBe(2);

    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/customers\/.*\/interaction-records\/.*/);

    await page.locator('.ant-float-btn-body').click();
    await page.getByText('応対記録を削除').click();
    await page.getByRole('button', { name: '削除' }).click();

    await expect(recordList.count()).not.toBe(1);
})