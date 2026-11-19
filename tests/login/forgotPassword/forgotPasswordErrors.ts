export class ForgotPasswordFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ForgotPasswordFlowError';
    }
}