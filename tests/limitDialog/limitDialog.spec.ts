import { test, expect } from '@playwright/test';
import { login } from "../../utils/login";
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

test('limit dialog', async ({ page }) => {
    test.setTimeout(60000);

    await login(page, {
        email: requireEnv('EPOSE_LIMIT_DIALOG_EMAIL'),
        password: requireEnv('EPOSE_LIMIT_DIALOG_PASSWORD'),
    });
    await page.waitForLoadState('domcontentloaded');

    // Wait for main content to be ready before interacting
    const planChangeLink = page.getByText('プラン変更はこちら');
    await expect(planChangeLink).toBeVisible({ timeout: 15000 });
    await planChangeLink.click();

    const dialog = page.locator("div[role=dialog]");
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await page.getByText('あとで').click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    const quickAnalysis = page.getByText('クイック分析');
    await expect(quickAnalysis).toBeVisible({ timeout: 10000 });
    await quickAnalysis.click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await page.getByText('あとで').click();
    await expect(dialog).toBeHidden({ timeout: 5000 });

    const sporeLink = page.getByText('Spore').first();
    await expect(sporeLink).toBeVisible({ timeout: 10000 });
    await sporeLink.click();
    await page.waitForLoadState('domcontentloaded');

    const newAnalysisLink = page.getByText("新規分析");
    await expect(newAnalysisLink).toBeVisible({ timeout: 15000 });
    await newAnalysisLink.click();
    await expect(dialog).toBeVisible({ timeout: 10000 });
});