import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';
import { enrichChangePasswordFailure } from './changePasswordErrors';
import type { ChangePasswordProgress } from './changePasswordProgress';
import { validateSmokeNewPassword } from '../../e2e/shared/smokePasswordConfig';

export type ChangePasswordOrchestrationDeps = {
    openMyPageAndVerifyEmail: () => Promise<void>;
    openPasswordRequestForm: () => Promise<void>;
    submitOtpRequestOnce: () => Promise<void>;
    waitForPasswordResetOtp: (notBeforeEpochMs: number) => Promise<string>;
    openConfirmationRoute: () => Promise<void>;
    submitConfirmationOnce: (otpCode: string) => Promise<void>;
    waitForSuccessUi: () => Promise<void>;
    completeSuccessNavigation: () => Promise<void>;
    /** Smoke default: assert same tab still on authenticated /my-page (no goto/re-login). */
    assertMainSessionAuthenticatedAfterReturn: () => Promise<void>;
    /** Optional — not run in default smoke (separate spec / explicit flag). */
    verifyFreshContextLogin?: (account: SmokeAccountRef) => Promise<void>;
    /** Optional — not run in default smoke; masks application logout if used blindly. */
    recoverMainSession?: (account: SmokeAccountRef) => Promise<void>;
};

export type ChangePasswordOrchestrationOptions = {
    /** When true, runs verifyFreshContextLogin after same-session checks. Requires browser deps. */
    verifyNewPasswordViaFreshContext?: boolean;
    /** When true, runs recoverMainSession after fresh verify (legacy continuation path). */
    recoverMainSessionAfterFreshVerify?: boolean;
};

export async function runChangePasswordVerificationOrchestration(params: {
    account: SmokeAccountRef;
    newPassword: string;
    progress: ChangePasswordProgress;
    deps: ChangePasswordOrchestrationDeps;
    options?: ChangePasswordOrchestrationOptions;
}): Promise<SmokeAccountRef> {
    const { account, newPassword, progress, deps, options = {} } = params;
    validateSmokeNewPassword(account.password, newPassword);
    const accountEmail = account.email;

    try {
        await deps.openMyPageAndVerifyEmail();
        await deps.openPasswordRequestForm();

        const otpRequestStartedAt = Date.now();
        await deps.submitOtpRequestOnce();
        progress.otpRequested = true;

        const otpCode = await deps.waitForPasswordResetOtp(otpRequestStartedAt);
        await deps.openConfirmationRoute();

        progress.confirmationAttempted = true;
        await deps.submitConfirmationOnce(otpCode);
        await deps.waitForSuccessUi();
        progress.successUiObserved = true;

        await deps.completeSuccessNavigation();
        await deps.assertMainSessionAuthenticatedAfterReturn();
        progress.mainSessionAuthenticatedAfterReturn = true;

        const updatedAccount: SmokeAccountRef = { email: accountEmail, password: newPassword };

        if (options.verifyNewPasswordViaFreshContext) {
            if (!deps.verifyFreshContextLogin) {
                throw new Error(
                    'verifyNewPasswordViaFreshContext requires verifyFreshContextLogin dep.'
                );
            }
            await deps.verifyFreshContextLogin(updatedAccount);
            progress.freshLoginVerificationCompleted = true;
        }

        if (options.recoverMainSessionAfterFreshVerify) {
            if (!deps.recoverMainSession) {
                throw new Error('recoverMainSessionAfterFreshVerify requires recoverMainSession dep.');
            }
            await deps.recoverMainSession(updatedAccount);
            progress.mainSessionRecoveryPerformed = true;
        }

        return updatedAccount;
    } catch (err) {
        throw enrichChangePasswordFailure(err, progress, accountEmail);
    }
}
