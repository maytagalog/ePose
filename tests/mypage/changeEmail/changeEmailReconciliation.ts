import fs from 'node:fs';
import os from 'node:os';
import {
    acquireChangeEmailLock,
    changeEmailLockFilePath,
    changeEmailStateFilePath,
    commitChangeEmailSuccess,
    createChangeEmailRunId,
    readChangeEmailState,
    releaseChangeEmailLock,
    retireAbandonedChangeEmailTargetAtomic,
    validateExpectedAbandonedPendingForRetirement,
    validateExpectedSuccessCommitPending,
    type ExpectedAbandonedPendingRetirement,
    type ExpectedSuccessCommitPending,
} from './changeEmailState';

export function assertNoChangeEmailLock(lockPath: string): void {
    if (fs.existsSync(lockPath)) {
        throw new Error(
            `Change Email lock exists at ${lockPath}. Another process may be running; stop it before reconciliation.`
        );
    }
}

/**
 * Lock, revalidate expected abandoned pending, retire target (not a successful email commit).
 */
export function runRetireAbandonedChangeEmailTargetSession(params: {
    repoRoot: string;
    localBase: string;
    domain: string;
    expected: ExpectedAbandonedPendingRetirement;
}): { newNext: number; retiredTargetIndex: number } {
    const { repoRoot, localBase, domain, expected } = params;
    const statePath = changeEmailStateFilePath(repoRoot);
    const lockPath = changeEmailLockFilePath(repoRoot);
    const reconcileRunId = createChangeEmailRunId();

    assertNoChangeEmailLock(lockPath);

    const before = readChangeEmailState(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    validateExpectedAbandonedPendingForRetirement(before, expected);

    acquireChangeEmailLock(lockPath, {
        runId: reconcileRunId,
        pid: process.pid,
        hostname: os.hostname(),
        acquiredAt: new Date().toISOString(),
        currentEmail: expected.currentEmail,
        targetEmail: expected.targetEmail,
    });

    try {
        const underLock = readChangeEmailState(statePath, localBase, domain, {
            allowUnresolvedPending: true,
        });
        validateExpectedAbandonedPendingForRetirement(underLock, expected);
        return retireAbandonedChangeEmailTargetAtomic(statePath, localBase, domain, expected);
    } finally {
        releaseChangeEmailLock(lockPath, reconcileRunId);
    }
}

/**
 * Lock, revalidate confirmation_submitted pending, commit successful change (production helper).
 */
export function runCommitVerifiedChangeEmailSuccessSession(params: {
    repoRoot: string;
    localBase: string;
    domain: string;
    expected: ExpectedSuccessCommitPending;
}): { newNext: number; committedTargetIndex: number; pendingRunId: string } {
    const { repoRoot, localBase, domain, expected } = params;
    const statePath = changeEmailStateFilePath(repoRoot);
    const lockPath = changeEmailLockFilePath(repoRoot);
    const reconcileRunId = createChangeEmailRunId();

    assertNoChangeEmailLock(lockPath);

    const before = readChangeEmailState(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pendingBefore = validateExpectedSuccessCommitPending(before, expected);

    acquireChangeEmailLock(lockPath, {
        runId: reconcileRunId,
        pid: process.pid,
        hostname: os.hostname(),
        acquiredAt: new Date().toISOString(),
        currentEmail: expected.currentEmail,
        targetEmail: expected.targetEmail,
    });

    try {
        const underLock = readChangeEmailState(statePath, localBase, domain, {
            allowUnresolvedPending: true,
        });
        const pending = validateExpectedSuccessCommitPending(underLock, expected);
        commitChangeEmailSuccess(
            statePath,
            localBase,
            domain,
            pending.runId,
            pending.targetIndex
        );
        const after = readChangeEmailState(statePath, localBase, domain, {
            allowUnresolvedPending: true,
        });
        return {
            newNext: after.nextTargetIndex,
            committedTargetIndex: pending.targetIndex,
            pendingRunId: pendingBefore.runId,
        };
    } finally {
        releaseChangeEmailLock(lockPath, reconcileRunId);
    }
}
