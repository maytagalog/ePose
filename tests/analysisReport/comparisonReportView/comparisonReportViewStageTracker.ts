export type ComparisonReportViewSetupStage = 'login' | 'customerNavigation' | 'singleReportEntry';

export type ComparisonReportViewFlowStage =
    | 'comparisonOpen'
    | 'initialScrollSections'
    | 'reportSelectionSwitch'
    | 'postSwitchScrollSections'
    | 'terminalComparisonView';

export type ComparisonReportViewStage = ComparisonReportViewSetupStage | ComparisonReportViewFlowStage;

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: ComparisonReportViewStage[] = [
    'login',
    'customerNavigation',
    'singleReportEntry',
    'comparisonOpen',
    'initialScrollSections',
    'reportSelectionSwitch',
    'postSwitchScrollSections',
    'terminalComparisonView',
];

export class ComparisonReportViewStageTracker {
    private readonly outcomes = new Map<ComparisonReportViewStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: ComparisonReportViewStage): void {
        if (this.outcomes.get(stage) === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: ComparisonReportViewStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: ComparisonReportViewStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    outcome(stage: ComparisonReportViewStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<ComparisonReportViewStage, StageOutcome> {
        const record = {} as Record<ComparisonReportViewStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }
}

export function failEnteredComparisonFlowStages(tracker: ComparisonReportViewStageTracker): void {
    const flowStages: ComparisonReportViewFlowStage[] = [
        'comparisonOpen',
        'initialScrollSections',
        'reportSelectionSwitch',
        'postSwitchScrollSections',
        'terminalComparisonView',
    ];
    for (const stage of flowStages) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}

export function markOpenComparisonStagesFailed(
    tracker: ComparisonReportViewStageTracker,
    fromStage: ComparisonReportViewFlowStage
): void {
    const flowStages: ComparisonReportViewFlowStage[] = [
        'comparisonOpen',
        'initialScrollSections',
        'reportSelectionSwitch',
        'postSwitchScrollSections',
        'terminalComparisonView',
    ];
    const start = flowStages.indexOf(fromStage);
    if (start < 0) {
        return;
    }
    for (const stage of flowStages.slice(start)) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}