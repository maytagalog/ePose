import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    customerDeleteConfirmationDialog,
    verifyDeleteConfirmationDialogIdentity,
    type CreatedCustomerRef,
} from './customerFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e/fixtures'
);

const TARGET: CreatedCustomerRef = {
    name: 'E2E Target Customer Edited',
    furigana: 'テストターゲット',
    customerId: '8e71de1a-7550-4bf8-8bca-91a90834507d',
};

test('delete confirmation: requires agree before 削 除', async ({ page }) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'deleteConfirmationDialog.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/customers/target-id', {
        waitUntil: 'domcontentloaded',
    });

    const dialog = customerDeleteConfirmationDialog(page);
    await verifyDeleteConfirmationDialogIdentity(dialog, TARGET);

    const confirmButton = dialog.getByRole('button', { name: '削 除' });
    await expect(confirmButton).toBeDisabled();
    await dialog.getByRole('checkbox', { name: /同意する/ }).check();
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(dialog).toBeHidden();
});

test('delete confirmation: rejects identity mismatch in dialog', async ({
    page,
}) => {
    const html = fs.readFileSync(
        path.join(e2eFixturesDir, 'deleteConfirmationDialog.html'),
        'utf8'
    );
    await page.route('https://fixture.test/**', (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://fixture.test/customers/target-id', {
        waitUntil: 'domcontentloaded',
    });

    const dialog = customerDeleteConfirmationDialog(page);
    const wrongRef: CreatedCustomerRef = {
        ...TARGET,
        name: 'Wrong Customer Name',
    };
    await expect(
        verifyDeleteConfirmationDialogIdentity(dialog, wrongRef)
    ).rejects.toThrow();
});
