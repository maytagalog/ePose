import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertMyPageProfileReadOnlyValues,
    myPageProfileReadOnlySection,
} from './myPageProfileFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);

const VALUES = {
    personInCharge: 'E2E PIC Value',
    furigana: 'テストフリガナ',
    displayName: 'E2E Display Value',
};

test('profile read-only: nested ancestors resolve to one profile section', async ({ page }) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'myPageProfileReadOnlyNested.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/my-page', { waitUntil: 'domcontentloaded' });

    const section = myPageProfileReadOnlySection(page);
    await expect(section).toHaveCount(1);

    const legacyAmbiguous = page
        .locator('div')
        .filter({ has: page.getByText('プロフィール', { exact: true }) })
        .filter({
            hasText: `${VALUES.personInCharge}（${VALUES.furigana}）`,
        });
    expect(await legacyAmbiguous.count()).toBeGreaterThan(1);

    await assertMyPageProfileReadOnlyValues(page, VALUES);
});
