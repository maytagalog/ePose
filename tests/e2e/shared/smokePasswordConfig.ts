/**
 * Full E2E smoke Change Password target. Never log or persist password values.
 *
 * Default for newly registered smoke (registration password Passw0rd): Password123.
 * Override with EPOSE_SMOKE_NEW_PASSWORD when needed.
 *
 * Minimum length 8 is a local precheck only — staging may enforce additional rules.
 */
export const SMOKE_NEW_PASSWORD_ENV = 'EPOSE_SMOKE_NEW_PASSWORD';
export const STAGING_PASSWORD_MIN_LENGTH = 8;

/** Default Change Password target when registration uses Passw0rd in full E2E smoke. */
export const DEFAULT_SMOKE_CHANGE_PASSWORD_TARGET = 'Password123';

export class SmokePasswordConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SmokePasswordConfigError';
    }
}

/**
 * Resolves the Change Password target for full E2E before registration consumes an email slot.
 * Validates the target differs from the registration password and meets local prechecks.
 */
export function resolveSmokeChangePasswordTarget(registrationPassword: string): string {
    const raw = process.env[SMOKE_NEW_PASSWORD_ENV];
    const target =
        raw !== undefined && raw !== '' ? raw : DEFAULT_SMOKE_CHANGE_PASSWORD_TARGET;
    validateSmokeNewPassword(registrationPassword, target);
    return target;
}

/** @deprecated Use resolveSmokeChangePasswordTarget — env is optional with a documented default. */
export function requireSmokeNewPasswordFromEnv(): string {
    const raw = process.env[SMOKE_NEW_PASSWORD_ENV];
    if (raw === undefined || raw === '') {
        return DEFAULT_SMOKE_CHANGE_PASSWORD_TARGET;
    }
    return raw;
}

export function validateSmokeNewPassword(
    currentPassword: string,
    newPassword: string
): void {
    if (!newPassword) {
        throw new SmokePasswordConfigError('New password must be non-empty.');
    }
    if (newPassword.length < STAGING_PASSWORD_MIN_LENGTH) {
        throw new SmokePasswordConfigError(
            `New password must be at least ${STAGING_PASSWORD_MIN_LENGTH} characters for staging.`
        );
    }
    if (newPassword === currentPassword) {
        throw new SmokePasswordConfigError(
            'New password must differ from the current account password before requesting a password-reset OTP.'
        );
    }
}
