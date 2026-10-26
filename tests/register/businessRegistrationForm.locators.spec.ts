import { test, expect } from '@playwright/test';

function businessRegistrationForm(page: import('@playwright/test').Page) {
    return page.locator('form').filter({
        has: page.locator('input[name="telephoneNumber"]'),
    });
}

/**
 * Locator smoke for the public 本登録 form shell (no registration / no email state). This is during the Account Application Form.
 */
test('business registration form locators resolve on /application/complete', async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.goto('https://app-stg.epose.com/application/complete');

    const form = businessRegistrationForm(page);
    const confirmButton = page.getByRole('button', {
        name: '入力内容を確認',
    });

    const companyName = form.getByRole('textbox').nth(0);
    const contactName = form.getByRole('textbox').nth(1);
    const telephone = form.locator('input[name="telephoneNumber"]');
    const countrySelectTrigger = form.locator('.ant-select-selection-item');
    const prefectureOrCity = form.getByRole('textbox').nth(4);
    const streetAddress = form.getByRole('textbox').nth(5);

    await expect(form).toBeVisible();
    await expect(confirmButton).toBeDisabled();
    await expect(companyName).toBeVisible();
    await expect(companyName).toBeEditable();
    await expect(contactName).toBeEditable();
    await expect(telephone).toBeEditable();
    await expect(countrySelectTrigger).toBeVisible();
    await expect(prefectureOrCity).toBeEditable();
    await expect(streetAddress).toBeEditable();

    await test.step('fill company and contact', async () => {
        await companyName.fill('Business');
        await contactName.fill('Person');
        await expect(companyName).toHaveValue('Business');
    });

    await test.step('fill telephone', async () => {
        await telephone.fill('09012345678');
        await expect(telephone).toHaveValue('09012345678');
    });

    await test.step('select country', async () => {
        await countrySelectTrigger.click();
        await page.getByRole('option', { name: 'Australia' }).click();
        await expect(
            form.locator('.ant-select-selection-item[title="Australia"]')
        ).toBeVisible({ timeout: 15000 });
        await page.keyboard.press('Escape');
    });

    await test.step('fill address', async () => {
        await prefectureOrCity.fill('New Queensland');
        await streetAddress.fill('Abbot Street');
    });

    await test.step('confirm button enabled', async () => {
        await expect(confirmButton).toBeEnabled({ timeout: 15000 });
    });

    const hiddenRecaptcha = page.locator(
        'textarea[name="g-recaptcha-response"]'
    );
    await expect(hiddenRecaptcha).toBeHidden();
});
