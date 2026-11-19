import os from 'node:os';
import { preflightGmailApiReadAccess } from '../../utils/gmail';
import {
    acquireExclusiveLock,
    buildRegistrationEmail,
    clearPendingSelectedOnly,
    commitEmailConsumed,
    createRunId,
    lockFilePath,
    migrateRegistrationEmailStateIfNeeded,
    persistApplicationSubmitPending,
    persistOtpSubmitted,
    persistPendingSelected,
    readEmailState,
    releaseExclusiveLock,
    resolveRegistrationAllocation,
    stateFilePath,
    type RegistrationAllocationPool,
} from './emailState';
import {
    applicationSubmitNotBeforeEpochMs,
    assertRecoverableApplicationSubmitPending,
    verifyRegistrationResumeOtpInbox,
} from './registrationEmailRecovery';

export const AUTH_VERIFICATION_REJECTED_MESSAGE =
    'Email verification rejected (認証に失敗しました). Smoke failed; pending preserved for reconciliation.';

export type SmokeSessionContext = {
    runId: string;
    statePath: string;
    lockPath: string;
    localBase: string;
    domain: string;
    allocationPool: RegistrationAllocationPool;
    dotPosition: number;
    threeDotIndex: number | null;
    email: string;
    markApplicationSubmitPendingCrossed: () => void;
    /** Resume Gmail OTP flow without re-submitting application (pending application_submit_pending). */
    resumedAfterApplicationSubmit?: boolean;
    applicationSubmitNotBeforeEpochMs?: number;
    /** From Gmail OTP precheck when resuming application_submit_pending. */
    registrationResumeVerificationUrl?: string;
};

export type SmokeSessionParams = {
    repoRoot: string;
    localBase: string;
    domain: string;
    manualDotPositionRaw: string | undefined;
    runBody: (ctx: SmokeSessionContext) => Promise<void>;
};

export type EmergencyLockReleaseOptions = {
    /** Test hook: observe or stub termination re-dispatch after emergency release. */
    killProcess?: (pid: number, signal: NodeJS.Signals) => void;
};

const TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/**
 * Registers best-effort lock release when the worker process is actually terminating.
 *
 * Signal handlers release the owned lock, remove themselves, then re-dispatch the same
 * signal so Playwright/Node default termination is preserved (listeners alone would
 * suppress it). An `exit` listener covers other exit paths. SIGKILL is not catchable;
 * stale locks rely on existing reconciliation.
 *
 * Call the returned disposer after normal session completion so listeners are not left
 * attached while the worker continues (e.g. further Playwright tests in the same process).
 */
export function registerEmergencyLockRelease(
    lockPath: string,
    runId: string,
    options?: EmergencyLockReleaseOptions
): () => void {
    const killProcess =
        options?.killProcess ??
        ((pid: number, signal: NodeJS.Signals) => {
            process.kill(pid, signal);
        });

    let disposed = false;
    let emergencyReleased = false;

    const releaseOwnedLockOnce = (): void => {
        if (disposed || emergencyReleased) {
            return;
        }
        emergencyReleased = true;
        releaseExclusiveLock(lockPath, runId);
    };

    const signalHandlers = new Map<NodeJS.Signals, () => void>();

    for (const signal of TERMINATION_SIGNALS) {
        const handler = (): void => {
            releaseOwnedLockOnce();
            process.removeListener(signal, handler);
            signalHandlers.delete(signal);
            try {
                killProcess(process.pid, signal);
            } catch {
                const code =
                    signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 129;
                process.exit(code);
            }
        };
        signalHandlers.set(signal, handler);
        process.once(signal, handler);
    }

    const onExit = (): void => {
        releaseOwnedLockOnce();
    };
    process.once('exit', onExit);

    return () => {
        disposed = true;
        for (const [signal, handler] of signalHandlers) {
            process.removeListener(signal, handler);
        }
        signalHandlers.clear();
        process.removeListener('exit', onExit);
    };
}

