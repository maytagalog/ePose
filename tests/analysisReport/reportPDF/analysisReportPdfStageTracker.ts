export type AnalysisReportPdfSetupStage = 'login' | 'navigation' | 'contentExpectations';

export type PdfVerificationStage =
    | 'applicationPrintMenuAction'
    | 'a4PdfGeneration'
    | 'savedPdfFileValidation'
    | 'pdfContentVerification';

export type AnalysisReportPdfStage = AnalysisReportPdfSetupStage | PdfVerificationStage;

export type StageOutcome = 'Not reached' | 'Entered' | 'Passed' | 'Failed' | 'Skipped';

const ALL_STAGES: AnalysisReportPdfStage[] = [
    'login',
    'navigation',
    'contentExpectations',
    'applicationPrintMenuAction',
    'a4PdfGeneration',
    'savedPdfFileValidation',
    'pdfContentVerification',
];

export const PDF_GENERATION_STAGES: PdfVerificationStage[] = [
    'a4PdfGeneration',
    'savedPdfFileValidation',
    'pdfContentVerification',
];

export class AnalysisReportPdfStageTracker {
    private readonly outcomes = new Map<AnalysisReportPdfStage, StageOutcome>();

    constructor() {
        for (const stage of ALL_STAGES) {
            this.outcomes.set(stage, 'Not reached');
        }
    }

    enter(stage: AnalysisReportPdfStage): void {
        const current = this.outcomes.get(stage) ?? 'Not reached';
        if (current === 'Not reached') {
            this.outcomes.set(stage, 'Entered');
        }
    }

    pass(stage: AnalysisReportPdfStage): void {
        this.outcomes.set(stage, 'Passed');
    }

    fail(stage: AnalysisReportPdfStage): void {
        this.outcomes.set(stage, 'Failed');
    }

    skip(stage: AnalysisReportPdfStage): void {
        this.outcomes.set(stage, 'Skipped');
    }

    outcome(stage: AnalysisReportPdfStage): StageOutcome {
        return this.outcomes.get(stage) ?? 'Not reached';
    }

    toRecord(): Record<AnalysisReportPdfStage, StageOutcome> {
        const record = {} as Record<AnalysisReportPdfStage, StageOutcome>;
        for (const stage of ALL_STAGES) {
            record[stage] = this.outcomes.get(stage) ?? 'Not reached';
        }
        return record;
    }

    toSetupRecord(): Record<AnalysisReportPdfSetupStage, StageOutcome> {
        return {
            login: this.outcome('login'),
            navigation: this.outcome('navigation'),
            contentExpectations: this.outcome('contentExpectations'),
        };
    }

    toVerificationRecord(): Record<PdfVerificationStage, StageOutcome> {
        return {
            applicationPrintMenuAction: this.outcome('applicationPrintMenuAction'),
            a4PdfGeneration: this.outcome('a4PdfGeneration'),
            savedPdfFileValidation: this.outcome('savedPdfFileValidation'),
            pdfContentVerification: this.outcome('pdfContentVerification'),
        };
    }

    skipPdfGenerationStages(): void {
        for (const stage of PDF_GENERATION_STAGES) {
            this.skip(stage);
        }
    }
}
