import { test, expect } from '@playwright/test';
import { login } from "../../utils/login"
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value?.trim()) {
        throw new Error(`Set ${name} before running this test.`);
    }
    return value;
}

test('settings', async ({ page }) => {
    test.setTimeout(80000);

    await login(page, {
        email: requireEnv('EPOSE_COMPANY_INFO_EMAIL'),
        password: requireEnv('EPOSE_COMPANY_INFO_PASSWORD'),
    });

    await page.getByRole('img', { name: 'Menu' }).click();
    await expect(page.getByText('設定')).toBeVisible();
    await page.getByText('設定').click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('編集').first()).toBeVisible();
    await page.getByText('編集').first().click();

    const fields = page.locator('input');

    //await expect(page.getByText('保 存')).toBeDisabled();

    await expect(fields.first()).toBeVisible();
    await fields.first().fill(
        await fields.first().inputValue() == 'Indo' ? 'Aust' : 'Indo'
    );

    await expect(fields.nth(1)).toBeVisible();
    await fields.nth(1).fill('120303333');

    await expect(page.locator('div[class="ant-select-selector"]')).toBeVisible();
    const countryInputValue = await page.locator('input[class="ant-select-selection-search-input"]').inputValue();
    await page.locator('div[class="ant-select-selector"]').click();
    await page.getByRole('option', {
        name: countryInputValue == 'Indonesia' ? 'Australia' : 'Indonesia'
    }).click();

    await expect(fields.nth(2)).toBeVisible();

    await expect(fields.nth(3)).toBeVisible();
    await expect(fields.nth(4)).toBeVisible();
    await fields.nth(4).fill(
        await fields.nth(4).inputValue() == 'Bali' ? 'New South Wales' : 'Bali'
    );

    await expect(fields.nth(5)).toBeVisible();
    await fields.nth(5).fill(
        await fields.nth(5).inputValue() == 'Jalan Legian' ? 'George Street' : 'Jalan Legian'
    )

    await expect(fields.nth(6)).toBeVisible();
    await expect(fields.nth(7)).toBeVisible();

    await expect(page.getByText('保 存')).toBeEnabled();
    await page.getByText('保 存').click();
    /************************************ Plan ************************************/
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(12000);
    await expect(page.getByRole('button', { name: 'プランの確認・変更はこちら' })).toBeEnabled();
    await page.getByRole('button', { name: 'プランの確認・変更はこちら' }).click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL('https://app-stg.epose.com/contract');
    await page.goBack();
    /******************************** Display Item ********************************/
    await page.getByText('編集').nth(1).click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('button', { name: '保 存' })).toBeEnabled();
    await expect(page.locator(`button[role="switch"]`)).toBeEnabled();
    await page.locator(`button[role="switch"]`).click();
    await page.getByRole('button', { name: '保 存' }).click()
    await expect(page.getByText('更新しました。')).toBeVisible();
});