/**
 * Production smoke session: exclusive lock, startup state read, selected pending,
 * run body with selected-only cleanup on early failure, lock release in finally.
 */
export async function runSmokeEmailStateSession(
    params: SmokeSessionParams
): Promise<void> {
    const { repoRoot, localBase, domain, manualDotPositionRaw, runBody } =
        params;

    const runId = createRunId();
    const statePath = stateFilePath(repoRoot);
    const lockPath = lockFilePath(repoRoot);
    let lockHeld = false;
    let disposeEmergencyLockRelease: (() => void) | undefined;
    let crossedApplicationSubmitPending = false;

    try {
        acquireExclusiveLock(lockPath, {
            runId,
            pid: process.pid,
            hostname: os.hostname(),
            acquiredAt: new Date().toISOString(),
        });
        lockHeld = true;
        disposeEmergencyLockRelease = registerEmergencyLockRelease(lockPath, runId);

        const migration = migrateRegistrationEmailStateIfNeeded(
            statePath,
            localBase,
            domain,
            { repoRoot }
        );
        if (migration.migrated) {
            console.log(
                `Registration email state migrated v${migration.fromVersion}→v${migration.toVersion} (backup: ${migration.backupRelativePath ?? 'none'}, pool: ${migration.allocationPool})`
            );
        }

        await preflightGmailApiReadAccess();

        const stateWithPending = readEmailState(statePath, localBase, domain, {
            allowUnresolvedPending: true,
        });
        const recoverablePending = stateWithPending.pendingVerification
            ? (() => {
                  try {
                      return assertRecoverableApplicationSubmitPending(stateWithPending);
                  } catch {
                      return null;
                  }
              })()
            : null;

        let sessionCtx: SmokeSessionContext;

        if (recoverablePending) {
            const resumeOtpEvidence = await verifyRegistrationResumeOtpInbox(recoverablePending);
            crossedApplicationSubmitPending = true;
            const dotPosition =
                recoverablePending.allocationPool === 'three_dot'
                    ? recoverablePending.threeDotIndex!
                    : recoverablePending.dotPosition!;
            console.log(
                `Resuming registration pending (phase=${recoverablePending.phase}, runId=${recoverablePending.runId})`
            );
            console.log(`Using test email: ${recoverablePending.email}`);
            sessionCtx = {
                runId: recoverablePending.runId,
                statePath,
                lockPath,
                localBase,
                domain,
                allocationPool: recoverablePending.allocationPool,
                dotPosition,
                threeDotIndex:
                    recoverablePending.allocationPool === 'three_dot'
                        ? recoverablePending.threeDotIndex ?? null
                        : null,
                email: recoverablePending.email,
                resumedAfterApplicationSubmit: true,
                applicationSubmitNotBeforeEpochMs:
                    applicationSubmitNotBeforeEpochMs(recoverablePending),
                registrationResumeVerificationUrl: resumeOtpEvidence.verificationUrl,
                markApplicationSubmitPendingCrossed: () => {
                    crossedApplicationSubmitPending = true;
                },
            };
        } else {
            const state = readEmailState(statePath, localBase, domain);
            const manualThreeDotIndexRaw = process.env.EPOSE_THREE_DOT_INDEX;
            const selection = resolveRegistrationAllocation(
                state,
                manualDotPositionRaw,
                manualThreeDotIndexRaw,
                localBase.length
            );
            const dotPosition =
                selection.pool === 'single_dot' ? selection.dotPosition : selection.threeDotIndex;
            const email = buildRegistrationEmail(
                localBase,
                domain,
                selection.pool,
                dotPosition
            );

            persistPendingSelected(statePath, localBase, domain, selection, email, runId);

            console.log(
                selection.pool === 'single_dot'
                    ? `Smoke email position: ${selection.dotPosition} (${selection.source})`
                    : `Smoke three-dot index: ${selection.threeDotIndex} gaps (${selection.threeDotGaps.join(',')}) (${selection.source})`
            );
            console.log(`Using test email: ${email}`);

            sessionCtx = {
                runId,
                statePath,
                lockPath,
                localBase,
                domain,
                allocationPool: selection.pool,
                dotPosition,
                threeDotIndex: selection.pool === 'three_dot' ? selection.threeDotIndex : null,
                email,
                markApplicationSubmitPendingCrossed: () => {
                    crossedApplicationSubmitPending = true;
                },
            };
        }

        try {
            await runBody(sessionCtx);
        } catch (err) {
            if (!crossedApplicationSubmitPending) {
                clearPendingSelectedOnly(statePath, localBase, domain, sessionCtx.runId);
            }
            throw err;
        }
    } finally {
        if (lockHeld) {
            releaseExclusiveLock(lockPath, runId);
            disposeEmergencyLockRelease?.();
            disposeEmergencyLockRelease = undefined;
        }
    }
}

