export type AnalysisReportDeletionSetupStage = 'configuration' | 'login' | 'historyNavigation';

export type AnalysisReportDeletionFlowStage =
    | 'historyRouteReadiness'
    | 'historyCompleteness'
    | 'oldestTargetSelection'
    | 'pinnedPlanValidation'
    | 'reportIdentity'
    | 'deleteConfirmationDialog'
    | 'cancellationVerification'
    | 'persistentReservation'
    | 'deletionSubmission'
    | 'apiResult'
    | 'successUiNavigation'
    | 'freshHistoryAbsenceVerification';

export type AnalysisReportDeletionStage =
    | AnalysisReportDeletionSetupStage
    | AnalysisReportDeletionFlowStage;

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: AnalysisReportDeletionStage[] = [
    'configuration',
    'login',
    'historyNavigation',
    'historyRouteReadiness',
    'historyCompleteness',
    'oldestTargetSelection',
    'pinnedPlanValidation',
    'reportIdentity',
    'deleteConfirmationDialog',
    'cancellationVerification',
    'persistentReservation',
    'deletionSubmission',
    'apiResult',
    'successUiNavigation',
    'freshHistoryAbsenceVerification',
];

export class AnalysisReportDeletionStageTracker {
    private readonly outcomes = new Map<AnalysisReportDeletionStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: AnalysisReportDeletionStage): void {
        if (this.outcomes.get(stage) === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: AnalysisReportDeletionStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: AnalysisReportDeletionStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    skip(stage: AnalysisReportDeletionStage): void {
        this.outcomes.set(stage, 'Skipped');
    }

    outcome(stage: AnalysisReportDeletionStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<AnalysisReportDeletionStage, StageOutcome> {
        const record = {} as Record<AnalysisReportDeletionStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }
}

export function markOpenDeletionStagesFailed(tracker: AnalysisReportDeletionStageTracker): void {
    for (const stage of ALL_STAGES) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}
