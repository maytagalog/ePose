import type { TestInfo } from '@playwright/test';
import type { ComparisonReportViewStage, StageOutcome } from './comparisonReportViewStageTracker';

export type ComparisonReportViewFlowEvidencePartial = {
    customerId?: string;
    /** Single-report route id before opening comparison (distinct from comparison slot ids). */
    sourceSingleReportAnalysisId?: string | null;
    /** @deprecated Use sourceSingleReportAnalysisId — kept for log backward compatibility. */
    initialAnalysisId?: string | null;
    initialComparisonLeftId?: string | null;
    initialComparisonRightId?: string | null;
    selectedComparisonAnalysisId?: string | null;
    sectionVisibilityFirstPass?: Record<string, boolean> | null;
    sectionVisibilitySecondPass?: Record<string, boolean> | null;
    failureStep?: string | null;
};

export type ComparisonReportViewRunEvidence = ComparisonReportViewFlowEvidencePartial & {
    runId: string;
    runOutputRoot: string;
    browserProject: string;
    browserName: string;
    browserVersion: string | null;
    customerId: string;
    sourceSingleReportAnalysisId: string | null;
    initialAnalysisId: string | null;
    initialComparisonLeftId: string | null;
    initialComparisonRightId: string | null;
    selectedComparisonAnalysisId: string | null;
    sectionVisibilityFirstPass: Record<string, boolean> | null;
    sectionVisibilitySecondPass: Record<string, boolean> | null;
    stages: Record<ComparisonReportViewStage, StageOutcome>;
    failureStep: string | null;
};

export function comparisonReportViewEvidenceBody(evidence: ComparisonReportViewRunEvidence): string {
    return JSON.stringify(evidence, null, 2);
}

function comparisonReportViewRunLogPayload(evidence: ComparisonReportViewRunEvidence): Record<string, unknown> {
    return {
        customerId: evidence.customerId,
        sourceSingleReportAnalysisId: evidence.sourceSingleReportAnalysisId,
        initialComparisonLeftId: evidence.initialComparisonLeftId,
        initialComparisonRightId: evidence.initialComparisonRightId,
        selectedComparisonAnalysisId: evidence.selectedComparisonAnalysisId,
        stages: evidence.stages,
        runId: evidence.runId,
        runOutputRoot: evidence.runOutputRoot,
        failureStep: evidence.failureStep,
    };
}

export function logComparisonReportViewVerified(evidence: ComparisonReportViewRunEvidence): void {
    console.log(`COMPARISON_REPORT_VIEW_VERIFIED ${JSON.stringify(comparisonReportViewRunLogPayload(evidence))}`);
}

export function logComparisonReportViewFailed(evidence: ComparisonReportViewRunEvidence): void {
    console.log(`COMPARISON_REPORT_VIEW_FAILED ${JSON.stringify(comparisonReportViewRunLogPayload(evidence))}`);
}

export async function attachComparisonReportViewEvidence(
    testInfo: TestInfo,
    evidence: ComparisonReportViewRunEvidence
): Promise<void> {
    try {
        await testInfo.attach('comparison-report-view-evidence', {
            body: comparisonReportViewEvidenceBody(evidence),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach comparison-report-view-evidence:', error);
    }
}