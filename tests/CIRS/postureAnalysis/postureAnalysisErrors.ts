export class PostureAnalysisFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PostureAnalysisFlowError';
    }
}
