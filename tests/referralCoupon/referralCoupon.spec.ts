import { test, expect, chromium } from '@playwright/test';
import { login } from "../../utils/login";
import { waitForEmail } from '../../utils/gmail';
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value?.trim()) {
        throw new Error(`Set ${name} before running this test.`);
    }
    return value;
}

test('referral coupon', async () => {
    test.setTimeout(300000);

    const recipient = requireEnv('EPOSE_REFERRAL_RECIPIENT');

    let emailedCode = '';
    const browser = await chromium.launch();
    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
    });
    const page = await context.newPage();

    await login(page, {
        email: requireEnv('EPOSE_REFERRAL_EMAIL'),
        password: requireEnv('EPOSE_REFERRAL_PASSWORD'),
    });

    await page.getByRole('img', { name: 'Menu' }).click();

    const couponNavigator = page.getByText('紹介クーポン', { exact: true });
    await expect(couponNavigator).toBeVisible();
    await page.getByText('紹介クーポン', { exact: true }).click();

    await expect(page.locator('.coupon-code-description > span')).toContainText('5');
    await expect(page.locator('.coupon-code-text')).toBeVisible();

    const copyButton = page.getByRole('button', { name: 'コピー' })
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    await expect(page.getByRole('button', { name: 'コピーしました' })).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    await expect(clipboardText).toBe('V7I34N0E');

    const emailButton = page.getByRole('button', { name: 'メールで紹介する' });
    await expect(emailButton).toBeVisible();
    await emailButton.click();

    const emailField = page.getByPlaceholder('example@epose.com')
    await expect(emailField).toBeVisible();
    await emailField.fill(recipient);

    const sendEmailButton = page.getByRole('button', { name: '送信する' })
    await expect(sendEmailButton).toBeVisible();
    await sendEmailButton.click();
    await page.waitForTimeout(3000)
    const emailCheck = await waitForEmail(
        recipient,
        '紹介クーポンが届きました'
    );
    //expect email to not be null to confirm existence
    await expect(emailCheck).not.toBeNull();
    //expect email for the following strings to confirm correct email
    await expect(emailCheck?.subject).toContain('紹介クーポンが届きました');
    await expect(emailCheck?.body).toContain('紹介クーポンコード');

    //set the fetched emails body OR set it to empty
    await page.setContent(emailCheck?.body || '');
    emailedCode = await emailCheck?.body.match(/V7I34N0E/)?.toString() || '';

    expect(emailedCode).toBeTruthy();
});