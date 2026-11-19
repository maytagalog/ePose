export class AnalysisReportViewFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnalysisReportViewFlowError';
    }
}
