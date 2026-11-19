import { readFile } from 'node:fs/promises';
import pdfParse from 'pdf-parse';
import { normalizePdfExtractedText } from '../../reportPDF/analysisReportPdfValidation';
import type { PdfPageDimension } from '../../reportPDF/analysisReportPdfValidation';
import { resolvePdfPageDimensionsFromBuffer } from '../../reportPDF/analysisReportPdfPageGeometry';
import type { ComparisonReportPdfContentExpectation } from './comparisonReportPdfContentExpectations';

function assertPdfSignature(buffer: Buffer): void {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error('Output file is not a PDF (%PDF- header missing).');
    }
}

export type ComparisonReportPdfValidationResult = {
    filePath: string;
    fileSizeBytes: number;
    parseSucceeded: boolean;
    pageCount: number;
    pageDimensions: PdfPageDimension[];
    a4ValidationPassed: boolean;
    nonA4PageNumbers: number[];
    extractedTextLength: number;
    pairSourceVerification: ComparisonReportPdfContentExpectation['pairSourceVerification'];
    contentChecks: {
        customerNameFound: boolean;
        comparisonTitleFound: boolean;
        leftMeasuredAtDisplayFound: boolean | null;
        rightMeasuredAtDisplayFound: boolean | null;
    };
    contentVerificationPassed: boolean;
    structuralVerificationPassed: boolean;
};

function buildComparisonContentChecks(
    normalized: string,
    expectation: ComparisonReportPdfContentExpectation
): ComparisonReportPdfValidationResult['contentChecks'] {
    const customerNameFound = normalized.includes(
        normalizePdfExtractedText(expectation.customerDisplayName)
    );
    const comparisonTitleFound = normalized.includes(
        normalizePdfExtractedText(expectation.comparisonTitle)
    );
    const leftMeasuredAtDisplayFound =
        expectation.leftMeasuredAtDisplayToken === null
            ? null
            : normalized.includes(normalizePdfExtractedText(expectation.leftMeasuredAtDisplayToken));
    const rightMeasuredAtDisplayFound =
        expectation.rightMeasuredAtDisplayToken === null
            ? null
            : normalized.includes(normalizePdfExtractedText(expectation.rightMeasuredAtDisplayToken));
    return {
        customerNameFound,
        comparisonTitleFound,
        leftMeasuredAtDisplayFound,
        rightMeasuredAtDisplayFound,
    };
}

export async function analyzeComparisonReportPdfFile(
    filePath: string,
    expectation: ComparisonReportPdfContentExpectation
): Promise<ComparisonReportPdfValidationResult> {
    const buffer = await readFile(filePath);
    if (buffer.length === 0) {
        throw new Error('PDF output file is empty.');
    }
    assertPdfSignature(buffer);

    let extractedText = '';
    let parseSucceeded = false;
    try {
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text ?? '';
        parseSucceeded = true;
    } catch {
        parseSucceeded = false;
    }

    const rawDimensions = await resolvePdfPageDimensionsFromBuffer(buffer);
    const pageCount = rawDimensions.length;
    if (pageCount < 1) {
        throw new Error('PDF page geometry reported zero pages.');
    }

    const pageDimensions: PdfPageDimension[] = rawDimensions.map((dim, index) => ({
        ...dim,
        pageNumber: index + 1,
    }));
    const nonA4PageNumbers = pageDimensions.filter((p) => !p.isA4WithinTolerance).map((p) => p.pageNumber);
    const a4ValidationPassed = nonA4PageNumbers.length === 0;

    const normalized = normalizePdfExtractedText(extractedText);
    const contentChecks =
        normalized.length > 0
            ? buildComparisonContentChecks(normalized, expectation)
            : {
                  customerNameFound: false,
                  comparisonTitleFound: false,
                  leftMeasuredAtDisplayFound: expectation.leftMeasuredAtDisplayToken ? false : null,
                  rightMeasuredAtDisplayFound: expectation.rightMeasuredAtDisplayToken ? false : null,
              };

    const datesOk =
        (contentChecks.leftMeasuredAtDisplayFound === null || contentChecks.leftMeasuredAtDisplayFound === true) &&
        (contentChecks.rightMeasuredAtDisplayFound === null || contentChecks.rightMeasuredAtDisplayFound === true);

    const contentVerificationPassed =
        normalized.length > 0 &&
        contentChecks.customerNameFound &&
        contentChecks.comparisonTitleFound &&
        datesOk;

    return {
        filePath,
        fileSizeBytes: buffer.length,
        parseSucceeded,
        pageCount,
        pageDimensions,
        a4ValidationPassed,
        nonA4PageNumbers,
        extractedTextLength: extractedText.length,
        pairSourceVerification: { ...expectation.pairSourceVerification },
        contentChecks,
        contentVerificationPassed,
        structuralVerificationPassed: a4ValidationPassed,
    };
}

export async function validateComparisonReportPdfFile(
    filePath: string,
    expectation: ComparisonReportPdfContentExpectation
): Promise<ComparisonReportPdfValidationResult> {
    const result = await analyzeComparisonReportPdfFile(filePath, expectation);
    if (!result.a4ValidationPassed) {
        const sample = result.pageDimensions.find((p) => !p.isA4WithinTolerance);
        throw new Error(
            `PDF page is not A4 within tolerance (pages=${result.nonA4PageNumbers.join(',')}, sample=${sample?.effectiveWidthPt}x${sample?.effectiveHeightPt} pt).`
        );
    }
    if (result.extractedTextLength === 0) {
        throw new Error('PDF text extraction yielded no text; cannot verify comparison content.');
    }
    if (!result.contentVerificationPassed) {
        const c = result.contentChecks;
        throw new Error(
            `Comparison PDF content verification failed (customer=${c.customerNameFound}, title=${c.comparisonTitleFound}, leftDate=${c.leftMeasuredAtDisplayFound}, rightDate=${c.rightMeasuredAtDisplayFound}).`
        );
    }
    return result;
}