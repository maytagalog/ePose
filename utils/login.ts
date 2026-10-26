import { Page, expect } from '@playwright/test';

export type LoginCredentials = {
    email?: string;
    password?: string;
    /** When true, assume the browser is already on /login; do not call page.goto(). */
    skipNavigation?: boolean;
};

export async function login(
    page: Page,
    credentials?: LoginCredentials
) {

    const email = credentials?.email ?? process.env.EPOSE_LOGIN_EMAIL;
    const password = credentials?.password ?? process.env.EPOSE_LOGIN_PASSWORD;

    if (!email?.trim() || !password) {
        throw new Error(
           'Provide login credentials explicitly or set EPOSE_LOGIN_EMAIL and EPOSE_LOGIN_PASSWORD.'
        );
   }

    const skipNavigation = credentials?.skipNavigation ?? false;

    if (skipNavigation) {
        await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    } else {
        await page.goto('https://app-stg.epose.com/login', {
            waitUntil: 'domcontentloaded',
        });
    }

    const closeButton = page.locator('button', { hasText: 'とじる' });
    if (await closeButton.isVisible()) {
        await closeButton.click();
    }

    await page
        .getByRole('textbox', { name: 'メールアドレス' })
        .fill(email);

    await page
        .getByRole('textbox', { name: 'パスワード' })
        .fill(password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForTimeout(5000);

    const continueButton = page.getByRole('button', { name: '続行する' });
    if (await continueButton.isVisible()) {
        await continueButton.click();
    }
    await page.waitForURL(/customers/, { waitUntil: 'domcontentloaded' });

    const nextButton = page.locator('#next');
    if (await nextButton.isVisible()) {
        while (await nextButton.isVisible()) {
            await nextButton.click();
        }
        await page.getByText('利用を開始する').click();
        await page.getByText('OK').click();
    }
}
