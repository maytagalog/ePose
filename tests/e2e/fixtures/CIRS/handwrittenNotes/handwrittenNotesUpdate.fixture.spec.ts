import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRE_EXISTING_NOTE_ID } from '../../../../CIRS/handwrittenNotes/handwrittenNotesFixtureConstants';
import { SAVE_MEMO_URL } from '../../../../CIRS/handwrittenNotes/handwrittenNotesCreateIdentity';
import {
    runCirsHandwrittenNoteUpdateFlow,
} from '../../../../CIRS/handwrittenNotes/handwrittenNotesFlow';
import { HANDWRITTEN_TEST_IDS } from '../../../../CIRS/handwrittenNotes/handwrittenNotesTestIds';

const SAVE_MEMO_IMAGE_URL = 'https://api-stg.epose.com/customer_interaction_record/save_memo_image';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-handwritten-fixture.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type ShellOptions = {
    failUpdateSave?: boolean;
    editorWrongServiceId?: boolean;
    editorWrongNoteId?: boolean;
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsHandwrittenNotesShell.html'), 'utf8');
}

async function installShell(page: import('@playwright/test').Page, options?: ShellOptions): Promise<void> {
    await page.route(SAVE_MEMO_URL, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: crypto.randomUUID(), customerServiceId: RECORD_ID }),
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
        (window as unknown as { __hnFailUpdateSave?: boolean }).__hnFailUpdateSave =
            flags.failUpdateSave ?? false;
        (window as unknown as { __hnEditorWrongServiceId?: boolean }).__hnEditorWrongServiceId =
            flags.editorWrongServiceId ?? false;
        (window as unknown as { __hnEditorWrongNoteId?: boolean }).__hnEditorWrongNoteId =
            flags.editorWrongNoteId ?? false;
    }, options ?? {});
}

async function openRecord(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
}

test('update pre-existing note succeeds (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await openRecord(page);
    const result = await runCirsHandwrittenNoteUpdateFlow(page, {
        customerId: CUSTOMER_ID,
        recordId: RECORD_ID,
        noteId: PRE_EXISTING_NOTE_ID,
    });
    expect(result.updateVerified).toBe(true);
    await expect(page.getByTestId(HANDWRITTEN_TEST_IDS.section)).toBeVisible();
});

test('existing editor without data-customer-service-id succeeds (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await openRecord(page);
    await page.getByTestId(HANDWRITTEN_TEST_IDS.section).locator(
        `[data-testid="${HANDWRITTEN_TEST_IDS.item}"][data-note-id="${PRE_EXISTING_NOTE_ID}"]`
    ).click();
    const editor = page.getByTestId(HANDWRITTEN_TEST_IDS.editor);
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-note-id', PRE_EXISTING_NOTE_ID);
    await expect(editor).not.toHaveAttribute('data-customer-service-id', /.+/);
});

test('incorrect editor data-customer-service-id stops before drawing or save (fixture)', async ({
    page,
}) => {
    test.setTimeout(60000);
    await installShell(page, { editorWrongServiceId: true });
    await openRecord(page);
    await expect(
        runCirsHandwrittenNoteUpdateFlow(page, {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            noteId: PRE_EXISTING_NOTE_ID,
        })
    ).rejects.toThrow(/data-customer-service-id mismatch/i);
});

test('incorrect editor data-note-id stops before drawing or save (fixture)', async ({ page }) => {
    test.setTimeout(60000);
    await installShell(page, { editorWrongNoteId: true });
    await openRecord(page);
    await expect(
        runCirsHandwrittenNoteUpdateFlow(page, {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            noteId: PRE_EXISTING_NOTE_ID,
        })
    ).rejects.toThrow(/toHaveAttribute|data-note-id/i);
});

test('wrong noteId stops before drawing or save (fixture)', async ({ page }) => {
    test.setTimeout(60000);
    await installShell(page);
    await openRecord(page);
    await expect(
        runCirsHandwrittenNoteUpdateFlow(page, {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            noteId: '00000000-0000-4000-8000-000000000099',
        })
    ).rejects.toThrow(/exact handwritten item|toHaveCount/i);
    await expect(page.getByTestId(HANDWRITTEN_TEST_IDS.editor)).toBeHidden();
});

test('failed update save is not reported as verified (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };

    await installShell(page, { failUpdateSave: true });
    await openRecord(page);

    try {
        await expect(
            runCirsHandwrittenNoteUpdateFlow(page, {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                noteId: PRE_EXISTING_NOTE_ID,
            })
        ).rejects.toThrow(/operation-success update/i);
    } finally {
        console.log = originalLog;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_UPDATE_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_HANDWRITTEN_UPDATE_FAILED '.length));
    expect(payload.updateVerified).toBe(false);
    expect(payload.coverage).toBe('Handwritten Note update');
});
