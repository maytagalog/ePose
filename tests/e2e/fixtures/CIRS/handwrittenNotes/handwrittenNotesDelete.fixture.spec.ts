import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PRE_EXISTING_NOTE_ID,
    PRE_EXISTING_NOTE_ID_2,
} from '../../../../CIRS/handwrittenNotes/handwrittenNotesFixtureConstants';
import { runCirsHandwrittenNoteDeleteFlow } from '../../../../CIRS/handwrittenNotes/handwrittenNotesFlow';
import {
    HANDWRITTEN_SECTION_LOAD_STATES,
    HANDWRITTEN_SECTION_LOAD_STATE_ATTR,
    HANDWRITTEN_TEST_IDS,
    NOTE_ID_ATTR,
} from '../../../../CIRS/handwrittenNotes/handwrittenNotesTestIds';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-handwritten-fixture.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test.describe.configure({ mode: 'serial' });

type ShellOptions = {
    failDelete?: boolean;
    wrongDeleteEntityId?: boolean;
    surviveReloadAfterDelete?: boolean;
    listLoadDelayMs?: number;
    listLoadStuck?: boolean;
    seedNoteIds?: string[];
    zeroSizeDeleteWrapper?: boolean;
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsHandwrittenNotesShell.html'), 'utf8');
}

async function installShell(page: import('@playwright/test').Page, options?: ShellOptions): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.addInitScript((cfg) => {
        const flags = cfg as ShellOptions;
        const w = window as unknown as Record<string, unknown>;
        w.__hnFailDelete = flags.failDelete ?? false;
        w.__hnWrongDeleteEntityId = flags.wrongDeleteEntityId ?? false;
        w.__hnSurviveReloadAfterDelete = flags.surviveReloadAfterDelete ?? false;
        w.__hnListLoadDelayMs = flags.listLoadDelayMs ?? 0;
        w.__hnListLoadStuck = flags.listLoadStuck ?? false;
        w.__hnSeedNoteIds = flags.seedNoteIds ?? null;
        w.__hnZeroSizeDeleteWrapper = flags.zeroSizeDeleteWrapper ?? true;
    }, options ?? {});
}

async function openRecord(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
}

test('delete target note succeeds and preserves other notes (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await openRecord(page);
    const result = await runCirsHandwrittenNoteDeleteFlow(page, {
        customerId: CUSTOMER_ID,
        recordId: RECORD_ID,
        noteId: PRE_EXISTING_NOTE_ID,
    });
    expect(result.deleteVerified).toBe(true);
    expect(result.deleteServerConfirmed).toBe(true);
    expect(result.noteRetainedOnStaging).toBe(false);
    const section = page.getByTestId(HANDWRITTEN_TEST_IDS.section);
    await expect(
        section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${PRE_EXISTING_NOTE_ID}"]`)
    ).toHaveCount(0);
    await expect(
        section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${PRE_EXISTING_NOTE_ID_2}"]`)
    ).toHaveCount(1);
});

test('delete sole note leaves loaded empty list (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { seedNoteIds: [PRE_EXISTING_NOTE_ID] });
    await openRecord(page);
    const result = await runCirsHandwrittenNoteDeleteFlow(page, {
        customerId: CUSTOMER_ID,
        recordId: RECORD_ID,
        noteId: PRE_EXISTING_NOTE_ID,
    });
    expect(result.deleteVerified).toBe(true);
    const section = page.getByTestId(HANDWRITTEN_TEST_IDS.section);
    await expect(section).toHaveAttribute(
        HANDWRITTEN_SECTION_LOAD_STATE_ATTR,
        HANDWRITTEN_SECTION_LOAD_STATES.loaded
    );
    await expect(section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"]`)).toHaveCount(0);
});

test('delayed list loading still verifies after loaded (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { listLoadDelayMs: 800, seedNoteIds: [PRE_EXISTING_NOTE_ID] });
    await openRecord(page);
    const result = await runCirsHandwrittenNoteDeleteFlow(page, {
        customerId: CUSTOMER_ID,
        recordId: RECORD_ID,
        noteId: PRE_EXISTING_NOTE_ID,
    });
    expect(result.deleteVerified).toBe(true);
});

test('list stuck loading fails delete verification (fixture)', async ({ page }) => {
    test.setTimeout(60000);
    await installShell(page, { listLoadStuck: true, seedNoteIds: [PRE_EXISTING_NOTE_ID] });
    await openRecord(page);
    await expect(
        runCirsHandwrittenNoteDeleteFlow(page, {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            noteId: PRE_EXISTING_NOTE_ID,
        })
    ).rejects.toThrow(/loaded|Timed out/i);
});

test('zero-size outer delete wrapper with visible inner dialog succeeds (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, {
        zeroSizeDeleteWrapper: true,
        seedNoteIds: [PRE_EXISTING_NOTE_ID],
    });
    await openRecord(page);
    const result = await runCirsHandwrittenNoteDeleteFlow(page, {
        customerId: CUSTOMER_ID,
        recordId: RECORD_ID,
        noteId: PRE_EXISTING_NOTE_ID,
    });
    expect(result.deleteVerified).toBe(true);
});

test('wrong delete dialog entity id stops before confirmation (fixture)', async ({ page }) => {
    test.setTimeout(60000);
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };

    await installShell(page, { wrongDeleteEntityId: true });
    await openRecord(page);

    try {
        await expect(
            runCirsHandwrittenNoteDeleteFlow(page, {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                noteId: PRE_EXISTING_NOTE_ID,
            })
        ).rejects.toThrow(/data-entity-id|toHaveAttribute/i);
    } finally {
        console.log = originalLog;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_DELETE_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_HANDWRITTEN_DELETE_FAILED '.length));
    expect(payload.deleteAttempted).toBe(false);
    expect(payload.deleteVerified).toBe(false);
});

test('wrong noteId stops before delete dialog (fixture)', async ({ page }) => {
    test.setTimeout(60000);
    await installShell(page);
    await openRecord(page);
    await expect(
        runCirsHandwrittenNoteDeleteFlow(page, {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            noteId: '00000000-0000-4000-8000-000000000099',
        })
    ).rejects.toThrow(/not present in loaded|exact handwritten item|toHaveCount/i);
});

test('failed delete confirm is not reported as verified (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };

    await installShell(page, { failDelete: true });
    await openRecord(page);

    try {
        await expect(
            runCirsHandwrittenNoteDeleteFlow(page, {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                noteId: PRE_EXISTING_NOTE_ID,
            })
        ).rejects.toThrow(/operation-success delete/i);
    } finally {
        console.log = originalLog;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_DELETE_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_HANDWRITTEN_DELETE_FAILED '.length));
    expect(payload.deleteVerified).toBe(false);
    expect(payload.deleteAttempted).toBe(true);
});

test('note resurrected after reload fails verification (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { surviveReloadAfterDelete: true, seedNoteIds: [PRE_EXISTING_NOTE_ID] });
    await openRecord(page);
    await expect(
        runCirsHandwrittenNoteDeleteFlow(page, {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            noteId: PRE_EXISTING_NOTE_ID,
        })
    ).rejects.toThrow(/absent for noteId|toHaveCount/i);
});
