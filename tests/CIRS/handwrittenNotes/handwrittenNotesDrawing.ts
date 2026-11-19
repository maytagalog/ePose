import { expect, type Locator, type Page } from '@playwright/test';
import { HandwrittenNotesFlowError } from './handwrittenNotesErrors';
import {
    HANDWRITTEN_DRAWING_CONTROLS,
    HANDWRITTEN_DRAWING_TOOLBAR_ANCHORS,
    HANDWRITTEN_TEST_IDS,
} from './handwrittenNotesTestIds';

export type HandwrittenDrawPhase = 'create' | 'edit';

type Point = { x: number; y: number };

export type HandwrittenDrawableArea = {
    originX: number;
    originY: number;
    width: number;
    height: number;
};

export type HandwrittenSmokeStrokes = {
    horizontal: { start: Point; end: Point };
    vertical: { start: Point; end: Point };
    diagonal: { start: Point; end: Point };
};

/** Trace 20261103-143326: Konva stage hosts `.konvajs-content` with two stacked canvases. */
export const HANDWRITTEN_KONVA_CONTENT_CLASS = 'konvajs-content';

type ViewportRect = { left: number; top: number; right: number; bottom: number };

/** Smallest editor subtree containing both contracted toolbar anchor controls. */
export async function resolveHandwrittenDrawingToolbarRect(
    editor: Locator
): Promise<ViewportRect | null> {
    return editor.evaluate((editorEl, anchors) => {
        const black = editorEl.querySelector(`[data-testid="${anchors.colorBlack}"]`);
        const eraser = editorEl.querySelector(`[data-testid="${anchors.eraser}"]`);
        if (!(black instanceof HTMLElement) || !(eraser instanceof HTMLElement)) {
            return null;
        }
        let ancestor: HTMLElement | null = black.parentElement;
        while (ancestor && ancestor !== editorEl) {
            if (ancestor.contains(eraser)) {
                const rect = ancestor.getBoundingClientRect();
                return {
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                };
            }
            ancestor = ancestor.parentElement;
        }
        return null;
    }, HANDWRITTEN_DRAWING_TOOLBAR_ANCHORS);
}

const STROKE_STEPS = 8;
const ACTION_TIMEOUT_MS = 15000;

export type HandwrittenDrawingSurfaces = {
    pointerSurface: Locator;
    inkSurfaces: Locator[];
};

/** Proportional smoke strokes near the top-left of the measured drawable area. */
export function computeHandwrittenSmokeStrokes(
    drawable: HandwrittenDrawableArea,
    phase: HandwrittenDrawPhase
): HandwrittenSmokeStrokes {
    const rowY = drawable.originY + drawable.height * 0.1;
    const horizontalStartX = drawable.originX + drawable.width * 0.06;
    const horizontalEndX = horizontalStartX + drawable.width * 0.22;

    const verticalX = drawable.originX + drawable.width * 0.4;
    const verticalStartY = drawable.originY + drawable.height * 0.12;
    const verticalEndY = verticalStartY + drawable.height * 0.22;

    const diagonalStartX = drawable.originX + drawable.width * 0.62;
    const diagonalStartY = drawable.originY + drawable.height * 0.14;
    const diagonalEndX = diagonalStartX + drawable.width * 0.18;
    const diagonalEndY = diagonalStartY + drawable.height * 0.2;

    void phase;
    return {
        horizontal: {
            start: { x: horizontalStartX, y: rowY },
            end: { x: horizontalEndX, y: rowY },
        },
        vertical: {
            start: { x: verticalX, y: verticalStartY },
            end: { x: verticalX, y: verticalEndY },
        },
        diagonal: {
            start: { x: diagonalStartX, y: diagonalStartY },
            end: { x: diagonalEndX, y: diagonalEndY },
        },
    };
}

/**
 * Konva (trace 20261103-143326): two equal-size canvases; pointer target is the top hit-test receiver.
 * Direct `<canvas data-testid="cirs-handwritten-canvas">` keeps a single surface for pointer + readback.
 */
