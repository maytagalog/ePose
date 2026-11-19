import { expect, type Page } from '@playwright/test';
import {
    assertComparisonReportViewReady,
    readComparisonSlotAnalysisIds,
    type ComparisonSlotAnalysisIds,
} from '../comparisonReportViewLocators';
import { executeComparisonReportPrintMenuAction } from './comparisonReportPdfPrintMenuAction';
import {
    assertExpectedComparisonPair,
    collectComparisonReportPdfContentExpectations,
    type ComparisonReportPdfContentExpectation,
} from './comparisonReportPdfContentExpectations';
import { generateAnalysisReportA4Pdf } from '../../reportPDF/analysisReportPdfGeneration';
import { assertComparisonReportPdfReadiness } from './comparisonReportPdfReadiness';
import type { ComparisonReportPdfRunEvidence } from './comparisonReportPdfReporting';
import { ComparisonReportPdfStageTracker, failEnteredComparisonPdfStages } from './comparisonReportPdfStageTracker';
import {
    analyzeComparisonReportPdfFile,
    validateComparisonReportPdfFile,
} from './comparisonReportPdfValidation';

const COMBINED_PDF_VIEWPORT = { width: 1404, height: 856 } as const;

export type RunComparisonReportPdfOnPageInput = {
    customerId: string;
    customerDisplayNameHint: string | null;
    pdfPath: string;
    expectedPair?: ComparisonSlotAnalysisIds;
};

export async function runComparisonReportPdfFlowOnPage(
    page: Page,
    input: RunComparisonReportPdfOnPageInput,
    tracker: ComparisonReportPdfStageTracker,
    evidence: ComparisonReportPdfRunEvidence
): Promise<ComparisonReportPdfContentExpectation> {
    tracker.enter('contentExpectations');
    const contentExpectation = await collectComparisonReportPdfContentExpectations(
        page,
        input.customerId,
        input.customerDisplayNameHint
    );
    evidence.leftAnalysisId = contentExpectation.pairSourceVerification.leftAnalysisId;
    evidence.rightAnalysisId = contentExpectation.pairSourceVerification.rightAnalysisId;
    if (input.expectedPair) {
        assertExpectedComparisonPair(contentExpectation.pairSourceVerification, input.expectedPair);
    }
    tracker.pass('contentExpectations');

    const pairBefore = contentExpectation.pairSourceVerification;

    tracker.enter('applicationPrintMenuAction');
    const menuResult = await executeComparisonReportPrintMenuAction(page, input.customerId, pairBefore);
    evidence.menuAction = menuResult.evidence;
    if (menuResult.error) {
        tracker.fail('applicationPrintMenuAction');
        throw menuResult.error;
    }
    tracker.pass('applicationPrintMenuAction');

    tracker.enter('a4PdfSave');
    evidence.pdfGeneration = await generateAnalysisReportA4Pdf(page, {
        outputPath: input.pdfPath,
        prepareReadiness: (pdfPage) => assertComparisonReportPdfReadiness(pdfPage, input.customerId),
    });
    tracker.pass('a4PdfSave');

    tracker.enter('savedPdfFileValidation');
    try {
        evidence.pdfValidation = await validateComparisonReportPdfFile(input.pdfPath, contentExpectation);
        tracker.pass('savedPdfFileValidation');
        tracker.enter('pdfContentVerification');
        tracker.pass('pdfContentVerification');
    } catch (validationError) {
        try {
            evidence.pdfValidation = await analyzeComparisonReportPdfFile(input.pdfPath, contentExpectation);
        } catch {
            // keep primary validation error
        }
        if (evidence.pdfValidation?.a4ValidationPassed) {
            tracker.pass('savedPdfFileValidation');
            tracker.enter('pdfContentVerification');
            tracker.fail('pdfContentVerification');
        } else {
            tracker.fail('savedPdfFileValidation');
        }
        throw validationError;
    }

    tracker.enter('comparisonPairPreserved');
    await assertComparisonReportViewReady(page, input.customerId);
    const pairAfter = await readComparisonSlotAnalysisIds(page);
    assertExpectedComparisonPair(pairAfter, pairBefore);
    tracker.pass('comparisonPairPreserved');

    expect(evidence.pdfValidation?.pageCount).toBeGreaterThanOrEqual(1);
    expect(evidence.pdfValidation?.contentVerificationPassed).toBe(true);

    return contentExpectation;
}

export async function runComparisonReportPdfFromComparisonPage(
    page: Page,
    input: RunComparisonReportPdfOnPageInput,
    tracker: ComparisonReportPdfStageTracker,
    evidence: ComparisonReportPdfRunEvidence
): Promise<void> {
    try {
        await runComparisonReportPdfFlowOnPage(page, input, tracker, evidence);
    } catch (error) {
        failEnteredComparisonPdfStages(tracker);
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 300) : 'comparison_pdf_flow_failed';
        throw error;
    }
}

export const COMPARISON_PDF_AUTOMATION_VIEWPORT = COMBINED_PDF_VIEWPORT;