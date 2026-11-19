import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    captureCanvasContentSignature,
    resolveHandwrittenDrawingSurfaces,
    resolveHandwrittenDrawingToolbarRect,
    runHandwrittenDrawingSequence,
} from '../../../../CIRS/handwrittenNotes/handwrittenNotesDrawing';
import { PRE_EXISTING_NOTE_ID } from '../../../../CIRS/handwrittenNotes/handwrittenNotesFixtureConstants';
import {
    HANDWRITTEN_DRAWING_CONTROLS,
    HANDWRITTEN_TEST_IDS,
} from '../../../../CIRS/handwrittenNotes/handwrittenNotesTestIds';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-handwritten-drawing-fixture.test';

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsHandwrittenNotesShell.html'), 'utf8');
}

async function installKonvaDualCanvasShell(
    page: import('@playwright/test').Page,
    options?: { floatingToolbar?: boolean }
): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.addInitScript((opts) => {
        (window as unknown as { __hnKonvaDualCanvasLayout: boolean }).__hnKonvaDualCanvasLayout =
            true;
        if (opts.floatingToolbar) {
            (window as unknown as { __hnFloatingToolbar: boolean }).__hnFloatingToolbar = true;
        }
    }, options ?? {});
}

async function openExistingNoteEditor(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(
        `${FIXTURE_ORIGIN}/customers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/interaction-records/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`
    );
    await page
        .getByTestId(HANDWRITTEN_TEST_IDS.section)
        .locator(
            `[data-testid="${HANDWRITTEN_TEST_IDS.item}"][data-note-id="${PRE_EXISTING_NOTE_ID}"]`
        )
        .click();
}

test('create: one black horizontal stroke on direct canvas', async ({ page }) => {
    test.setTimeout(120000);
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.goto(
        `${FIXTURE_ORIGIN}/customers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/interaction-records/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`
    );
    await page.getByTestId(HANDWRITTEN_TEST_IDS.create).click();
    const editor = page.getByTestId(HANDWRITTEN_TEST_IDS.editor);
    await expect(editor).toBeVisible();
    const stage = editor.getByTestId(HANDWRITTEN_TEST_IDS.canvas);
    await expect(stage).toHaveJSProperty('tagName', 'CANVAS');

    const before = await captureCanvasContentSignature(stage);
    expect(before).toMatch(/^\d+:\-?\d+$/);

    await runHandwrittenDrawingSequence(page, stage, 'create');

    const after = await captureCanvasContentSignature(stage);
    expect(after).not.toBe(before);
    await expect(page.getByTestId('cirs-handwritten-color-black')).toHaveAttribute(
        'aria-pressed',
        'true'
    );
});

test('update: blue vertical and red diagonal retain seeded black on Konva with floating toolbar', async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await installKonvaDualCanvasShell(page, { floatingToolbar: true });
    await openExistingNoteEditor(page);

    const editor = page.getByTestId(HANDWRITTEN_TEST_IDS.editor);
    const stage = editor.getByTestId(HANDWRITTEN_TEST_IDS.canvas);
    await expect(stage).toHaveClass(/interaction-record-stage/);
    await expect(stage.locator('.konvajs-content canvas')).toHaveCount(2);
    await expect(editor.getByTestId(HANDWRITTEN_DRAWING_CONTROLS.colorBlack)).toBeVisible();
    await expect(editor.getByTestId(HANDWRITTEN_DRAWING_CONTROLS.eraser)).toBeVisible();
    expect(await resolveHandwrittenDrawingToolbarRect(editor)).not.toBeNull();

    const { pointerSurface, inkSurfaces } = await resolveHandwrittenDrawingSurfaces(stage);
    expect(inkSurfaces.length).toBe(1);
    await expect(pointerSurface).toBeVisible();
    expect(
        await pointerSurface.evaluate((el) => {
            const konva = el.closest('.konvajs-content');
            if (!konva || !(el instanceof HTMLCanvasElement)) {
                return false;
            }
            const rect = el.getBoundingClientRect();
            const top = document.elementFromPoint(
                rect.left + rect.width * 0.25,
                rect.top + rect.height * 0.45
            );
            return top === el;
        })
    ).toBe(true);

    const before = await captureCanvasContentSignature(stage);
    expect(before).toMatch(/^0:\d+:\-?\d+\|1:\d+:\-?\d+$/);
    const sceneBefore = before.split('|')[0] ?? '';
    expect(sceneBefore).not.toMatch(/^0:0:/);

    await runHandwrittenDrawingSequence(page, stage, 'edit');

    const after = await captureCanvasContentSignature(stage);
    expect(after).not.toBe(before);
    const sceneAfter = after.split('|')[0] ?? '';
    expect(sceneAfter).not.toBe(sceneBefore);
    expect(sceneAfter).not.toMatch(/^0:0:/);

    await expect(page.getByTestId('cirs-handwritten-color-red')).toHaveAttribute(
        'aria-pressed',
        'true'
    );
});

test('direct canvas fixture still uses the canvas element for pointer and ink', async ({ page }) => {
    test.setTimeout(120000);
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await openExistingNoteEditor(page);

    const stage = page.getByTestId(HANDWRITTEN_TEST_IDS.editor).getByTestId(HANDWRITTEN_TEST_IDS.canvas);
    await expect(stage).toHaveJSProperty('tagName', 'CANVAS');

    const { pointerSurface, inkSurfaces } = await resolveHandwrittenDrawingSurfaces(stage);
    expect(inkSurfaces.length).toBe(1);
    await expect(pointerSurface).toHaveJSProperty('tagName', 'CANVAS');

    const before = await captureCanvasContentSignature(stage);
    expect(before).not.toMatch(/^0:/);
    await runHandwrittenDrawingSequence(page, stage, 'edit');
    const after = await captureCanvasContentSignature(stage);
    expect(after).not.toBe(before);
});
