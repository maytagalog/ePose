import { readFile } from 'node:fs/promises';
import pdfParse from 'pdf-parse';
import type { ReportPdfContentExpectation } from './analysisReportPdfContentExpectations';
import { resolvePdfPageDimensionsFromBuffer } from './analysisReportPdfPageGeometry';

/** ISO A4 in PDF points (1/72 inch). Playwright/Chromium target these for format A4. */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
export const A4_DIMENSION_TOLERANCE_PT = 2.5;

export type PdfPageDimension = {
    pageNumber: number;
    widthPt: number;
    heightPt: number;
    rotate: number;
    effectiveWidthPt: number;
    effectiveHeightPt: number;
    isA4WithinTolerance: boolean;
    orientation: 'portrait' | 'landscape';
};

export type AnalysisReportPdfValidationResult = {
    filePath: string;
    fileSizeBytes: number;
    parseSucceeded: boolean;
    pageCount: number;
    pageDimensions: PdfPageDimension[];
    a4ValidationPassed: boolean;
    nonA4PageNumbers: number[];
    extractedTextLength: number;
    contentChecks: {
        customerNameFound: boolean;
        measuredAtDisplayFound: boolean;
        scoreTokenFound: boolean;
        sectionMarkersFound: string[];
        sectionMarkersMissing: string[];
    };
    contentVerificationPassed: boolean;
    structuralVerificationPassed: boolean;
};

export function normalizePdfExtractedText(text: string): string {
    return text
        .normalize('NFKC')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, '')
        .trim();
}

function assertPdfSignature(buffer: Buffer): void {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error('Output file is not a PDF (%PDF- header missing).');
    }
}

function buildContentChecks(
    normalized: string,
    expectation: ReportPdfContentExpectation
): AnalysisReportPdfValidationResult['contentChecks'] {
    const nameNorm = normalizePdfExtractedText(expectation.customerDisplayName);
    const measuredNorm = normalizePdfExtractedText(expectation.measuredAtDisplayToken);
    const scoreNorm = normalizePdfExtractedText(expectation.scoreToken);
    const customerNameFound = normalized.includes(nameNorm);
    const measuredAtDisplayFound = normalized.includes(measuredNorm);
    const scoreTokenFound = normalized.includes(scoreNorm);
    const sectionMarkersFound = expectation.sectionMarkers.filter((m) =>
        normalized.includes(normalizePdfExtractedText(m))
    );
    const sectionMarkersMissing = expectation.sectionMarkers.filter(
        (m) => !normalized.includes(normalizePdfExtractedText(m))
    );
    return {
        customerNameFound,
        measuredAtDisplayFound,
        scoreTokenFound,
        sectionMarkersFound,
        sectionMarkersMissing,
    };
}

/**
 * Parse and evaluate PDF bytes; returns partial measurements when A4/content checks fail.
 * Throws only for empty/corrupt/unopenable PDF or page-count mismatch.
 */
export async function analyzeAnalysisReportPdfFile(
    filePath: string,
    expectation: ReportPdfContentExpectation
): Promise<AnalysisReportPdfValidationResult> {
    const buffer = await readFile(filePath);
    if (buffer.length === 0) {
        throw new Error('PDF output file is empty.');
    }
    assertPdfSignature(buffer);

    let extractedText = '';
    let parseSucceeded = false;
    let pdfParsePageCount: number | null = null;
    try {
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text ?? '';
        pdfParsePageCount = parsed.numpages;
        parseSucceeded = true;
    } catch {
        parseSucceeded = false;
    }

    const rawDimensions = await resolvePdfPageDimensionsFromBuffer(buffer);
    const pageCount = rawDimensions.length;
    if (pageCount < 1) {
        throw new Error('PDF page geometry reported zero pages.');
    }

    if (pdfParsePageCount !== null && pdfParsePageCount !== pageCount) {
        throw new Error(
            `PDF page geometry count (${pageCount}) != pdf-parse page count (${pdfParsePageCount}).`
        );
    }

    const pageDimensions: PdfPageDimension[] = rawDimensions.map((dim, index) => ({
        ...dim,
        pageNumber: index + 1,
    }));

    const nonA4PageNumbers = pageDimensions
        .filter((p) => !p.isA4WithinTolerance)
        .map((p) => p.pageNumber);
    const a4ValidationPassed = nonA4PageNumbers.length === 0;

    const normalized = normalizePdfExtractedText(extractedText);
    const contentChecks =
        normalized.length > 0
            ? buildContentChecks(normalized, expectation)
            : {
                  customerNameFound: false,
                  measuredAtDisplayFound: false,
                  scoreTokenFound: false,
                  sectionMarkersFound: [] as string[],
                  sectionMarkersMissing: [...expectation.sectionMarkers],
              };

    const contentVerificationPassed =
        normalized.length > 0 &&
        contentChecks.customerNameFound &&
        contentChecks.measuredAtDisplayFound &&
        contentChecks.scoreTokenFound &&
        contentChecks.sectionMarkersMissing.length === 0;

    const structuralVerificationPassed = a4ValidationPassed;

    return {
        filePath,
        fileSizeBytes: buffer.length,
        parseSucceeded,
        pageCount,
        pageDimensions,
        a4ValidationPassed,
        nonA4PageNumbers,
        extractedTextLength: extractedText.length,
        contentChecks,
        contentVerificationPassed,
        structuralVerificationPassed,
    };
}

export async function validateAnalysisReportPdfFile(
    filePath: string,
    expectation: ReportPdfContentExpectation
): Promise<AnalysisReportPdfValidationResult> {
    const result = await analyzeAnalysisReportPdfFile(filePath, expectation);
    if (!result.a4ValidationPassed) {
        const sample = result.pageDimensions.find((p) => !p.isA4WithinTolerance);
        throw new Error(
            `PDF page is not A4 within tolerance (pages=${result.nonA4PageNumbers.join(',')}, sample=${sample?.effectiveWidthPt}x${sample?.effectiveHeightPt} pt, rotate=${sample?.rotate}).`
        );
    }
    if (result.extractedTextLength === 0) {
        throw new Error(
            'PDF text extraction yielded no text; cannot verify report content (limitation: image-only or untextual PDF).'
        );
    }
    if (!result.contentVerificationPassed) {
        const c = result.contentChecks;
        throw new Error(
            `PDF content verification failed (customer=${c.customerNameFound}, measuredAt=${c.measuredAtDisplayFound}, score=${c.scoreTokenFound}, missingMarkers=${c.sectionMarkersMissing.join(',')}).`
        );
    }
    return result;
}
