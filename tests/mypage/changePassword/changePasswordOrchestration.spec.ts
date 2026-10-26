import { test, expect } from '@playwright/test';
import { runChangePasswordVerificationOrchestration } from './changePasswordOrchestration';
import { createChangePasswordProgress } from './changePasswordProgress';
import {
    ChangePasswordSessionInvalidatedError,
    ChangePasswordUncertainOutcomeError,
    ChangePasswordVerificationError,
} from './changePasswordErrors';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';

function smokeDeps(
    overrides?: Partial<Parameters<typeof runChangePasswordVerificationOrchestration>[0]['deps']>
) {
    let otpRequests = 0;
    let confirmations = 0;
    let mainSessionAsserted = false;

    const base = {
        openMyPageAndVerifyEmail: async () => {},
        openPasswordRequestForm: async () => {},
        submitOtpRequestOnce: async () => {
            otpRequests += 1;
        },
        waitForPasswordResetOtp: async () => '123456',
        openConfirmationRoute: async () => {},
        submitConfirmationOnce: async () => {
            confirmations += 1;
        },
        waitForSuccessUi: async () => {},
        completeSuccessNavigation: async () => {},
        assertMainSessionAuthenticatedAfterReturn: async () => {
            mainSessionAsserted = true;
        },
        ...overrides,
    };

    return {
        deps: base,
        otpRequests: () => otpRequests,
        confirmations: () => confirmations,
        mainSessionAsserted: () => mainSessionAsserted,
    };
}

test('orchestration: one OTP request and one confirmation on success', async () => {
    const progress = createChangePasswordProgress();
    const { deps, otpRequests, confirmations, mainSessionAsserted } = smokeDeps();

    const result = await runChangePasswordVerificationOrchestration({
        account: { email: 'a@b.com', password: 'Passw0rd' },
        newPassword: 'Password123',
        progress,
        deps,
    });

    expect(otpRequests()).toBe(1);
    expect(confirmations()).toBe(1);
    expect(mainSessionAsserted()).toBe(true);
    expect(result).toEqual({ email: 'a@b.com', password: 'Password123' });
    expect(progress.mainSessionAuthenticatedAfterReturn).toBe(true);
    expect(progress.freshLoginVerificationCompleted).toBe(false);
    expect(progress.mainSessionRecoveryPerformed).toBe(false);
});

test('orchestration: no second confirmation after success wait timeout', async () => {
    const progress = createChangePasswordProgress();
    const { deps, confirmations } = smokeDeps({
        waitForSuccessUi: async () => {
            throw new ChangePasswordUncertainOutcomeError('success screen timeout');
        },
    });

    await expect(
        runChangePasswordVerificationOrchestration({
            account: { email: 'a@b.com', password: 'Passw0rd' },
            newPassword: 'Password123',
            progress,
            deps,
        })
    ).rejects.toThrow(ChangePasswordUncertainOutcomeError);
    expect(confirmations()).toBe(1);
    expect(progress.mainSessionAuthenticatedAfterReturn).toBe(false);
});

test('orchestration: same-session login after return fails smoke (no silent recovery)', async () => {
    const progress = createChangePasswordProgress();
    const { deps } = smokeDeps({
        assertMainSessionAuthenticatedAfterReturn: async () => {
            throw new ChangePasswordSessionInvalidatedError('on /login after return');
        },
    });

    await expect(
        runChangePasswordVerificationOrchestration({
            account: { email: 'a@b.com', password: 'Passw0rd' },
            newPassword: 'Password123',
            progress,
            deps,
        })
    ).rejects.toThrow(/on \/login after return|ChangePasswordSessionInvalidatedError/);
    expect(progress.successUiObserved).toBe(true);
    expect(progress.mainSessionAuthenticatedAfterReturn).toBe(false);
});

test('orchestration: optional fresh-context verify when explicitly enabled', async () => {
    const progress = createChangePasswordProgress();
    let seen: SmokeAccountRef | null = null;
    const { deps } = smokeDeps({
        verifyFreshContextLogin: async (account) => {
            seen = account;
        },
    });

    await runChangePasswordVerificationOrchestration({
        account: { email: 'a.ardva.rkomonstrosesquip1230000@gmail.com', password: 'Passw0rd' },
        newPassword: 'Password123',
        progress,
        deps,
        options: { verifyNewPasswordViaFreshContext: true },
    });

    expect(seen).toEqual({
        email: 'a.ardva.rkomonstrosesquip1230000@gmail.com',
        password: 'Password123',
    });
    expect(progress.freshLoginVerificationCompleted).toBe(true);
    expect(progress.mainSessionRecoveryPerformed).toBe(false);
});

test('orchestration: failed optional fresh authentication prevents success', async () => {
    const progress = createChangePasswordProgress();
    const { deps } = smokeDeps({
        verifyFreshContextLogin: async () => {
            throw new ChangePasswordVerificationError('fresh login failed');
        },
    });

    await expect(
        runChangePasswordVerificationOrchestration({
            account: { email: 'keep@example.com', password: 'Passw0rd' },
            newPassword: 'Password123',
            progress,
            deps,
            options: { verifyNewPasswordViaFreshContext: true },
        })
    ).rejects.toThrow(/success UI was observed|fresh login failed/);
    expect(progress.mainSessionAuthenticatedAfterReturn).toBe(true);
    expect(progress.freshLoginVerificationCompleted).toBe(false);
});

test('orchestration: failed required success navigation prevents successful result', async () => {
    const progress = createChangePasswordProgress();
    const { deps } = smokeDeps({
        completeSuccessNavigation: async () => {
            throw new Error('マイページへもどる must navigate');
        },
    });

    await expect(
        runChangePasswordVerificationOrchestration({
            account: { email: 'a@b.com', password: 'Passw0rd' },
            newPassword: 'Password123',
            progress,
            deps,
        })
    ).rejects.toThrow(/マイページへもどる must navigate|success UI was observed/);
    expect(progress.mainSessionAuthenticatedAfterReturn).toBe(false);
});

test('orchestration: explicit recovery runs only when opted in', async () => {
    const progress = createChangePasswordProgress();
    let recovered: SmokeAccountRef | null = null;
    const { deps } = smokeDeps({
        verifyFreshContextLogin: async (account) => {
            recovered = account;
        },
        recoverMainSession: async (account) => {
            recovered = account;
        },
    });

    await runChangePasswordVerificationOrchestration({
        account: { email: 'a@b.com', password: 'Passw0rd' },
        newPassword: 'Password123',
        progress,
        deps,
        options: {
            verifyNewPasswordViaFreshContext: true,
            recoverMainSessionAfterFreshVerify: true,
        },
    });

    expect(recovered).toEqual({ email: 'a@b.com', password: 'Password123' });
    expect(progress.mainSessionRecoveryPerformed).toBe(true);
});
