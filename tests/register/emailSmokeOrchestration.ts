import os from 'node:os';
import {
    acquireExclusiveLock,
    buildEmail,
    clearPendingSelectedOnly,
    commitEmailConsumed,
    createRunId,
    lockFilePath,
    persistApplicationSubmitPending,
    persistOtpSubmitted,
    persistPendingSelected,
    readEmailState,
    releaseExclusiveLock,
    resolveDotPosition,
    stateFilePath,
} from './emailState';

export const AUTH_VERIFICATION_REJECTED_MESSAGE =
    'Email verification rejected (認証に失敗しました). Smoke failed; pending preserved for reconciliation.';

export type SmokeSessionContext = {
    runId: string;
    statePath: string;
    lockPath: string;
    localBase: string;
    domain: string;
    dotPosition: number;
    email: string;
    markApplicationSubmitPendingCrossed: () => void;
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

        const state = readEmailState(statePath, localBase, domain);
        const selection = resolveDotPosition(
            state,
            manualDotPositionRaw,
            localBase.length
        );
        const dotPosition = selection.dotPosition;
        const email = buildEmail(localBase, domain, dotPosition);

        persistPendingSelected(
            statePath,
            localBase,
            domain,
            dotPosition,
            email,
            runId
        );

        console.log(
            `Smoke email position: ${dotPosition} (${selection.source})`
        );
        console.log(`Using test email: ${email}`);

        try {
            await runBody({
                runId,
                statePath,
                lockPath,
                localBase,
                domain,
                dotPosition,
                email,
                markApplicationSubmitPendingCrossed: () => {
                    crossedApplicationSubmitPending = true;
                },
            });
        } catch (err) {
            if (!crossedApplicationSubmitPending) {
                clearPendingSelectedOnly(
                    statePath,
                    localBase,
                    domain,
                    runId
                );
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
export async function executeVerificationBoundaries(
    actions: VerificationBoundaryActions
): Promise<void> {
    actions.persistApplicationSubmitPending();
    await actions.clickInitialApplicationSend();

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
