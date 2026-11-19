export class TakeoverFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TakeoverFlowError';
    }
}
