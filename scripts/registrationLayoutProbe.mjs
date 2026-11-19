/**
 * Read-only registration confirmation layout probe (no 送信, no alias, no account).
 * Opens /application/complete, fills the business form, navigates to 入力内容確認 only.
 *
 * Usage: node scripts/registrationLayoutProbe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices, expect } from '@playwright/test';
import {
    STAGING_SMOKE_DEVICE_SCALE_FACTOR,
    STAGING_SMOKE_VIEWPORT,
    stagingSmokeBrowserContextOptions,
} from '../configs/playwright/smoke/stagingSmokeBrowser.mjs';

const OUT = path.join(process.cwd(), 'test-output/registration-layout-probe');
const COMPLETE_URL = 'https://app-stg.epose.com/application/complete';

const LEGACY_CONTEXT = {
    ...devices['Desktop Chrome'],
};

async function openConfirmationPage(page) {
    await page.goto(COMPLETE_URL, { waitUntil: 'domcontentloaded' });
    const form = page.locator('form').filter({
        has: page.locator('input[name="telephoneNumber"]'),
    });
    await expect(form).toBeVisible({ timeout: 60000 });

    const companyName = form.getByRole('textbox').nth(0);
    const contactName = form.getByRole('textbox').nth(1);
    const telephone = form.locator('input[name="telephoneNumber"]');
    const countrySelectTrigger = form.locator('.ant-select-selection-item');
    const prefectureOrCity = form.getByRole('textbox').nth(4);
    const streetAddress = form.getByRole('textbox').nth(5);
    const confirmButton = page.getByRole('button', { name: '入力内容を確認' });

    await companyName.fill('dfsfds');
    await contactName.fill('dfsfs');
    await telephone.fill('09012345678');
    await countrySelectTrigger.click();
    await page.getByRole('option', { name: 'Australia' }).click();
    await expect(form.locator('.ant-select-selection-item[title="Australia"]')).toBeVisible({
        timeout: 15000,
    });
    await page.keyboard.press('Escape');
    await prefectureOrCity.fill('New Queensland');
    await streetAddress.fill('Abbot Street');
    await expect(confirmButton).toBeEnabled({ timeout: 15000 });
    await confirmButton.click();
    await expect(page.getByText('入力内容確認', { exact: true })).toBeVisible({
        timeout: 30000,
    });
}

async function captureLayout(browser, label, contextOptions) {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    try {
        await openConfirmationPage(page);
        const metrics = await page.evaluate(() => ({
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
        }));
        fs.mkdirSync(OUT, { recursive: true });
        const png = path.join(OUT, `registration-confirmation-${label}.png`);
        const json = path.join(OUT, `registration-confirmation-${label}.json`);
        await page.screenshot({ path: png, fullPage: true });
        fs.writeFileSync(
            json,
            JSON.stringify(
                {
                    label,
                    playwrightViewport: contextOptions.viewport ?? null,
                    deviceScaleFactor: contextOptions.deviceScaleFactor ?? 1,
                    metrics,
                },
                null,
                2
            )
        );
        return { png, json, metrics };
    } finally {
        await context.close();
    }
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const staging = await captureLayout(browser, 'staging-1404-dpr2', stagingSmokeBrowserContextOptions());
        const legacy = await captureLayout(browser, 'legacy-desktop-chrome-1280', LEGACY_CONTEXT);
        console.log(
            JSON.stringify(
                {
                    outDir: OUT,
                    staging: {
                        viewport: STAGING_SMOKE_VIEWPORT,
                        deviceScaleFactor: STAGING_SMOKE_DEVICE_SCALE_FACTOR,
                        ...staging,
                    },
                    legacy: {
                        viewport: devices['Desktop Chrome'].viewport,
                        deviceScaleFactor: devices['Desktop Chrome'].deviceScaleFactor,
                        ...legacy,
                    },
                },
                null,
                2
            )
        );
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});