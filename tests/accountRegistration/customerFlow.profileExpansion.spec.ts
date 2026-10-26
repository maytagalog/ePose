import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertSelectedCustomerReady,
    openCustomerProfileAndVerify,
    type CreatedCustomerRef,
} from './customerFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e/fixtures'
);

const CUSTOMER: CreatedCustomerRef = {
    name: 'E2E Fixture Customer',
    furigana: 'テストフィクスチャ',
    customerId: 'ef38959b-c155-455f-a1fc-e8027b874af8',
};

/**
 * Add Customer ends with profile expanded; Edit must not require collapsing first.
 */
test('expanded profile: selected-customer readiness and edit prechecks', async ({
    page,
}) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'expandedCustomerProfile.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto(
        `https://fixture.test/customers/${CUSTOMER.customerId}`,
        { waitUntil: 'domcontentloaded' }
    );

    await expect(
        page.getByRole('main').getByRole('button', { name: /顧客情報を非表示/ })
    ).toBeVisible();
    await expect(
        page.getByRole('main').getByRole('button', { name: '顧客情報を表示' })
    ).toBeHidden();

    await assertSelectedCustomerReady(page, CUSTOMER.name, CUSTOMER.furigana);

    await openCustomerProfileAndVerify(
        page,
        CUSTOMER.name,
        CUSTOMER.furigana
    );

    await assertSelectedCustomerReady(page, CUSTOMER.name, CUSTOMER.furigana);
});
