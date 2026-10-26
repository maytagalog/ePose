import os from 'node:os';
import {
    acquireChangeEmailLock,
    assertTwoDotTargetAvailable,
    buildTwoDotEmailFromIndex,
    changeEmailLockFilePath,
    changeEmailStateFilePath,
    commitChangeEmailSuccess,
    createChangeEmailRunId,
    persistConfirmationSubmitted,
    persistOtpRequestSubmitted,
    persistPendingTargetReserved,
    readChangeEmailState,
    releaseChangeEmailLock,
    type ChangeEmailPending,
} from './changeEmailState';

export type ChangeEmailSessionContext = {
    runId: string;
    statePath: string;
    lockPath: string;
    localBase: string;
    domain: string;
    targetIndex: number;
    targetEmail: string;
    persistOtpRequestSubmitted: () => void;
    persistConfirmationSubmitted: () => void;
    commitChangeEmailSuccess: () => void;
};

export type ChangeEmailSessionParams = {
    repoRoot: string;
    localBase: string;
    domain: string;
    currentEmail: string;
    runBody: (ctx: ChangeEmailSessionContext) => Promise<void>;
};

export async function runChangeEmailStateSession(
    params: ChangeEmailSessionParams
): Promise<void> {
    const { repoRoot, localBase, domain, currentEmail, runBody } = params;
    const runId = createChangeEmailRunId();
    const statePath = changeEmailStateFilePath(repoRoot);
    const lockPath = changeEmailLockFilePath(repoRoot);
    let lockHeld = false;

    try {
        acquireChangeEmailLock(lockPath, {
            runId,
            pid: process.pid,
            hostname: os.hostname(),
            acquiredAt: new Date().toISOString(),
            currentEmail,
        });
        lockHeld = true;

        const state = readChangeEmailState(statePath, localBase, domain);
        assertTwoDotTargetAvailable(state.nextTargetIndex, localBase);
        const targetIndex = state.nextTargetIndex;
        const targetEmail = buildTwoDotEmailFromIndex(localBase, domain, targetIndex);
        if (targetEmail === currentEmail) {
            throw new Error(
                `Change Email target equals current email (${currentEmail}). Advance nextTargetIndex after reconciling prior use.`
            );
        }

        const pending: ChangeEmailPending = {
            targetIndex,
            currentEmail,
            targetEmail,
            phase: 'target_reserved',
            runId,
            hostname: os.hostname(),
            pid: process.pid,
            startedAt: new Date().toISOString(),
        };
        persistPendingTargetReserved(statePath, localBase, domain, pending);

        console.log(`Change Email target index: ${targetIndex}`);
        console.log(`Change Email current: ${currentEmail}`);
        console.log(`Change Email target: ${targetEmail}`);

        await runBody({
            runId,
            statePath,
            lockPath,
            localBase,
            domain,
            targetIndex,
            targetEmail,
            persistOtpRequestSubmitted: () => {
                persistOtpRequestSubmitted(statePath, localBase, domain, runId);
            },
            persistConfirmationSubmitted: () => {
                persistConfirmationSubmitted(statePath, localBase, domain, runId);
            },
            commitChangeEmailSuccess: () => {
                commitChangeEmailSuccess(
                    statePath,
                    localBase,
                    domain,
                    runId,
                    targetIndex
                );
            },
        });
    } finally {
        if (lockHeld) {
            releaseChangeEmailLock(lockPath, runId);
        }
    }
}
