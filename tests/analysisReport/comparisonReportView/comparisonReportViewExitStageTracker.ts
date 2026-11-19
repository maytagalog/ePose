export type ComparisonReportViewExitStage =
    | 'compareExitClick'
    | 'comparisonViewAbsent'
    | 'singleReportRouteIdentity'
    | 'singleReportReady';

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: ComparisonReportViewExitStage[] = [
    'compareExitClick',
    'comparisonViewAbsent',
    'singleReportRouteIdentity',
    'singleReportReady',
];

export class ComparisonReportViewExitStageTracker {
    private readonly outcomes = new Map<ComparisonReportViewExitStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: ComparisonReportViewExitStage): void {
        if (this.outcomes.get(stage) === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: ComparisonReportViewExitStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: ComparisonReportViewExitStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    outcome(stage: ComparisonReportViewExitStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<ComparisonReportViewExitStage, StageOutcome> {
        const record = {} as Record<ComparisonReportViewExitStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }
}

export function failEnteredComparisonExitStages(tracker: ComparisonReportViewExitStageTracker): void {
    for (const stage of ALL_STAGES) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}