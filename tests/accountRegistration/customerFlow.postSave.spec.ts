import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertNoRegistrationCompleteDialogBlocking,
    handlePostSaveRegistrationOutcome,
    registrationCompleteDialog,
} from './customerFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e/fixtures'
);

async function loadPostSaveFixture(page: import('@playwright/test').Page) {
    const fixture = path.join(e2eFixturesDir, 'postSaveDialogRace.html');
    const html = fs.readFileSync(fixture, 'utf8');
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/customers/create', {
        waitUntil: 'domcontentloaded',
    });
    await page.evaluate(() => {
        const modal = document.getElementById('modal-wrap') as HTMLElement;
        document.getElementById('return-list')?.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        document.getElementById('profile')?.addEventListener('click', () => {
            const table = document.getElementById('profile-table');
            if (table) {
                table.hidden = false;
            }
        });
    });
}

/**
 * Local fixture: selected-customer URL appears before delayed 登録完了 modal.
 * Exercises production post-save orchestration (not live staging create).
 */
test('post-save dialog race: dismiss before profile click', async ({ page }) => {
    await loadPostSaveFixture(page);

    await page.evaluate(() => {
        const customerId = 'ef38959b-c155-455f-a1fc-e8027b874af8';
        history.pushState({}, '', `/customers/${customerId}`);
        window.setTimeout(() => {
            const modal = document.getElementById('modal-wrap') as HTMLElement;
            modal.style.display = 'block';
        }, 400);
    });

    await expect
        .poll(() =>
            page.evaluate(() => /\/customers\/[0-9a-f-]{36}/i.test(location.pathname))
        )
        .toBe(true);
    await expect(registrationCompleteDialog(page)).toBeHidden();

    await handlePostSaveRegistrationOutcome(page);
    await assertNoRegistrationCompleteDialogBlocking(page);

    await page.getByRole('main').getByRole('button', { name: '顧客情報を表示' }).click();
    await expect(page.locator('#profile-table')).toBeVisible();
});

test('post-save: fails when 登録完了 never appears', async ({ page }) => {
    test.setTimeout(40000);
    await loadPostSaveFixture(page);

    await page.evaluate(() => {
        const customerId = 'ef38959b-c155-455f-a1fc-e8027b874af8';
        history.pushState({}, '', `/customers/${customerId}`);
    });

    await expect
        .poll(() =>
            page.evaluate(() => /\/customers\/[0-9a-f-]{36}/i.test(location.pathname))
        )
        .toBe(true);
    await expect(registrationCompleteDialog(page)).toBeHidden();

    await expect(handlePostSaveRegistrationOutcome(page)).rejects.toThrow();

    await expect(page.locator('#profile-table')).toBeHidden();
    await expect(registrationCompleteDialog(page)).toBeHidden();
});