export type VerificationBoundaryActions = {
    persistApplicationSubmitPending: () => void;
    clickInitialApplicationSend: () => Promise<void>;
    prepareOtpVerification: () => Promise<void>;
    persistOtpSubmitted: () => void;
    clickOtpSend: () => Promise<void>;
    isAuthVerificationRejected: () => Promise<boolean>;
    waitForVerificationOutcome: () => Promise<void>;
    commitEmailConsumed: () => void;
    runAfterEmailConsumed: () => Promise<void>;
};

/**
 * Shared ordering for application submit, OTP submit, 本登録 observation, and consumption commit.
 */
export type ExecuteVerificationBoundariesOptions = {
    /** Skip initial application send when pending is already application_submit_pending. */
    resumeAfterApplicationSubmit?: boolean;
};

export async function executeVerificationBoundaries(
    actions: VerificationBoundaryActions,
    options?: ExecuteVerificationBoundariesOptions
): Promise<void> {
    if (!options?.resumeAfterApplicationSubmit) {
        actions.persistApplicationSubmitPending();
        await actions.clickInitialApplicationSend();
    }

    await actions.prepareOtpVerification();

    actions.persistOtpSubmitted();
    await actions.clickOtpSend();

    if (await actions.isAuthVerificationRejected()) {
        throw new Error(AUTH_VERIFICATION_REJECTED_MESSAGE);
    }

    await actions.waitForVerificationOutcome();
    actions.commitEmailConsumed();
    await actions.runAfterEmailConsumed();
}

export function createProductionVerificationActions(ctx: {
    statePath: string;
    localBase: string;
    domain: string;
    runId: string;
    dotPosition: number;
    markApplicationSubmitPendingCrossed: () => void;
    clickInitialApplicationSend: () => Promise<void>;
    prepareOtpVerification: () => Promise<void>;
    clickOtpSend: () => Promise<void>;
    isAuthVerificationRejected: () => Promise<boolean>;
    waitForVerificationOutcome: () => Promise<void>;
    runAfterEmailConsumed: () => Promise<void>;
}): VerificationBoundaryActions {
    const {
        statePath,
        localBase,
        domain,
        runId,
        dotPosition,
        markApplicationSubmitPendingCrossed,
        clickInitialApplicationSend,
        prepareOtpVerification,
        clickOtpSend,
        isAuthVerificationRejected,
        waitForVerificationOutcome,
        runAfterEmailConsumed,
    } = ctx;

    return {
        persistApplicationSubmitPending: () => {
            persistApplicationSubmitPending(statePath, localBase, domain, runId);
            markApplicationSubmitPendingCrossed();
        },
        clickInitialApplicationSend,
        prepareOtpVerification,
        persistOtpSubmitted: () => {
            persistOtpSubmitted(statePath, localBase, domain, runId);
        },
        clickOtpSend,
        isAuthVerificationRejected,
        waitForVerificationOutcome,
        commitEmailConsumed: () => {
            commitEmailConsumed(
                statePath,
                localBase,
                domain,
                runId,
                dotPosition
            );
        },
        runAfterEmailConsumed,
    };
}
