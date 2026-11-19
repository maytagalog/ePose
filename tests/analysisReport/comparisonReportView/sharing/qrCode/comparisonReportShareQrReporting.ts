import type { TestInfo } from '@playwright/test';
import type { ComparisonReportViewRunEvidence } from '../../comparisonReportViewReporting';
import type { ComparisonReportShareQrStage, StageOutcome } from './comparisonReportShareQrStageTracker';

export type ComparisonReportShareQrFlowEvidencePartial = {
    preQrLeftAnalysisId?: string | null;
    preQrRightAnalysisId?: string | null;
    postQrLeftAnalysisId?: string | null;
    postQrRightAnalysisId?: string | null;
    qrMenuOpened?: boolean;
    qrDialogVisible?: boolean;
    qrContentVisible?: boolean;
    qrDialogClosed?: boolean;
    comparisonPairPreserved?: boolean;
    shareQrStages?: Record<ComparisonReportShareQrStage, StageOutcome>;
    failureStep?: string | null;
};

export type ComparisonReportShareQrRunEvidence = ComparisonReportViewRunEvidence &
    ComparisonReportShareQrFlowEvidencePartial & {
        preQrLeftAnalysisId: string | null;
        preQrRightAnalysisId: string | null;
        postQrLeftAnalysisId: string | null;
        postQrRightAnalysisId: string | null;
        qrMenuOpened: boolean;
        qrDialogVisible: boolean;
        qrContentVisible: boolean;
        qrDialogClosed: boolean;
        comparisonPairPreserved: boolean;
        shareQrStages: Record<ComparisonReportShareQrStage, StageOutcome>;
    };

export function comparisonReportShareQrEvidenceBody(evidence: ComparisonReportShareQrRunEvidence): string {
    return JSON.stringify(evidence, null, 2);
}

function comparisonReportShareQrLogPayload(
    evidence: ComparisonReportShareQrRunEvidence
): Record<string, unknown> {
    return {
        customerId: evidence.customerId,
        preQrLeftAnalysisId: evidence.preQrLeftAnalysisId,
        preQrRightAnalysisId: evidence.preQrRightAnalysisId,
        postQrLeftAnalysisId: evidence.postQrLeftAnalysisId,
        postQrRightAnalysisId: evidence.postQrRightAnalysisId,
        selectedComparisonAnalysisId: evidence.selectedComparisonAnalysisId,
        qrMenuOpened: evidence.qrMenuOpened,
        qrDialogVisible: evidence.qrDialogVisible,
        qrContentVisible: evidence.qrContentVisible,
        qrDialogClosed: evidence.qrDialogClosed,
        comparisonPairPreserved: evidence.comparisonPairPreserved,
        shareQrStages: evidence.shareQrStages,
        stages: evidence.stages,
        runId: evidence.runId,
        runOutputRoot: evidence.runOutputRoot,
        failureStep: evidence.failureStep,
    };
}

export function logComparisonReportShareQrVerified(evidence: ComparisonReportShareQrRunEvidence): void {
    console.log(
        `COMPARISON_REPORT_SHARE_QR_VERIFIED ${JSON.stringify(comparisonReportShareQrLogPayload(evidence))}`
    );
}

export function logComparisonReportShareQrFailed(evidence: ComparisonReportShareQrRunEvidence): void {
    console.log(
        `COMPARISON_REPORT_SHARE_QR_FAILED ${JSON.stringify(comparisonReportShareQrLogPayload(evidence))}`
    );
}

export async function attachComparisonReportShareQrEvidence(
    testInfo: TestInfo,
    evidence: ComparisonReportShareQrRunEvidence
): Promise<void> {
    try {
        await testInfo.attach('comparison-report-share-qr-evidence', {
            body: comparisonReportShareQrEvidenceBody(evidence),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach comparison-report-share-qr-evidence:', error);
    }
}