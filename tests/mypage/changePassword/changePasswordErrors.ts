import type { ChangePasswordProgress } from './changePasswordProgress';
import { changePasswordProgressSnapshot } from './changePasswordProgress';

export class ChangePasswordSuccessContentError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'ChangePasswordSuccessContentError';
    }
}

export class ChangePasswordSessionInvalidatedError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'ChangePasswordSessionInvalidatedError';
    }
}

export class ChangePasswordFlowError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'ChangePasswordFlowError';
    }
}

export class ChangePasswordVerificationError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'ChangePasswordVerificationError';
    }
}

export class ChangePasswordUncertainOutcomeError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'ChangePasswordUncertainOutcomeError';
    }
}

const MAY_ALREADY_BE_ACTIVE =
    'The configured new password may already be active; do not blindly retry with the original password.';

export function enrichChangePasswordFailure(
    err: unknown,
    progress: ChangePasswordProgress,
    accountEmail: string
): Error {
    const phases = changePasswordProgressSnapshot(accountEmail, progress);
    const phaseText = JSON.stringify(phases);

    if (err instanceof ChangePasswordUncertainOutcomeError) {
        return err;
    }

    if (err instanceof ChangePasswordSessionInvalidatedError) {
        return err;
    }

    if (progress.successUiObserved) {
        const message =
            `Change Password success UI was observed but a later step failed. ${MAY_ALREADY_BE_ACTIVE} ` +
            `Phases: ${phaseText}.`;
        if (err instanceof ChangePasswordVerificationError) {
            return new ChangePasswordVerificationError(message, { cause: err });
        }
        return new ChangePasswordVerificationError(message, {
            cause: err instanceof Error ? err : new Error(String(err)),
        });
    }

    if (progress.confirmationAttempted && !progress.successUiObserved) {
        const message =
            `Change Password confirmation was attempted but success UI was not verified. Outcome is uncertain. ${MAY_ALREADY_BE_ACTIVE} ` +
            `Phases: ${phaseText}.`;
        return new ChangePasswordUncertainOutcomeError(message, {
            cause: err instanceof Error ? err : new Error(String(err)),
        });
    }

    if (err instanceof Error) {
        return err;
    }
    return new ChangePasswordFlowError(String(err));
}

export function uncertainSuccessScreenMessage(): string {
    return (
        'Password confirmation submit did not reach a verified success screen within the timeout. ' +
        `Outcome is uncertain. ${MAY_ALREADY_BE_ACTIVE}`
    );
}
