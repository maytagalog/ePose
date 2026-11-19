import type { TestInfo } from '@playwright/test';
import type { DeleteRequestGuardInstallDiagnostics } from './analysisReportDeletionRequest';
import type { AnalysisReportDeletionPlan } from './analysisReportDeletionPlanLedger';
import type {
    AnalysisReportDeletionStage,
    AnalysisReportDeletionStageTracker,
    StageOutcome,
} from './analysisReportDeletionStageTracker';

export type AnalysisReportDeletionRunEvidence = {
    runId: string;
    runOutputRoot: string;
    mode: string;
    planId: string | null;
    customerId: string | null;
    analysisId: string | null;
    browserProject: string;
    browserName: string;
    browserVersion: string;
    plan: AnalysisReportDeletionPlan | null;
    stages: Record<AnalysisReportDeletionStage, StageOutcome>;
    actualDeletionReported: boolean;
    failureStep: string | null;
    deleteRequestGuardInstall: DeleteRequestGuardInstallDiagnostics | null;
    /** Combined simplified smoke: UI confirm + /customers list redirect only (not API/history absence). */
    deletionCoverage?: string | null;
};

export function analysisReportDeletionEvidenceBody(evidence: AnalysisReportDeletionRunEvidence): string {
    return JSON.stringify(
        {
            ...evidence,
            testmoNote:
                'JUnit exposes one deletion testcase. Nested steps and this JSON retain stage outcomes; map to TestMo manually.',
        },
        null,
        2
    );
}

export async function attachAnalysisReportDeletionEvidence(
    testInfo: TestInfo,
    evidence: AnalysisReportDeletionRunEvidence
): Promise<void> {
    await testInfo.attach('analysis-report-deletion-evidence.json', {
        body: analysisReportDeletionEvidenceBody(evidence),
        contentType: 'application/json',
    });
}

export function reportActualDeletionPassed(tracker: AnalysisReportDeletionStageTracker): boolean {
    return (
        tracker.outcome('deletionSubmission') === 'Passed' &&
        tracker.outcome('apiResult') === 'Passed' &&
        tracker.outcome('successUiNavigation') === 'Passed' &&
        tracker.outcome('freshHistoryAbsenceVerification') === 'Passed'
    );
}

export function reportCombinedSimplifiedCancelPassed(tracker: AnalysisReportDeletionStageTracker): boolean {
    return tracker.outcome('cancellationVerification') === 'Passed';
}

export function reportCombinedSimplifiedDeleteOncePassed(tracker: AnalysisReportDeletionStageTracker): boolean {
    return (
        tracker.outcome('cancellationVerification') === 'Passed' &&
        tracker.outcome('deletionSubmission') === 'Passed' &&
        tracker.outcome('successUiNavigation') === 'Passed'
    );
}
