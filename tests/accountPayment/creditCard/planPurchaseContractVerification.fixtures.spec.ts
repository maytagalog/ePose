import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    DEFAULT_THREE_MONTH_PLAN_SELECTION,
    verifyContractAfterPurchase,
    verifyContractUiAfterPurchase,
} from './planPurchaseFlow';
import { STAGING_PAID_THREE_MONTH_SUBSCRIPTION } from './planPurchaseSubscriptionFixtures';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);

function loadFixture(name: string): string {
    return fs.readFileSync(path.join(e2eFixturesDir, name), 'utf8');
}

test('fixture: verifyContractAfterPurchase scopes current plan away from auto-renewal label', async ({
    page,
}) => {
    await page.setContent(loadFixture('planPurchaseContractInformation.html'), {
        waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('.payment-method-label')).toHaveCount(2);

    await verifyContractAfterPurchase(
        page,
        DEFAULT_THREE_MONTH_PLAN_SELECTION,
        '4242',
        STAGING_PAID_THREE_MONTH_SUBSCRIPTION,
        { expectedProductId: 'prod_RXIaLSfCyyeH7d' }
    );

    await expect(page.getByText('3ヶ月プラン', { exact: true })).toHaveCount(1);
    await expect(page.getByText('3ヶ月プラン（自動更新）', { exact: true })).toHaveCount(1);
});

test('fixture: verifyContractUiAfterPurchase remains usable without subscription API', async ({
    page,
}) => {
    await page.setContent(loadFixture('planPurchaseContractInformation.html'), {
        waitUntil: 'domcontentloaded',
    });
    await verifyContractUiAfterPurchase(page, DEFAULT_THREE_MONTH_PLAN_SELECTION, '4242');
});
