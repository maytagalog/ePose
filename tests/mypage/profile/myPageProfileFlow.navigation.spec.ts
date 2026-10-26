import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertMyPageProfileEditRoute,
    assertMyPageReadOnlyRoute,
    openMyPageProfileEditFromReadOnly,
    readMyPageProfileBaselineAndReturnToReadOnly,
    returnToMyPageReadOnlyFromEdit,
    verifyProfilePersistenceAfterFreshLoad,
    waitForMyPageProfileEditReady,
    waitForMyPageReadOnlyReady,
} from './myPageProfileFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);

const FIXTURE_BASELINE = {
    personInCharge: 'Fixture PIC',
    furigana: 'テストフィクス',
    displayName: 'Fixture Display',
};

const FIXTURE_NAV = {
    readOnlyUrl: 'https://fixture.test/my-page',
    waitForAuthProfile: false,
} as const;

test.beforeEach(async ({ page }) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageProfileRoutes.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
});

test('profile routes: reload on edit stays on edit (staging behavior)', async ({ page }) => {
    await page.goto('https://fixture.test/my-page', { waitUntil: 'domcontentloaded' });
    await waitForMyPageReadOnlyReady(page);
    await page.getByRole('button', { name: /編\s*集/ }).click();
    await assertMyPageProfileEditRoute(page);
    await waitForMyPageProfileEditReady(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertMyPageProfileEditRoute(page);
    await expect(page.getByText('プロフィール編集', { exact: true })).toBeVisible();

    await expect(waitForMyPageReadOnlyReady(page)).rejects.toBeTruthy();
});

test('profile routes: baseline read finishes on read-only /my-page', async ({ page }) => {
    await page.goto('https://fixture.test/my-page', { waitUntil: 'domcontentloaded' });
    const baseline = await readMyPageProfileBaselineAndReturnToReadOnly(
        page,
        FIXTURE_NAV
    );
    expect(baseline).toEqual(FIXTURE_BASELINE);
    await assertMyPageReadOnlyRoute(page);
    await waitForMyPageReadOnlyReady(page);
});

test('profile routes: persistence verification finishes on read-only /my-page', async ({
    page,
}) => {
    await page.goto('https://fixture.test/my-page', { waitUntil: 'domcontentloaded' });
    await verifyProfilePersistenceAfterFreshLoad(
        page,
        FIXTURE_BASELINE,
        'fixture-persistence',
        undefined,
        FIXTURE_NAV
    );
    await assertMyPageReadOnlyRoute(page);
    await waitForMyPageReadOnlyReady(page);
});

test('profile routes: cancel returns from edit to read-only', async ({ page }) => {
    await page.goto('https://fixture.test/my-page/profile/edit', {
        waitUntil: 'domcontentloaded',
    });
    await waitForMyPageProfileEditReady(page);
    await returnToMyPageReadOnlyFromEdit(page);
    await assertMyPageReadOnlyRoute(page);
});

test('profile routes: open edit from read-only uses edit route', async ({ page }) => {
    await page.goto('https://fixture.test/my-page', { waitUntil: 'domcontentloaded' });
    await openMyPageProfileEditFromReadOnly(page);
    await assertMyPageProfileEditRoute(page);
    await returnToMyPageReadOnlyFromEdit(page);
});
