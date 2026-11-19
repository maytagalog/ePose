export type ComparisonReportShareEmailStage =
    | 'ellipsisMenuOpen'
    | 'shareEmailDialogVisible'
    | 'recipientDisplayed'
    | 'sendShareEmail'
    | 'sendSuccessConfirmation'
    | 'gmailMessageReceived'
    | 'guestComparisonReady'
    | 'guestSectionVisibility'
    | 'comparisonPairPreserved';

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: ComparisonReportShareEmailStage[] = [
    'ellipsisMenuOpen',
    'shareEmailDialogVisible',
    'recipientDisplayed',
    'sendShareEmail',
    'sendSuccessConfirmation',
    'gmailMessageReceived',
    'guestComparisonReady',
    'guestSectionVisibility',
    'comparisonPairPreserved',
];

export class ComparisonReportShareEmailStageTracker {
    private readonly outcomes = new Map<ComparisonReportShareEmailStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: ComparisonReportShareEmailStage): void {
        if (this.outcomes.get(stage) === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: ComparisonReportShareEmailStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: ComparisonReportShareEmailStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    skip(stage: ComparisonReportShareEmailStage): void {
        this.outcomes.set(stage, 'Skipped');
    }

    outcome(stage: ComparisonReportShareEmailStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<ComparisonReportShareEmailStage, StageOutcome> {
        const record = {} as Record<ComparisonReportShareEmailStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }
}

export function failEnteredComparisonShareEmailStages(
    tracker: ComparisonReportShareEmailStageTracker
): void {
    for (const stage of ALL_STAGES) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}

/** Part 2 UI-only share email: inbox and guest stages are out of scope. */
export function markComparisonShareEmailExtendedStagesExcluded(
    tracker: ComparisonReportShareEmailStageTracker
): void {
    for (const stage of [
        'gmailMessageReceived',
        'guestComparisonReady',
        'guestSectionVisibility',
    ] as const) {
        tracker.skip(stage);
    }
}