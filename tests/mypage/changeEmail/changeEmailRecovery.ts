import type { ChangeEmailPending, ChangeEmailState } from './changeEmailState';

export class ChangeEmailRecoveryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChangeEmailRecoveryError';
    }
}

/**
 * Pending must match the failed run exactly before recovery mutates state.
 */
export function assertRecoverableOtpRequestPending(
    state: ChangeEmailState,
    currentEmail: string
): ChangeEmailPending {
    const pending = state.pendingChange;
    if (!pending) {
        throw new ChangeEmailRecoveryError(
            'Change Email recovery requires pendingChange; none is set.'
        );
    }
    if (pending.phase !== 'otp_request_submitted') {
        throw new ChangeEmailRecoveryError(
            `Change Email recovery expects phase otp_request_submitted, got ${pending.phase}.`
        );
    }
    if (pending.currentEmail !== currentEmail) {
        throw new ChangeEmailRecoveryError(
            'Change Email recovery currentEmail does not match pendingChange.currentEmail.'
        );
    }
    if (!pending.otpRequestSubmittedAt) {
        throw new ChangeEmailRecoveryError(
            'Change Email recovery requires pendingChange.otpRequestSubmittedAt.'
        );
    }
    if (pending.confirmationSubmittedAt) {
        throw new ChangeEmailRecoveryError(
            'Change Email recovery refuses pending with confirmationSubmittedAt already set.'
        );
    }
    return pending;
}

export function otpRequestNotBeforeEpochMs(pending: ChangeEmailPending): number {
    const ms = Date.parse(pending.otpRequestSubmittedAt!);
    if (!Number.isFinite(ms)) {
        throw new ChangeEmailRecoveryError('pendingChange.otpRequestSubmittedAt is not parseable.');
    }
    return ms;
}
