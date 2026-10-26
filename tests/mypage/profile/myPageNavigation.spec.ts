import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    AUTH_PROFILE_URL,
    appNavigationMenuDialog,
    assertMyPageSignedInEmail,
    navigateToMyPage,
    waitForMyPageReadOnlyReady,
} from './myPageProfileFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';

function loadMyPageNavigationFixture(): string {
    return fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageNavigationMenu.html'),
        'utf8'
    );
}

async function installNavigationFixture(page: import('@playwright/test').Page): Promise<void> {
    const html = loadMyPageNavigationFixture();
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
}

test('navigateToMyPage: already on /my-page does not open Menu or wait for auth/profile', async ({
    page,
}) => {
    await installNavigationFixture(page);
    await page.goto(`${FIXTURE_ORIGIN}/my-page`, { waitUntil: 'domcontentloaded' });
    await waitForMyPageReadOnlyReady(page);

    let authProfileWaitStarted = false;
    page.on('request', (req) => {
        if (req.url() === AUTH_PROFILE_URL && req.method() === 'POST') {
            authProfileWaitStarted = true;
        }
    });

    await navigateToMyPage(page, { expectedEmail: 'user@example.com' });

    expect(await page.evaluate(() => (window as unknown as { __menuOpenCount: number }).__menuOpenCount)).toBe(0);
    expect(authProfileWaitStarted).toBe(false);
    await assertMyPageSignedInEmail(page, 'user@example.com');
});

test('navigateToMyPage: page title and dialog both マイページ — selects dialog item only', async ({
    page,
}) => {
    await installNavigationFixture(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await page.route(AUTH_PROFILE_URL, async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                email: 'user@example.com',
                directorFullName: 'Fixture PIC',
                furiganaFullName: 'テストフリガナ',
                showingName: 'Fixture Display',
            }),
        });
    });

    await navigateToMyPage(page);

    expect(await page.evaluate(() => (window as unknown as { __menuOpenCount: number }).__menuOpenCount)).toBe(1);
    expect(
        await page.evaluate(() => (window as unknown as { __myPageNavClickCount: number }).__myPageNavClickCount)
    ).toBe(1);
    await expect(appNavigationMenuDialog(page)).toBeHidden();
    await waitForMyPageReadOnlyReady(page);
});

test('navigateToMyPage: ambiguous dialog マイページ fails before auth/profile wait', async ({
    page,
}) => {
    await installNavigationFixture(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await page.evaluate(() => {
        const nav = document.getElementById('nav-dialog-body');
        const duplicate = document.createElement('span');
        duplicate.textContent = 'マイページ';
        nav?.appendChild(duplicate);
    });

    let authProfileRequests = 0;
    page.on('request', (req) => {
        if (req.url() === AUTH_PROFILE_URL && req.method() === 'POST') {
            authProfileRequests += 1;
        }
    });

    await expect(navigateToMyPage(page)).rejects.toThrow(/exactly one マイページ control/);
    expect(authProfileRequests).toBe(0);

    await page.waitForTimeout(250);
});
