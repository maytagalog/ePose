import { test, expect } from '@playwright/test';
import {
    resolveSmokeChangePasswordTarget,
    validateSmokeNewPassword,
    SmokePasswordConfigError,
    SMOKE_NEW_PASSWORD_ENV,
    DEFAULT_SMOKE_CHANGE_PASSWORD_TARGET,
} from '../../e2e/shared/smokePasswordConfig';
import {
    ChangePasswordUncertainOutcomeError,
    ChangePasswordVerificationError,
    uncertainSuccessScreenMessage,
} from './changePasswordErrors';
import { waitForPasswordChangeSuccessAfterSubmit } from './myPageChangePasswordFlow';
import {
    finalizeChangePasswordAccountAfterVerification,
    performChangePasswordConfirmationBoundary,
} from './changePasswordFlowBoundaries';
import { enrichChangePasswordFailure } from './changePasswordErrors';
import { createChangePasswordProgress } from './changePasswordProgress';

test('validateSmokeNewPassword rejects new password equal to current before OTP', () => {
    expect(() => validateSmokeNewPassword('Passw0rd', 'Passw0rd')).toThrow(SmokePasswordConfigError);
    expect(() => validateSmokeNewPassword('Passw0rd', 'Password123')).not.toThrow();
});

test('resolveSmokeChangePasswordTarget defaults to Password123 when env unset', () => {
    const prior = process.env[SMOKE_NEW_PASSWORD_ENV];
    delete process.env[SMOKE_NEW_PASSWORD_ENV];
    try {
        expect(resolveSmokeChangePasswordTarget('Passw0rd')).toBe(
            DEFAULT_SMOKE_CHANGE_PASSWORD_TARGET
        );
    } finally {
        if (prior !== undefined) {
            process.env[SMOKE_NEW_PASSWORD_ENV] = prior;
        }
    }
});

test('resolveSmokeChangePasswordTarget uses env override without trimming', () => {
    const prior = process.env[SMOKE_NEW_PASSWORD_ENV];
    process.env[SMOKE_NEW_PASSWORD_ENV] = ' CustomNew1 ';
    try {
        expect(resolveSmokeChangePasswordTarget('Passw0rd')).toBe(' CustomNew1 ');
    } finally {
        if (prior === undefined) {
            delete process.env[SMOKE_NEW_PASSWORD_ENV];
        } else {
            process.env[SMOKE_NEW_PASSWORD_ENV] = prior;
        }
    }
});

test('resolveSmokeChangePasswordTarget rejects override equal to registration password', () => {
    const prior = process.env[SMOKE_NEW_PASSWORD_ENV];
    process.env[SMOKE_NEW_PASSWORD_ENV] = 'Passw0rd';
    try {
        expect(() => resolveSmokeChangePasswordTarget('Passw0rd')).toThrow(SmokePasswordConfigError);
    } finally {
        if (prior === undefined) {
            delete process.env[SMOKE_NEW_PASSWORD_ENV];
        } else {
            process.env[SMOKE_NEW_PASSWORD_ENV] = prior;
        }
    }
});

test('confirmation timeout does not trigger another submission', async ({ page }) => {
    test.setTimeout(120000);
    await page.setContent('<div>not the success screen</div>');
    let submitAttempts = 0;
    await expect(
        performChangePasswordConfirmationBoundary({
            submitConfirmation: async () => {
                submitAttempts += 1;
                await waitForPasswordChangeSuccessAfterSubmit(page);
            },
        })
    ).rejects.toThrow(ChangePasswordUncertainOutcomeError);
    expect(submitAttempts).toBe(1);
});

test('failed fresh-login verification prevents successful finalize', async () => {
    await expect(
        finalizeChangePasswordAccountAfterVerification({
            accountEmail: 'user@example.com',
            newPassword: 'Password123',
            verifyFreshLogin: async () => {
                throw new ChangePasswordVerificationError('fresh login failed');
            },
        })
    ).rejects.toThrow(ChangePasswordVerificationError);
});

test('enrichFailure: after success UI, verification errors mention new password may be active', () => {
    const progress = createChangePasswordProgress();
    progress.successUiObserved = true;
    const wrapped = enrichChangePasswordFailure(
        new ChangePasswordVerificationError('fresh login failed'),
        progress,
        'a@b.com'
    );
    expect(wrapped.message).toContain('success UI was observed');
    expect(wrapped.message).toContain('configured new password may already be active');
    expect(wrapped.cause).toBeTruthy();
});

test('enrichFailure: after confirmation without success UI, outcome is uncertain', () => {
    const progress = createChangePasswordProgress();
    progress.confirmationAttempted = true;
    const wrapped = enrichChangePasswordFailure(new Error('network'), progress, 'a@b.com');
    expect(wrapped).toBeInstanceOf(ChangePasswordUncertainOutcomeError);
    expect(wrapped.message).toContain('Outcome is uncertain');
});

test('uncertainSuccessScreenMessage documents configured new password may be active', () => {
    expect(uncertainSuccessScreenMessage()).toContain('configured new password may already be active');
});
