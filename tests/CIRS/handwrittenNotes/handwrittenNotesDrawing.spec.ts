import { test, expect } from '@playwright/test';
import {
    computeHandwrittenSmokeStrokes,
    type HandwrittenDrawableArea,
} from './handwrittenNotesDrawing';

test('smoke strokes stay inside drawable area and separate create vs update paths', () => {
    const drawable: HandwrittenDrawableArea = {
        originX: 20,
        originY: 48,
        width: 600,
        height: 400,
    };
    const strokes = computeHandwrittenSmokeStrokes(drawable, 'edit');

    expect(strokes.horizontal.start.y).toBe(strokes.horizontal.end.y);
    expect(strokes.horizontal.end.x).toBeGreaterThan(strokes.horizontal.start.x);
    expect(strokes.vertical.start.x).toBe(strokes.vertical.end.x);
    expect(strokes.vertical.end.y).toBeGreaterThan(strokes.vertical.start.y);
    expect(strokes.diagonal.end.x).toBeGreaterThan(strokes.diagonal.start.x);
    expect(strokes.diagonal.end.y).toBeGreaterThan(strokes.diagonal.start.y);

    expect(strokes.horizontal.end.x).toBeLessThan(strokes.vertical.start.x);
    expect(strokes.vertical.start.x).toBeLessThan(strokes.diagonal.start.x);

    for (const point of [
        strokes.horizontal.start,
        strokes.horizontal.end,
        strokes.vertical.start,
        strokes.vertical.end,
        strokes.diagonal.start,
        strokes.diagonal.end,
    ]) {
        expect(point.x).toBeGreaterThanOrEqual(drawable.originX);
        expect(point.y).toBeGreaterThanOrEqual(drawable.originY);
        expect(point.x).toBeLessThanOrEqual(drawable.originX + drawable.width);
        expect(point.y).toBeLessThanOrEqual(drawable.originY + drawable.height);
    }
});
