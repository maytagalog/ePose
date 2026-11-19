import { STAGING_PASSWORD_MIN_LENGTH } from '../../e2e/shared/smokePasswordConfig';

/**
 * Part 1 password sequence (fullE2ESmokePart1 after Online Booking + logout; standalone via EPOSE_FORGOT_PASSWORD_EMAIL):
 * Registration Passw0rd → Forgot Password P@ssw0rd → My Page Change Password Password123.
 *
 * This reset flow uses email + OTP only — the previous account password is not required or used.
 */
export const FORGOT_PASSWORD_SMOKE_NEW_PASSWORD = 'P@ssw0rd';

export const FORGOT_PASSWORD_EMAIL_ENV = 'EPOSE_FORGOT_PASSWORD_EMAIL';
export const FORGOT_PASSWORD_NEW_PASSWORD_ENV = 'EPOSE_FORGOT_PASSWORD_NEW_PASSWORD';

export type ForgotPasswordCredentials = {
    email: string;
    password: string;
};

export class ForgotPasswordConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ForgotPasswordConfigError';
    }
}

function validateForgotPasswordNewPassword(newPassword: string): void {
    if (!newPassword) {
        throw new ForgotPasswordConfigError('New password must be non-empty.');
    }
    if (newPassword.length < STAGING_PASSWORD_MIN_LENGTH) {
        throw new ForgotPasswordConfigError(
            `New password must be at least ${STAGING_PASSWORD_MIN_LENGTH} characters for staging.`
        );
    }
}

/** Requires EPOSE_FORGOT_PASSWORD_EMAIL — mailbox must receive the reset OTP (Gmail API). */
export function resolveForgotPasswordEmail(): string {
    const email = process.env[FORGOT_PASSWORD_EMAIL_ENV]?.trim();
    if (!email || !email.includes('@')) {
        throw new ForgotPasswordConfigError(
            `Set ${FORGOT_PASSWORD_EMAIL_ENV} to the existing account email for password reset.`
        );
    }
    return email;
}

export function resolveForgotPasswordNewPassword(): string {
    const override = process.env[FORGOT_PASSWORD_NEW_PASSWORD_ENV]?.trim();
    const next = override || FORGOT_PASSWORD_SMOKE_NEW_PASSWORD;
    validateForgotPasswordNewPassword(next);
    return next;
}