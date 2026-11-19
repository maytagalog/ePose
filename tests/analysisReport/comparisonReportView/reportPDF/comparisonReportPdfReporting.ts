import type { TestInfo } from '@playwright/test';
import type { ComparisonReportPrintMenuActionEvidence } from './comparisonReportPdfPrintMenuAction';
import type { AnalysisReportPdfGenerationEvidence } from '../../reportPDF/analysisReportPdfGeneration';
import type { ComparisonReportPdfValidationResult } from './comparisonReportPdfValidation';
import type { ComparisonReportPdfStage, StageOutcome } from './comparisonReportPdfStageTracker';

export type ComparisonReportPdfRunEvidence = {
    runId: string;
    runOutputRoot: string;
    browserProject: string;
    browserName: string;
    browserVersion: string | null;
    customerId: string;
    leftAnalysisId: string | null;
    rightAnalysisId: string | null;
    pdfExecutionContext?:
        | 'primary-headless-chromium'
        | 'primary-headed-chromium'
        | 'auxiliary-headless-chromium';
    headedPagePdfSupported?: boolean | null;
    pdfExecutionContextNote?: string | null;
    menuAction: ComparisonReportPrintMenuActionEvidence | null;
    pdfGeneration: AnalysisReportPdfGenerationEvidence | null;
    pdfValidation: ComparisonReportPdfValidationResult | null;
    pdfGenerationSkipReason: string | null;
    coverageLabel: 'A4 comparison PDF save and validation';
    stages: Record<ComparisonReportPdfStage, StageOutcome>;
    failureStep: string | null;
};

const LOG_PREFIX = 'COMPARISON_REPORT_PDF';

export function logComparisonReportPdfEvent(event: string, payload: Record<string, unknown>): void {
    console.log(`${LOG_PREFIX}:${event}`, JSON.stringify(payload));
}

export function comparisonReportPdfEvidenceBody(evidence: ComparisonReportPdfRunEvidence): string {
    return JSON.stringify(
        {
            runId: evidence.runId,
            runOutputRoot: evidence.runOutputRoot,
            browserProject: evidence.browserProject,
            browserName: evidence.browserName,
            browserVersion: evidence.browserVersion,
            customerId: evidence.customerId,
            leftAnalysisId: evidence.leftAnalysisId,
            rightAnalysisId: evidence.rightAnalysisId,
            pdfExecutionContext: evidence.pdfExecutionContext ?? null,
            headedPagePdfSupported: evidence.headedPagePdfSupported ?? null,
            pdfExecutionContextNote: evidence.pdfExecutionContextNote ?? null,
            coverageLabel: evidence.coverageLabel,
            pdfGenerationSkipReason: evidence.pdfGenerationSkipReason,
            stages: evidence.stages,
            menuAction: evidence.menuAction,
            pdfGeneration: evidence.pdfGeneration,
            pdfValidation: evidence.pdfValidation,
            failureStep: evidence.failureStep,
        },
        null,
        2
    );
}

export async function attachComparisonReportPdfEvidence(
    testInfo: TestInfo,
    evidence: ComparisonReportPdfRunEvidence,
    pdfPath: string | null
): Promise<void> {
    try {
        await testInfo.attach('comparison-report-pdf-evidence', {
            body: comparisonReportPdfEvidenceBody(evidence),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach comparison-report-pdf-evidence JSON:', error);
    }

    if (pdfPath) {
        try {
            await testInfo.attach('comparison-report-a4.pdf', {
                path: pdfPath,
                contentType: 'application/pdf',
            });
        } catch (error) {
            console.warn('Failed to attach comparison-report-a4.pdf:', error);
        }
    }
}

export function logComparisonReportPdfVerified(evidence: ComparisonReportPdfRunEvidence): void {
    logComparisonReportPdfEvent('verified', { runId: evidence.runId, customerId: evidence.customerId });
}

export function logComparisonReportPdfFailed(evidence: ComparisonReportPdfRunEvidence): void {
    logComparisonReportPdfEvent('failed', {
        runId: evidence.runId,
        failureStep: evidence.failureStep,
        stages: evidence.stages,
    });
}