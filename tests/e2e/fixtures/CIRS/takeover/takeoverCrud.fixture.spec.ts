import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCirsTakeoverCrudFlow } from '../../../../CIRS/takeover/takeoverFlow';
import {
    HANDOVER_SMOKE_CREATE_TEXT,
    HANDOVER_SMOKE_UPDATE_TEXT,
} from '../../../../CIRS/takeover/takeoverSmokeText';
import {
    PRE_EXISTING_HANDOVER_ID,
    PRE_EXISTING_HANDOVER_ID_2,
} from '../../../../CIRS/takeover/takeoverFixtureConstants';
import { HANDOVER_TEST_IDS } from '../../../../CIRS/takeover/takeoverTestIds';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-handover-fixture.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test.describe.configure({ mode: 'serial' });

type ShellOptions = {
    failCreate?: boolean;
    failDelete?: boolean;
    retainItemAfterDelete?: boolean;
    previewLoadError?: boolean;
    stuckPreviewLoading?: boolean;
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsTakeoverShell.html'), 'utf8');
}

async function installShell(page: import('@playwright/test').Page, options?: ShellOptions): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.addInitScript((cfg) => {
        const flags = cfg as ShellOptions;
        const w = window as unknown as Record<string, unknown>;
        w.__toFailCreate = flags.failCreate ?? false;
        w.__toFailDelete = flags.failDelete ?? false;
        w.__toRetainItemAfterDelete = flags.retainItemAfterDelete ?? false;
        w.__toPreviewLoadError = flags.previewLoadError ?? false;
        w.__toStuckPreviewLoading = flags.stuckPreviewLoading ?? false;
    }, options ?? {});
}

async function openRecord(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
}

function handoverEditorDialog(page: import('@playwright/test').Page) {
    return page.getByRole('dialog').filter({
        has: page.getByTestId(HANDOVER_TEST_IDS.editor),
    });
}

test('create submit lives in dialog footer and enables after content fill', async ({ page }) => {
    await installShell(page);
    await openRecord(page);

    await page.getByTestId(HANDOVER_TEST_IDS.create).click();
    const dialog = handoverEditorDialog(page);
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();

    const editor = dialog.getByTestId(HANDOVER_TEST_IDS.editor);
    await expect(editor.getByTestId(HANDOVER_TEST_IDS.submit)).toHaveCount(0);

    const submit = dialog.getByTestId(HANDOVER_TEST_IDS.submit);
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();

    await editor.getByTestId(HANDOVER_TEST_IDS.content).fill(HANDOVER_SMOKE_CREATE_TEXT);
    await expect(submit).toBeEnabled();
});

test('edit update and delete live in dialog footer, not inside editor', async ({ page }) => {
    await installShell(page);
    await openRecord(page);

    const previewItem = page
        .getByTestId(HANDOVER_TEST_IDS.section)
        .locator(`[data-testid="${HANDOVER_TEST_IDS.item}"][data-handover-id="${PRE_EXISTING_HANDOVER_ID}"]`);
    await previewItem.click();

    const dialog = handoverEditorDialog(page);
    await expect(dialog).toHaveCount(1);
    const editor = dialog.getByTestId(HANDOVER_TEST_IDS.editor);
    await expect(editor.getByTestId(HANDOVER_TEST_IDS.update)).toHaveCount(0);
    await expect(editor.getByTestId(HANDOVER_TEST_IDS.delete)).toHaveCount(0);

    const update = dialog.getByTestId(HANDOVER_TEST_IDS.update);
    const deleteButton = dialog.getByTestId(HANDOVER_TEST_IDS.delete);
    await expect(update).toBeVisible();
    await expect(deleteButton).toBeVisible();
    await expect(update).toBeDisabled();
    await expect(deleteButton).toBeEnabled();

    await editor.getByTestId(HANDOVER_TEST_IDS.content).fill(HANDOVER_SMOKE_UPDATE_TEXT);
    await expect(update).toBeEnabled();
});

test('full handover CRUD passes on fixture with numeric-string handover IDs', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await openRecord(page);

    const result = await runCirsTakeoverCrudFlow(page, { customerId: CUSTOMER_ID, recordId: RECORD_ID });

    expect(result.createVerified).toBe(true);
    expect(result.readVerified).toBe(true);
    expect(result.updateVerified).toBe(true);
    expect(result.deleteVerified).toBe(true);
    expect(result.handoverId).toMatch(/^\d+$/);
    expect(result.handoverId).not.toBe(PRE_EXISTING_HANDOVER_ID);
    expect(result.handoverId).not.toBe(PRE_EXISTING_HANDOVER_ID_2);
    expect(result.crudSummary.create).toBe('Passed');
    expect(result.crudSummary.read).toBe('Passed');
    expect(result.crudSummary.update).toBe('Passed');
    expect(result.crudSummary.delete).toBe('Passed');

    const section = page.getByTestId('cirs-handover-section');
    await expect(section).toHaveAttribute('data-load-state', 'loaded');
    await expect(
        section.locator(`[data-testid="cirs-handover-item"][data-handover-id="${result.handoverId}"]`)
    ).toHaveCount(0);
    await expect(
        section.locator(
            `[data-testid="cirs-handover-item"][data-handover-id="${PRE_EXISTING_HANDOVER_ID}"]`
        )
    ).toHaveCount(1);
    await expect(
        section.locator(
            `[data-testid="cirs-handover-item"][data-handover-id="${PRE_EXISTING_HANDOVER_ID_2}"]`
        )
    ).toHaveCount(1);
});

test('create/read/update/delete use expected smoke copy on fixture', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await openRecord(page);

    const result = await runCirsTakeoverCrudFlow(page, { customerId: CUSTOMER_ID, recordId: RECORD_ID });
    expect(result.handoverId).toBeTruthy();

    const retained = page
        .getByTestId('cirs-handover-section')
        .locator(`[data-handover-id="${PRE_EXISTING_HANDOVER_ID}"]`);
    await expect(retained.getByText('seed-' + PRE_EXISTING_HANDOVER_ID, { exact: true })).toBeVisible();
    expect(HANDOVER_SMOKE_CREATE_TEXT).toBe('Staging Smoke Automation');
    expect(HANDOVER_SMOKE_UPDATE_TEXT).toBe('Staging Smoke Automation Updated');
});

test('delete path fails when preview still lists deleted handover after load', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { retainItemAfterDelete: true });
    await openRecord(page);

    await expect(
        runCirsTakeoverCrudFlow(page, { customerId: CUSTOMER_ID, recordId: RECORD_ID })
    ).rejects.toThrow(/handover item absent/);
});

test('CRUD stops at preview load error before create baseline', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { previewLoadError: true });
    await openRecord(page);

    await expect(
        runCirsTakeoverCrudFlow(page, { customerId: CUSTOMER_ID, recordId: RECORD_ID })
    ).rejects.toThrow(/data-load-state="error"/);
});

test('CRUD stops when preview never reaches loaded', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { stuckPreviewLoading: true });
    await openRecord(page);

    await expect(
        runCirsTakeoverCrudFlow(page, { customerId: CUSTOMER_ID, recordId: RECORD_ID })
    ).rejects.toThrow(/data-load-state="loaded"|Received:.*loading/);
});
