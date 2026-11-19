import type { TestInfo } from '@playwright/test';
import type { AnalysisReportPrintMenuActionEvidence } from './analysisReportPrintMenuAction';
import type { AnalysisReportPdfGenerationEvidence } from './analysisReportPdfGeneration';
import type { AnalysisReportPdfValidationResult } from './analysisReportPdfValidation';
import type {
    AnalysisReportPdfSetupStage,
    AnalysisReportPdfStage,
    PdfVerificationStage,
    StageOutcome,
} from './analysisReportPdfStageTracker';

export type AnalysisReportPdfRunEvidence = {
    runId: string;
    runOutputRoot: string;
    browserProject: string;
    browserName: string;
    browserVersion: string | null;
    customerId: string;
    analysisId: string;
    /** Combined full smoke only: where page.pdf() ran (primary vs auxiliary headless). */
    pdfExecutionContext?:
        | 'primary-headless-chromium'
        | 'primary-headed-chromium'
        | 'auxiliary-headless-chromium';
    /** Combined smoke: result of headed page.pdf() probe (null when primary is headless). */
    headedPagePdfSupported?: boolean | null;
    pdfExecutionContextNote?: string | null;
    menuAction: AnalysisReportPrintMenuActionEvidence | null;
    pdfGeneration: AnalysisReportPdfGenerationEvidence | null;
    pdfValidation: AnalysisReportPdfValidationResult | null;
    pdfGenerationSkipReason: string | null;
    coverageLabel: 'A4 PDF generation and validation';
    setup: Record<AnalysisReportPdfSetupStage, StageOutcome>;
    verification: Record<PdfVerificationStage, StageOutcome>;
    stages: Record<AnalysisReportPdfStage, StageOutcome>;
    failureStep: string | null;
};

const LOG_PREFIX = 'ANALYSIS_REPORT_PDF';

export function logAnalysisReportPdfEvent(event: string, payload: Record<string, unknown>): void {
    console.log(`${LOG_PREFIX}:${event}`, JSON.stringify(payload));
}

export function analysisReportPdfEvidenceAttachmentBody(
    evidence: AnalysisReportPdfRunEvidence
): string {
    return JSON.stringify(
        {
            runId: evidence.runId,
            runOutputRoot: evidence.runOutputRoot,
            browserProject: evidence.browserProject,
            browserName: evidence.browserName,
            browserVersion: evidence.browserVersion,
            customerId: evidence.customerId,
            analysisId: evidence.analysisId,
            pdfExecutionContext: evidence.pdfExecutionContext ?? null,
            headedPagePdfSupported: evidence.headedPagePdfSupported ?? null,
            pdfExecutionContextNote: evidence.pdfExecutionContextNote ?? null,
            coverageLabel: evidence.coverageLabel,
            pdfGenerationSkipReason: evidence.pdfGenerationSkipReason,
            setup: evidence.setup,
            stages: evidence.stages,
            menuAction: evidence.menuAction,
            pdfGeneration: evidence.pdfGeneration,
            pdfValidation: evidence.pdfValidation,
            verification: evidence.verification,
            failureStep: evidence.failureStep,
            testMoMappingNote:
                'JUnit lists top-level Playwright tests only; nested test.step() and attachments are retained in Playwright HTML/trace and JSON attachment analysis-report-pdf-evidence. Map stages to TestMo cases manually when submitting.',
        },
        null,
        2
    );
}

export async function attachAnalysisReportPdfEvidence(
    testInfo: TestInfo,
    evidence: AnalysisReportPdfRunEvidence,
    pdfPath: string | null
): Promise<void> {
    try {
        await testInfo.attach('analysis-report-pdf-evidence', {
            body: analysisReportPdfEvidenceAttachmentBody(evidence),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach analysis-report-pdf-evidence:', error);
    }
    if (pdfPath) {
        try {
            await testInfo.attach('analysis-report-a4.pdf', {
                path: pdfPath,
                contentType: 'application/pdf',
            });
        } catch (error) {
            console.warn('Failed to attach analysis-report-a4.pdf:', error);
        }
    }
}
