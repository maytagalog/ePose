import os from 'node:os';
import {
    acquireChangeEmailLock,
    changeEmailLockFilePath,
    changeEmailStateFilePath,
    commitChangeEmailSuccess,
    createChangeEmailRunId,
    persistConfirmationSubmitted,
    readChangeEmailState,
    releaseChangeEmailLock,
    type ChangeEmailPending,
} from './changeEmailState';
import {
    assertRecoverableOtpRequestPending,
    ChangeEmailRecoveryError,
} from './changeEmailRecovery';
import type { ChangeEmailSessionContext } from './changeEmailOrchestration';

export type ChangeEmailRecoverySessionContext = ChangeEmailSessionContext & {
    currentEmail: string;
    otpRequestSubmittedAt: string;
    pending: ChangeEmailPending;
};

export type ChangeEmailRecoverySessionParams = {
    repoRoot: string;
    localBase: string;
    domain: string;
    currentEmail: string;
    runBody: (ctx: ChangeEmailRecoverySessionContext) => Promise<void>;
};

/**
 * Resume otp_request_submitted pending: lock, revalidate pending, confirm OTP once, commit.
 * Does not reserve a new target or persist otp_request_submitted again.
 */
export async function runChangeEmailRecoverySession(
    params: ChangeEmailRecoverySessionParams
): Promise<void> {
    const { repoRoot, localBase, domain, currentEmail, runBody } = params;
    const recoveryLockRunId = createChangeEmailRunId();
    const statePath = changeEmailStateFilePath(repoRoot);
    const lockPath = changeEmailLockFilePath(repoRoot);
    let lockHeld = false;

    try {
        acquireChangeEmailLock(lockPath, {
            runId: recoveryLockRunId,
            pid: process.pid,
            hostname: os.hostname(),
            acquiredAt: new Date().toISOString(),
            currentEmail,
        });
        lockHeld = true;

        const state = readChangeEmailState(statePath, localBase, domain, {
            allowUnresolvedPending: true,
        });
        const pending = assertRecoverableOtpRequestPending(state, currentEmail);

        const pendingRunId = pending.runId;
        const ctx: ChangeEmailRecoverySessionContext = {
            runId: pendingRunId,
            statePath,
            lockPath,
            localBase,
            domain,
            targetIndex: pending.targetIndex,
            targetEmail: pending.targetEmail,
            currentEmail: pending.currentEmail,
            otpRequestSubmittedAt: pending.otpRequestSubmittedAt!,
            pending,
            persistOtpRequestSubmitted: () => {
                throw new ChangeEmailRecoveryError(
                    'Recovery must not persist otp_request_submitted or send a new OTP request.'
                );
            },
            persistConfirmationSubmitted: () => {
                persistConfirmationSubmitted(statePath, localBase, domain, pendingRunId);
            },
            commitChangeEmailSuccess: () => {
                commitChangeEmailSuccess(
                    statePath,
                    localBase,
                    domain,
                    pendingRunId,
                    pending.targetIndex
                );
            },
        };

        console.log(
            'CHANGE_EMAIL_RECOVERY',
            JSON.stringify({
                targetIndex: pending.targetIndex,
                currentEmail: pending.currentEmail,
                targetEmail: pending.targetEmail,
                phase: pending.phase,
                pendingRunId,
                recoveryLockRunId,
                otpRequestSubmittedAt: pending.otpRequestSubmittedAt,
            })
        );

        await runBody(ctx);
    } finally {
        if (lockHeld) {
            releaseChangeEmailLock(lockPath, recoveryLockRunId);
        }
    }
}
