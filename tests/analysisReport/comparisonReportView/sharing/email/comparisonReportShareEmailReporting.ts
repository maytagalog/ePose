import type { TestInfo } from '@playwright/test';
import { redactSharedReportUrlForDiagnostics } from '../../../../../utils/gmail';
import type { ComparisonReportViewRunEvidence } from '../../comparisonReportViewReporting';
import type { ComparisonReportShareEmailStage, StageOutcome } from './comparisonReportShareEmailStageTracker';
import type { ComparisonReportShareEmailFlowEvidencePartial } from './comparisonReportShareEmailEvidenceTypes';

export type { ComparisonReportShareEmailFlowEvidencePartial };

export type ComparisonReportShareEmailRunEvidence = ComparisonReportViewRunEvidence &
    ComparisonReportShareEmailFlowEvidencePartial & {
        preEmailLeftAnalysisId: string | null;
        preEmailRightAnalysisId: string | null;
        postEmailLeftAnalysisId: string | null;
        postEmailRightAnalysisId: string | null;
        modalRecipientVerified: boolean;
        sendAttemptedOnce: boolean;
        sendSuccessToastVerified: boolean;
        gmailMessageId: string | null;
        sharedComparisonUrlRedacted: string | null;
        guestComparisonVerified: boolean;
        guestSectionVisibility: Record<string, boolean> | null;
        comparisonPairPreserved: boolean;
        shareEmailStages: Record<ComparisonReportShareEmailStage, StageOutcome>;
    };

export function comparisonReportShareEmailEvidenceBody(
    evidence: ComparisonReportShareEmailRunEvidence
): string {
    return JSON.stringify(evidence, null, 2);
}

function comparisonReportShareEmailLogPayload(
    evidence: ComparisonReportShareEmailRunEvidence
): Record<string, unknown> {
    return {
        customerId: evidence.customerId,
        preEmailLeftAnalysisId: evidence.preEmailLeftAnalysisId,
        preEmailRightAnalysisId: evidence.preEmailRightAnalysisId,
        postEmailLeftAnalysisId: evidence.postEmailLeftAnalysisId,
        postEmailRightAnalysisId: evidence.postEmailRightAnalysisId,
        selectedComparisonAnalysisId: evidence.selectedComparisonAnalysisId,
        modalRecipientVerified: evidence.modalRecipientVerified,
        sendAttemptedOnce: evidence.sendAttemptedOnce,
        sendSuccessToastVerified: evidence.sendSuccessToastVerified,
        gmailMessageId: evidence.gmailMessageId,
        sharedComparisonUrlRedacted: evidence.sharedComparisonUrlRedacted,
        guestComparisonVerified: evidence.guestComparisonVerified,
        guestSectionVisibility: evidence.guestSectionVisibility,
        comparisonPairPreserved: evidence.comparisonPairPreserved,
        shareEmailStages: evidence.shareEmailStages,
        stages: evidence.stages,
        runId: evidence.runId,
        runOutputRoot: evidence.runOutputRoot,
        failureStep: evidence.failureStep,
    };
}

export function logComparisonReportShareEmailVerified(
    evidence: ComparisonReportShareEmailRunEvidence
): void {
    console.log(
        `COMPARISON_REPORT_SHARE_EMAIL_VERIFIED ${JSON.stringify(comparisonReportShareEmailLogPayload(evidence))}`
    );
}

export function logComparisonReportShareEmailFailed(
    evidence: ComparisonReportShareEmailRunEvidence
): void {
    console.log(
        `COMPARISON_REPORT_SHARE_EMAIL_FAILED ${JSON.stringify(comparisonReportShareEmailLogPayload(evidence))}`
    );
}

export async function attachComparisonReportShareEmailEvidence(
    testInfo: TestInfo,
    evidence: ComparisonReportShareEmailRunEvidence
): Promise<void> {
    try {
        await testInfo.attach('comparison-report-share-email-evidence', {
            body: comparisonReportShareEmailEvidenceBody(evidence),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach comparison-report-share-email evidence:', error);
    }
}

export function redactComparisonShareUrlForEvidence(url: string | null): string | null {
    return redactSharedReportUrlForDiagnostics(url);
}