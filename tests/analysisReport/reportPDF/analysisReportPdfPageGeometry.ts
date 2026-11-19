import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { A4_DIMENSION_TOLERANCE_PT, A4_HEIGHT_PT, A4_WIDTH_PT } from './analysisReportPdfValidation';

export type RawPdfPageDimension = {
    widthPt: number;
    heightPt: number;
    rotate: number;
    effectiveWidthPt: number;
    effectiveHeightPt: number;
    isA4WithinTolerance: boolean;
    orientation: 'portrait' | 'landscape';
};

function dimensionsFromView(
    view: number[],
    rotate: number,
    userUnit: number
): RawPdfPageDimension {
    const scale = userUnit > 0 ? userUnit : 1;
    const x1 = view[0] * scale;
    const y1 = view[1] * scale;
    const x2 = view[2] * scale;
    const y2 = view[3] * scale;
    const widthPt = Math.abs(x2 - x1);
    const heightPt = Math.abs(y2 - y1);
    const normalizedRotate = ((rotate % 360) + 360) % 360;
    const swap = normalizedRotate === 90 || normalizedRotate === 270;
    const effectiveWidthPt = swap ? heightPt : widthPt;
    const effectiveHeightPt = swap ? widthPt : heightPt;
    const portrait =
        Math.abs(effectiveWidthPt - A4_WIDTH_PT) <= A4_DIMENSION_TOLERANCE_PT &&
        Math.abs(effectiveHeightPt - A4_HEIGHT_PT) <= A4_DIMENSION_TOLERANCE_PT;
    const landscape =
        Math.abs(effectiveWidthPt - A4_HEIGHT_PT) <= A4_DIMENSION_TOLERANCE_PT &&
        Math.abs(effectiveHeightPt - A4_WIDTH_PT) <= A4_DIMENSION_TOLERANCE_PT;
    return {
        widthPt,
        heightPt,
        rotate: normalizedRotate,
        effectiveWidthPt,
        effectiveHeightPt,
        isA4WithinTolerance: portrait || landscape,
        orientation: effectiveWidthPt > effectiveHeightPt ? 'landscape' : 'portrait',
    };
}

/** Resolve each PDF page size via pdf.js (view box, rotation, userUnit). */
export async function resolvePdfPageDimensionsFromBuffer(buffer: Buffer): Promise<RawPdfPageDimension[]> {
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    const dimensions: RawPdfPageDimension[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const view = page.view;
        const userUnit = typeof page.userUnit === 'number' && page.userUnit > 0 ? page.userUnit : 1;
        dimensions.push(dimensionsFromView([...view], page.rotate, userUnit));
    }

    return dimensions;
}
