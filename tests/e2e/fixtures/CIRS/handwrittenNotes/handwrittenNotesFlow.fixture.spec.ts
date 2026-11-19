import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CirsRecordContext } from '../../../../CIRS/cirsRecord/cirsRecordFlow';
import { PRE_EXISTING_NOTE_ID } from '../../../../CIRS/handwrittenNotes/handwrittenNotesFixtureConstants';
import { SAVE_MEMO_URL } from '../../../../CIRS/handwrittenNotes/handwrittenNotesCreateIdentity';
import {
    expectedNewHandwrittenMemoUrl,
    runCirsHandwrittenNotesFlow,
} from '../../../../CIRS/handwrittenNotes/handwrittenNotesFlow';
import { HANDWRITTEN_TEST_IDS, NOTE_ID_ATTR } from '../../../../CIRS/handwrittenNotes/handwrittenNotesTestIds';

const SAVE_MEMO_IMAGE_URL = 'https://api-stg.epose.com/customer_interaction_record/save_memo_image';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-handwritten-fixture.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type ShellOptions = {
    failCreateSave?: boolean;
    wrongMemoRoute?: boolean;
    listLoadDelayMs?: number;
    listLoadStuck?: boolean;
    listLoadError?: boolean;
    editorMountDelayMs?: number;
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsHandwrittenNotesShell.html'), 'utf8');
}

function recordContext(): CirsRecordContext {
    return {
        customerId: CUSTOMER_ID,
        customerName: 'Fixture Customer',
        customerFurigana: 'フィクスチャ',
        recordId: RECORD_ID,
        recordUrl: `${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`,
        createAttempted: false,
        createConfirmed: true,
        recordIdentitySource: 'route_only',
        customerIdFromApi: null,
        apiParseNotes: ['fixture'],
    };
}

async function installShell(page: import('@playwright/test').Page, options?: ShellOptions): Promise<void> {
    await page.route(SAVE_MEMO_URL, async (route) => {
        const body = route.request().postDataJSON() as { customerServiceId?: string } | null;
        if (body?.customerServiceId !== RECORD_ID) {
            await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: crypto.randomUUID(),
                customerServiceId: RECORD_ID,
            }),
        });
    });
    await page.route(SAVE_MEMO_IMAGE_URL, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
    });
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.addInitScript((cfg) => {
        const flags = cfg as ShellOptions;
        (window as unknown as { __hnFailCreateSave?: boolean }).__hnFailCreateSave =
            flags.failCreateSave ?? false;
        (window as unknown as { __hnWrongMemoRoute?: boolean }).__hnWrongMemoRoute =
            flags.wrongMemoRoute ?? false;
        (window as unknown as { __hnListLoadDelayMs?: number }).__hnListLoadDelayMs =
            flags.listLoadDelayMs ?? 0;
        (window as unknown as { __hnListLoadStuck?: boolean }).__hnListLoadStuck =
            flags.listLoadStuck ?? false;
        (window as unknown as { __hnListLoadError?: boolean }).__hnListLoadError =
            flags.listLoadError ?? false;
        (window as unknown as { __hnEditorMountDelayMs?: number }).__hnEditorMountDelayMs =
            flags.editorMountDelayMs ?? 0;
    }, options ?? {});
}

async function openRecord(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
}

test('create only adds note and keeps pre-existing notes (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await openRecord(page);
    const result = await runCirsHandwrittenNotesFlow(page, recordContext());
    expect(result.createServerConfirmed).toBe(true);
    expect(result.createIdentityVerified).toBe(true);
    expect(result.noteId).toBeTruthy();
    expect(result.noteIdentitySource).toBe('save_memo_response');
    expect(result.listVerificationStatus).toBe('verified');
    expect(result.noteRetainedOnStaging).toBe(true);
    const section = page.getByTestId(HANDWRITTEN_TEST_IDS.section);
    await expect(
        section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${PRE_EXISTING_NOTE_ID}"]`)
    ).toHaveCount(1);
    await expect(
        section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${result.noteId}"]`)
    ).toHaveCount(1);
});

test('save_memo identity succeeds when editor is removed on save (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await openRecord(page);
    const result = await runCirsHandwrittenNotesFlow(page, recordContext());
    expect(result.createIdentityVerified).toBe(true);
    expect(result.noteIdentitySource).toBe('save_memo_response');
    await expect(page.getByTestId(HANDWRITTEN_TEST_IDS.editor)).toBeHidden();
    const section = page.getByTestId(HANDWRITTEN_TEST_IDS.section);
    await expect(
        section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${result.noteId}"]`)
    ).toHaveCount(1);
});

test('create flow waits for editor mount after default 5s assertion window (fixture)', async ({
    page,
}) => {
    test.setTimeout(120000);
    const editorMountDelayMs = 7000;
    await installShell(page, { editorMountDelayMs });
    await openRecord(page);
    const result = await runCirsHandwrittenNotesFlow(page, recordContext());
    expect(result.createIdentityVerified).toBe(true);
    expect(result.noteIdentitySource).toBe('save_memo_response');
});

test('new memo route matches expected customer and record (fixture)', async ({ page }) => {
    await installShell(page);
    await openRecord(page);
    await page.getByTestId(HANDWRITTEN_TEST_IDS.create).click();
    await expect(page).toHaveURL(expectedNewHandwrittenMemoUrl(FIXTURE_ORIGIN, CUSTOMER_ID, RECORD_ID));
    await expect(page.getByTestId(HANDWRITTEN_TEST_IDS.editor)).toHaveCount(1);
    const editor = page.getByTestId(HANDWRITTEN_TEST_IDS.editor);
    await expect(editor).toBeVisible();
    await expect(editor).not.toHaveAttribute('data-customer-service-id', /.+/);
});

test('wrong memo route fails before drawing or save (fixture)', async ({ page }) => {
    test.setTimeout(90000);
    await installShell(page, { wrongMemoRoute: true });
    await openRecord(page);
    await expect(runCirsHandwrittenNotesFlow(page, recordContext())).rejects.toThrow(/toHaveURL/i);
});

test('create save failure does not retry (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { failCreateSave: true });
    await openRecord(page);
    await expect(runCirsHandwrittenNotesFlow(page, recordContext())).rejects.toThrow(
        /operation-success create/i
    );
});
