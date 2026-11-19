export type ComparisonReportPdfSetupStage = 'login' | 'comparisonSetup' | 'contentExpectations';

export type ComparisonReportPdfVerificationStage =
    | 'applicationPrintMenuAction'
    | 'a4PdfSave'
    | 'savedPdfFileValidation'
    | 'pdfContentVerification'
    | 'comparisonPairPreserved';

export type ComparisonReportPdfStage = ComparisonReportPdfSetupStage | ComparisonReportPdfVerificationStage;

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: ComparisonReportPdfStage[] = [
    'login',
    'comparisonSetup',
    'contentExpectations',
    'applicationPrintMenuAction',
    'a4PdfSave',
    'savedPdfFileValidation',
    'pdfContentVerification',
    'comparisonPairPreserved',
];

export const COMPARISON_PDF_GENERATION_STAGES: ComparisonReportPdfVerificationStage[] = [
    'a4PdfSave',
    'savedPdfFileValidation',
    'pdfContentVerification',
];

export class ComparisonReportPdfStageTracker {
    private readonly outcomes = new Map<ComparisonReportPdfStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: ComparisonReportPdfStage): void {
        if ((this.outcomes.get(stage) ?? 'Not reached') === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: ComparisonReportPdfStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: ComparisonReportPdfStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    skip(stage: ComparisonReportPdfStage): void {
        this.outcomes.set(stage, 'Skipped');
    }

    outcome(stage: ComparisonReportPdfStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<ComparisonReportPdfStage, StageOutcome> {
        const record = {} as Record<ComparisonReportPdfStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }

    skipPdfGenerationStages(): void {
        for (const stage of COMPARISON_PDF_GENERATION_STAGES) {
            this.skip(stage);
        }
    }
}

export function failEnteredComparisonPdfStages(tracker: ComparisonReportPdfStageTracker): void {
    for (const stage of ALL_STAGES) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}