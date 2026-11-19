export type ComparisonReportShareQrStage =
    | 'ellipsisMenuOpen'
    | 'shareQrDialogVisible'
    | 'shareQrContentVisible'
    | 'shareQrDialogClosed'
    | 'comparisonPairPreserved';

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: ComparisonReportShareQrStage[] = [
    'ellipsisMenuOpen',
    'shareQrDialogVisible',
    'shareQrContentVisible',
    'shareQrDialogClosed',
    'comparisonPairPreserved',
];

export class ComparisonReportShareQrStageTracker {
    private readonly outcomes = new Map<ComparisonReportShareQrStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: ComparisonReportShareQrStage): void {
        if (this.outcomes.get(stage) === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: ComparisonReportShareQrStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: ComparisonReportShareQrStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    outcome(stage: ComparisonReportShareQrStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<ComparisonReportShareQrStage, StageOutcome> {
        const record = {} as Record<ComparisonReportShareQrStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }
}

export function failEnteredComparisonShareQrStages(tracker: ComparisonReportShareQrStageTracker): void {
    for (const stage of ALL_STAGES) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}