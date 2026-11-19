export class HandwrittenNotesFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HandwrittenNotesFlowError';
    }
}
