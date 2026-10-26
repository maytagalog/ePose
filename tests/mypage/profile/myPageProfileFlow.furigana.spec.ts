import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertMyPageProfileReadOnlyValues,
    assertProfileValuesEqual,
    MyPageProfilePersistenceError,
    profileReadOnlyCombinedNameLine,
    waitForProfileEditFormHydrated,
    openMyPageProfileEditFromReadOnly,
    gotoMyPageReadOnly,
    returnToMyPageReadOnlyFromEdit,
    assertMyPageReadOnlyRoute,
    type MyPageProfileValues,
} from './myPageProfileFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);

const FIXTURE_NAV = {
    readOnlyUrl: 'https://fixture.test/my-page',
    waitForAuthProfile: false,
} as const;

test('combined read-only line: name（furigana） when furigana is set', () => {
    expect(profileReadOnlyCombinedNameLine('Person', 'テストア')).toBe('Person（テストア）');
    expect(profileReadOnlyCombinedNameLine('Person', '')).toBe('Person');
});

test('read-only section: exact combined name（furigana） in profile card', async ({ page }) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageProfileReadOnlyNested.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/my-page', { waitUntil: 'domcontentloaded' });

    await assertMyPageProfileReadOnlyValues(page, {
        personInCharge: 'E2E PIC Value',
        furigana: 'テストフリガナ',
        displayName: 'E2E Display Value',
    });
});

test('furigana smoke fixture: one save, unchanged fields, persistence after fresh load', async ({
    page,
}) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageProfileFuriganaSmoke.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });

    await page.goto('https://fixture.test/my-page', { waitUntil: 'domcontentloaded' });

    const baseline: MyPageProfileValues = {
        personInCharge: 'Fixture PIC',
        furigana: 'テストオリジ',
        displayName: 'Fixture Display',
    };
    const newFurigana = 'テストシンキ';

    await openMyPageProfileEditFromReadOnly(page);
    await waitForProfileEditFormHydrated(page, baseline, { requireEditRoute: true });

    const form = page.locator('form').filter({
        has: page.getByRole('button', { name: /保\s*存/ }),
    });
    await form.getByRole('textbox').nth(1).fill(newFurigana);
    await expect(form.getByRole('textbox').nth(0)).toHaveValue(baseline.personInCharge);
    await expect(form.getByRole('textbox').nth(2)).toHaveValue(baseline.displayName);

    await form.getByRole('button', { name: /保\s*存/ }).click();
    await assertMyPageReadOnlyRoute(page);

    const expected: MyPageProfileValues = { ...baseline, furigana: newFurigana };
    await assertMyPageProfileReadOnlyValues(page, expected);
    expect(await page.evaluate(() => (window as unknown as { __getSaveClickCount: () => number }).__getSaveClickCount())).toBe(1);

    await gotoMyPageReadOnly(page, FIXTURE_NAV);
    await openMyPageProfileEditFromReadOnly(page);
    await waitForProfileEditFormHydrated(page, expected);
    await returnToMyPageReadOnlyFromEdit(page, FIXTURE_NAV);
    await assertMyPageReadOnlyRoute(page);
});

test('furigana persistence: stale furigana fails hydration after fresh load', async ({ page }) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageProfileFuriganaSmoke.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/my-page/profile/edit', {
        waitUntil: 'domcontentloaded',
    });

    const stale: MyPageProfileValues = {
        personInCharge: 'Fixture PIC',
        furigana: 'テストオリジ',
        displayName: 'Fixture Display',
    };
    const persisted: MyPageProfileValues = { ...stale, furigana: 'テストシンキ' };

    await expect(
        waitForProfileEditFormHydrated(page, persisted, { timeout: 800 })
    ).rejects.toBeTruthy();

    await waitForProfileEditFormHydrated(page, stale);
    assertProfileValuesEqual(stale, stale, 'stale-baseline');
    expect(() =>
        assertProfileValuesEqual(persisted, stale, 'must-not-match-persisted')
    ).toThrow(MyPageProfilePersistenceError);
});
