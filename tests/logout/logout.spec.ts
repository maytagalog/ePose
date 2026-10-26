import { test, expect } from '@playwright/test';
import { login } from "../../utils/login"
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

test('logout', async ({ page }) => {
    test.setTimeout(60000);
    await login(page, {
        email: requireEnv('EPOSE_LOGOUT_EMAIL'),
        password: requireEnv('EPOSE_LOGOUT_PASSWORD'),
    });
    await page.getByRole('img', { name: 'Menu' }).click();
    await expect(page.getByText('ログアウト')).toBeVisible();
    await page.getByText('ログアウト').click()
    await page.waitForURL('https://app-stg.epose.com/login', { waitUntil: "domcontentloaded", timeout: 50000 });
});