export async function resolveHandwrittenDrawingSurfaces(stage: Locator): Promise<HandwrittenDrawingSurfaces> {
    const isDirectCanvas = await stage.evaluate((el) => el instanceof HTMLCanvasElement);
    if (isDirectCanvas) {
        await expect(stage).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        return { pointerSurface: stage, inkSurfaces: [stage] };
    }

    const konvaRoot = stage.locator(`.${HANDWRITTEN_KONVA_CONTENT_CLASS}`);
    if ((await konvaRoot.count()) === 1) {
        const canvases = konvaRoot.locator('canvas');
        await expect(
            canvases,
            `Konva ${HANDWRITTEN_KONVA_CONTENT_CLASS} must contain exactly two canvases`
        ).toHaveCount(2, { timeout: ACTION_TIMEOUT_MS });

        const dimensions = await canvases.evaluateAll((nodes) =>
            nodes.map((node) =>
                node instanceof HTMLCanvasElement
                    ? { width: node.width, height: node.height }
                    : { width: -1, height: -1 }
            )
        );
        if (dimensions.some((d) => d.width <= 0 || d.height <= 0)) {
            throw new HandwrittenNotesFlowError(
                'Konva canvases inside cirs-handwritten-canvas must have positive pixel dimensions.'
            );
        }
        if (dimensions[0]!.width !== dimensions[1]!.width || dimensions[0]!.height !== dimensions[1]!.height) {
            throw new HandwrittenNotesFlowError(
                `Konva scene/hit canvases must share dimensions (scene=${dimensions[0]!.width}x${dimensions[0]!.height}, hit=${dimensions[1]!.width}x${dimensions[1]!.height}).`
            );
        }

        const pointerIndex = await konvaRoot.evaluate((konva) => {
            const stacked = Array.from(konva.querySelectorAll('canvas')).filter(
                (node): node is HTMLCanvasElement => node instanceof HTMLCanvasElement
            );
            if (stacked.length !== 2) {
                return -1;
            }
            const rect = stacked[0]!.getBoundingClientRect();
            const clientX = rect.left + rect.width * 0.25;
            const clientY = rect.top + rect.height * 0.45;
            const top = document.elementFromPoint(clientX, clientY);
            return stacked.indexOf(top as HTMLCanvasElement);
        });
        if (pointerIndex !== 0 && pointerIndex !== 1) {
            throw new HandwrittenNotesFlowError(
                'Konva pointer canvas could not be resolved via hit testing inside cirs-handwritten-canvas.'
            );
        }

        const pointerCanvas = canvases.nth(pointerIndex);
        const readbackCanvas = canvases.nth(pointerIndex === 0 ? 1 : 0);
        await expect(pointerCanvas, 'Konva pointer-receiving canvas').toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(readbackCanvas, 'Konva companion canvas for pixel readback').toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        return { pointerSurface: pointerCanvas, inkSurfaces: [readbackCanvas] };
    }

    const nestedCanvases = stage.locator('canvas');
    const nestedCount = await nestedCanvases.count();
    if (nestedCount === 1) {
        const only = nestedCanvases.first();
        await expect(only, 'single nested canvas inside cirs-handwritten-canvas').toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        return { pointerSurface: only, inkSurfaces: [only] };
    }

    throw new HandwrittenNotesFlowError(
        `Unsupported cirs-handwritten-canvas structure (expected direct canvas, Konva ${HANDWRITTEN_KONVA_CONTENT_CLASS} with two canvases, or one nested canvas; found ${nestedCount} nested canvas elements without Konva wrapper).`
    );
}

/** @deprecated Use {@link resolveHandwrittenDrawingSurfaces}. */
export async function resolveHandwrittenDrawingSurface(stage: Locator): Promise<Locator> {
    const { pointerSurface } = await resolveHandwrittenDrawingSurfaces(stage);
    return pointerSurface;
}

