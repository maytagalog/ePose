export type AnalysisReportHistorySetupStage = 'login' | 'sourceReportVerification';

export type AnalysisReportHistoryFlowStage =
    | 'ellipsisHistoryAction'
    | 'historyRouteCustomerVerification'
    | 'historyReadiness'
    | 'sourceRowVerification'
    | 'customerHistoryListTerminal';

export type AnalysisReportHistoryStage =
    | AnalysisReportHistorySetupStage
    | AnalysisReportHistoryFlowStage;

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: AnalysisReportHistoryStage[] = [
    'login',
    'sourceReportVerification',
    'ellipsisHistoryAction',
    'historyRouteCustomerVerification',
    'historyReadiness',
    'sourceRowVerification',
    'customerHistoryListTerminal',
];

export class AnalysisReportHistoryStageTracker {
    private readonly outcomes = new Map<AnalysisReportHistoryStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: AnalysisReportHistoryStage): void {
        if (this.outcomes.get(stage) === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: AnalysisReportHistoryStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: AnalysisReportHistoryStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    outcome(stage: AnalysisReportHistoryStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<AnalysisReportHistoryStage, StageOutcome> {
        const record = {} as Record<AnalysisReportHistoryStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }
}

export function markOpenStagesFailed(tracker: AnalysisReportHistoryStageTracker): void {
    for (const stage of ALL_STAGES) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}
