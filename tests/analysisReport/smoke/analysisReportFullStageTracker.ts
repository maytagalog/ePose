export type AnalysisReportFullFeature =
    | 'login'
    | 'preflight'
    | 'reportView'
    | 'displaySettings'
    | 'shareQr'
    | 'shareEmail'
    | 'reportPdf'
    | 'reportHistory'
    | 'reportDeletion';

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ORDER: AnalysisReportFullFeature[] = [
    'login',
    'preflight',
    'reportView',
    'displaySettings',
    'shareQr',
    'shareEmail',
    'reportPdf',
    'reportHistory',
    'reportDeletion',
];

export class AnalysisReportFullStageTracker {
    private readonly outcomes = new Map<AnalysisReportFullFeature, StageOutcome>();

    constructor() {
        for (const feature of ORDER) {
            this.outcomes.set(feature, 'Not reached');
        }
    }

    enter(feature: AnalysisReportFullFeature): void {
        if (this.outcomes.get(feature) === 'Not reached') {
            this.outcomes.set(feature, 'Entered');
        }
    }

    pass(feature: AnalysisReportFullFeature): void {
        this.outcomes.set(feature, 'Passed');
    }

    fail(feature: AnalysisReportFullFeature): void {
        this.outcomes.set(feature, 'Failed');
    }

    skip(feature: AnalysisReportFullFeature, reason?: string): void {
        void reason;
        this.outcomes.set(feature, 'Skipped');
    }

    outcome(feature: AnalysisReportFullFeature): StageOutcome {
        return this.outcomes.get(feature) ?? 'Not reached';
    }

    skipRemainingFrom(feature: AnalysisReportFullFeature): void {
        const start = ORDER.indexOf(feature);
        if (start < 0) {
            return;
        }
        for (let index = start; index < ORDER.length; index += 1) {
            const stage = ORDER[index]!;
            if (this.outcomes.get(stage) === 'Not reached' || this.outcomes.get(stage) === 'Entered') {
                this.outcomes.set(stage, stage === feature && this.outcomes.get(stage) === 'Entered' ? 'Failed' : 'Not reached');
            }
        }
        for (let index = start + 1; index < ORDER.length; index += 1) {
            const stage = ORDER[index]!;
            if (this.outcomes.get(stage) === 'Not reached') {
                this.outcomes.set(stage, 'Not reached');
            }
        }
    }

    markOpenFailed(): void {
        for (const feature of ORDER) {
            if (this.outcomes.get(feature) === 'Entered') {
                this.outcomes.set(feature, 'Failed');
            }
        }
    }

    toRecord(): Record<AnalysisReportFullFeature, StageOutcome> {
        const record = {} as Record<AnalysisReportFullFeature, StageOutcome>;
        for (const feature of ORDER) {
            record[feature] = this.outcomes.get(feature) ?? 'Not reached';
        }
        return record;
    }
}

export function deletionMustRemainNotReached(tracker: AnalysisReportFullStageTracker): boolean {
    const prior = [
        'reportView',
        'displaySettings',
        'shareQr',
        'shareEmail',
        'reportPdf',
        'reportHistory',
    ] as const;
    const deletionOutcome = tracker.outcome('reportDeletion');
    if (deletionOutcome === 'Passed') {
        return true;
    }
    for (const feature of prior) {
        const outcome = tracker.outcome(feature);
        if (outcome === 'Failed' || outcome === 'Entered') {
            return deletionOutcome === 'Not reached';
        }
    }
    return true;
}