/** Drawable box in pointer-canvas coordinates, clearing measured toolbar overlap when present. */
export async function measureHandwrittenDrawableArea(
    pointerSurface: Locator,
    editor: Locator
): Promise<HandwrittenDrawableArea> {
    const toolbarRect = await resolveHandwrittenDrawingToolbarRect(editor);
    return pointerSurface.evaluate((canvas, toolbar) => {
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error('Pointer surface must be an HTMLCanvasElement.');
        }
        const rect = canvas.getBoundingClientRect();

        let topInset = 0;
        if (toolbar) {
            const overlapsCanvasHorizontally =
                toolbar.right > rect.left && toolbar.left < rect.right;
            if (overlapsCanvasHorizontally && toolbar.bottom > rect.top) {
                topInset = Math.max(0, toolbar.bottom - rect.top + 4);
            }
        }

        const margin = Math.max(4, Math.min(rect.width, rect.height) * 0.04);
        const originY = Math.max(margin, topInset + margin);
        const originX = margin;
        const width = Math.max(rect.width - margin * 2, 1);
        const height = Math.max(rect.height - originY - margin, 1);
        return { originX, originY, width, height };
    }, toolbarRect);
}

/** Read-only pixel summary for canvas layer(s) within the stage (composite on Konva). */
export async function captureCanvasContentSignature(stage: Locator): Promise<string> {
    return stage.evaluate(
        (el, konvaClass) => {
            function signatureForCanvas(canvas: HTMLCanvasElement): string {
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return 'no-2d-context';
                }
                const { width, height } = canvas;
                if (width <= 0 || height <= 0) {
                    return 'empty-size';
                }
                const data = ctx.getImageData(0, 0, width, height).data;
                let hash = 0;
                let nonTransparentPixels = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3] ?? 0;
                    if (alpha === 0) {
                        continue;
                    }
                    nonTransparentPixels += 1;
                    hash =
                        ((hash << 5) - hash +
                            (data[i] ?? 0) +
                            (data[i + 1] ?? 0) +
                            (data[i + 2] ?? 0) +
                            alpha) |
                        0;
                }
                return `${nonTransparentPixels}:${hash}`;
            }

            if (el instanceof HTMLCanvasElement) {
                return signatureForCanvas(el);
            }
            const konva = el.querySelector(`.${konvaClass}`);
            if (konva) {
                const canvases = Array.from(konva.querySelectorAll('canvas')).filter(
                    (node): node is HTMLCanvasElement => node instanceof HTMLCanvasElement
                );
                if (canvases.length !== 2) {
                    return 'unsupported-konva-canvas-count';
                }
                return canvases
                    .map((canvas, index) => `${index}:${signatureForCanvas(canvas)}`)
                    .join('|');
            }
            const nested = el.querySelector('canvas');
            if (nested instanceof HTMLCanvasElement) {
                return signatureForCanvas(nested);
            }
            return 'not-a-canvas';
        },
        HANDWRITTEN_KONVA_CONTENT_CLASS
    );
}

