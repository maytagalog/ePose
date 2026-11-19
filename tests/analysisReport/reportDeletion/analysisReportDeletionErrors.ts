export class AnalysisReportDeletionFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnalysisReportDeletionFlowError';
    }
}

export class AnalysisReportDeletionConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnalysisReportDeletionConfigError';
    }
}

export class AnalysisReportDeletionPlanError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnalysisReportDeletionPlanError';
    }
}
