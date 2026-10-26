import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { profileValuesFromAuthProfile, waitForProfileEditFormHydrated } from './myPageProfileFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);

const HYDRATED = {
    personInCharge: 'Hydrated PIC',
    furigana: 'テストミズ',
    displayName: 'Hydrated Display',
};

test('auth/profile mapping: null furigana becomes empty string', () => {
    expect(
        profileValuesFromAuthProfile({
            email: 'a@b.com',
            directorFullName: 'PIC',
            furiganaFullName: null,
            showingName: 'Display',
        })
    ).toEqual({
        personInCharge: 'PIC',
        furigana: '',
        displayName: 'Display',
    });
});

test('profile edit hydration: delayed values pass waitForProfileEditFormHydrated', async ({
    page,
}) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageProfileHydration.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/my-page?delayMs=500', {
        waitUntil: 'domcontentloaded',
    });

    const form = page.locator('form').filter({
        has: page.getByRole('button', { name: /保\s*存/ }),
    });
    await expect(form).toBeVisible();

    await waitForProfileEditFormHydrated(page, HYDRATED, {
        timeout: 5000,
        requireEditRoute: false,
    });
});

test('profile edit hydration: stale values fail waitForProfileEditFormHydrated', async ({
    page,
}) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageProfileHydration.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/my-page?delayMs=800&stale=1', {
        waitUntil: 'domcontentloaded',
    });

    const form = page.locator('form').filter({
        has: page.getByRole('button', { name: /保\s*存/ }),
    });
    await expect(form).toBeVisible();

    await expect(
        waitForProfileEditFormHydrated(page, HYDRATED, {
            timeout: 1200,
            requireEditRoute: false,
        })
    ).rejects.toThrow(/Timeout|toHaveValue|Hydrated/);
});