async function assertPointerIsTopHitTargetAlongStroke(
    pointerSurface: Locator,
    start: Point,
    end: Point,
    steps: number
): Promise<void> {
    const hitCheck = await pointerSurface.evaluate(
        (canvas, args) => {
            if (!(canvas instanceof HTMLCanvasElement)) {
                return { ok: false as const, reason: 'pointer surface is not an HTMLCanvasElement' };
            }
            const { start, end, steps: stepCount } = args;
            const rect = canvas.getBoundingClientRect();
            for (let step = 0; step <= stepCount; step += 1) {
                const t = step / stepCount;
                const localX = start.x + (end.x - start.x) * t;
                const localY = start.y + (end.y - start.y) * t;
                if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
                    return {
                        ok: false as const,
                        reason: `stroke sample (${localX.toFixed(1)},${localY.toFixed(1)}) outside pointer canvas box ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`,
                    };
                }
                const clientX = rect.left + localX;
                const clientY = rect.top + localY;
                const top = document.elementFromPoint(clientX, clientY);
                if (top !== canvas) {
                    const blocker = top;
                    const testId = blocker?.getAttribute('data-testid') ?? '';
                    const id = blocker?.id ? `#${blocker.id}` : '';
                    const className =
                        blocker && typeof blocker.className === 'string' && blocker.className.trim()
                            ? `.${blocker.className.trim().replace(/\s+/g, '.')}`
                            : '';
                    const tag = blocker?.tagName.toLowerCase() ?? 'unknown';
                    const reason = [tag, id, className, testId ? `[data-testid=${testId}]` : '']
                        .filter(Boolean)
                        .join('');
                    return {
                        ok: false as const,
                        reason: `step ${step}/${stepCount} blocked by ${reason || 'unknown element'}`,
                    };
                }
            }
            return { ok: true as const };
        },
        { start, end, steps }
    );

    if (!hitCheck.ok) {
        throw new HandwrittenNotesFlowError(
            `Handwritten pointer canvas stroke path blocked: ${hitCheck.reason}`
        );
    }
}

async function drawLineStroke(
    page: Page,
    pointerSurface: Locator,
    start: Point,
    end: Point,
    steps: number = STROKE_STEPS
): Promise<void> {
    await pointerSurface.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'center' });
    });
    await pointerSurface.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
    const box = await pointerSurface.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
        throw new HandwrittenNotesFlowError(
            'Handwritten pointer canvas is not visible or has no bounding box.'
        );
    }

    await assertPointerIsTopHitTargetAlongStroke(pointerSurface, start, end, steps);

    const pageFrom = { x: box.x + start.x, y: box.y + start.y };
    const pageTo = { x: box.x + end.x, y: box.y + end.y };

    await page.mouse.move(pageFrom.x, pageFrom.y);
    await page.mouse.down();
    try {
        for (let step = 1; step <= steps; step += 1) {
            const t = step / steps;
            const x = pageFrom.x + (pageTo.x - pageFrom.x) * t;
            const y = pageFrom.y + (pageTo.y - pageFrom.y) * t;
            await page.mouse.move(x, y);
        }
    } finally {
        await page.mouse.up();
    }
}

async function clickDrawingControl(page: Page, testId: string): Promise<void> {
    const control = page.getByTestId(testId);
    await expect(control, `drawing control ${testId}`).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await control.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(control).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Minimal smoke drawing for create/update (Part 2 and standalone handwritten specs).
 */
export async function runHandwrittenDrawingSequence(
    page: Page,
    canvasStage: Locator,
    phase: HandwrittenDrawPhase
): Promise<void> {
    const editor = page.getByTestId(HANDWRITTEN_TEST_IDS.editor);
    await editor.scrollIntoViewIfNeeded({
        timeout: ACTION_TIMEOUT_MS,
    });
    const { pointerSurface } = await resolveHandwrittenDrawingSurfaces(canvasStage);
    const drawable = await measureHandwrittenDrawableArea(pointerSurface, editor);
    const strokes = computeHandwrittenSmokeStrokes(drawable, phase);

    if (phase === 'create') {
        await clickDrawingControl(page, HANDWRITTEN_DRAWING_CONTROLS.colorBlack);
        await drawLineStroke(page, pointerSurface, strokes.horizontal.start, strokes.horizontal.end);
    } else {
        await clickDrawingControl(page, HANDWRITTEN_DRAWING_CONTROLS.colorBlue);
        await drawLineStroke(page, pointerSurface, strokes.vertical.start, strokes.vertical.end);
        await clickDrawingControl(page, HANDWRITTEN_DRAWING_CONTROLS.colorRed);
        await drawLineStroke(page, pointerSurface, strokes.diagonal.start, strokes.diagonal.end);
    }

    await expect(canvasStage).toBeVisible();
}
