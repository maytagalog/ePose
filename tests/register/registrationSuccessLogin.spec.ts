import { test, expect } from '@playwright/test';

/**
 * Public registration-success shell: no email state / no live registration. This is when the Account Registration is successful
 * then clicking the "ログイン画面へ" button to navigate to the login screen.
 */
test('registration success navigates to login via ログイン画面へ', async ({
    page,
}) => {
    await page.goto(
        'https://app-stg.epose.com/application/complete/success',
        { waitUntil: 'domcontentloaded' }
    );

    await expect(page).toHaveURL(/\/application\/complete\/success/);
    await expect(
        page.getByText('アカウント登録完了', { exact: true })
    ).toBeVisible({ timeout: 15000 });

    const loginScreenLink = page.locator('a').filter({
        hasText: 'ログイン画面へ',
    });
    await expect(loginScreenLink).toBeVisible({ timeout: 15000 });
    await loginScreenLink.click({ timeout: 15000 });

    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await expect(
        page.getByRole('textbox', { name: 'メールアドレス' })
    ).toBeVisible({ timeout: 15000 });
    await expect(
        page.getByRole('textbox', { name: 'パスワード' })
    ).toBeVisible({ timeout: 15000 });
});
