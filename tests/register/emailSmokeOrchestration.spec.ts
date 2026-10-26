import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    DEFAULT_DOMAIN,
    DEFAULT_LOCAL_BASE,
    acquireExclusiveLock,
    buildEmail,
    lockFilePath,
    persistApplicationSubmitPending,
    persistPendingSelected,
    readEmailState,
    releaseExclusiveLock,
    setWriteEmailStateAtomicOverride,
    stateFilePath,
    writeEmailStateAtomic,
    type EmailState,
} from './emailState';
import {
    AUTH_VERIFICATION_REJECTED_MESSAGE,
    executeVerificationBoundaries,
    registerEmergencyLockRelease,
    runSmokeEmailStateSession,
} from './emailSmokeOrchestration';

function makeBaseState(overrides: Partial<EmailState> = {}): EmailState {
    return {
        schemaVersion: 2,
        localBase: DEFAULT_LOCAL_BASE,
        domain: DEFAULT_DOMAIN,
        nextDotPosition: 0,
        highWaterMark: 0,
        pendingVerification: null,
        ...overrides,
    };
}

function initDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'epose-smoke-orch-'));
}

test.describe('email smoke orchestration', () => {
    test.afterEach(() => {
        setWriteEmailStateAtomicOverride(null);
    });

    test('failure before application boundary clears selected only', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);

        writeEmailStateAtomic(statePath, makeBaseState());

        await expect(
            runSmokeEmailStateSession({
                repoRoot: dir,
                localBase: DEFAULT_LOCAL_BASE,
                domain: DEFAULT_DOMAIN,
                manualDotPositionRaw: undefined,
                runBody: async () => {
                    throw new Error('simulated pre-submit failure');
                },
            })
        ).rejects.toThrow(/simulated pre-submit failure/);

        const state = readEmailState(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN
        );
        expect(state.pendingVerification).toBeNull();
        expect(fs.existsSync(lockFilePath(dir))).toBe(false);
    });

    test('application_submit_pending persist failure prevents initial Send click', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-fail-app';
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            0,
            buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0),
            runId
        );

        setWriteEmailStateAtomicOverride(() => {
            throw new Error('injected application_submit_pending write failure');
        });

        let sendClicked = false;

        await expect(
            executeVerificationBoundaries({
                persistApplicationSubmitPending: () => {
                    persistApplicationSubmitPending(
                        statePath,
                        DEFAULT_LOCAL_BASE,
                        DEFAULT_DOMAIN,
                        runId
                    );
                },
                clickInitialApplicationSend: async () => {
                    sendClicked = true;
                },
                prepareOtpVerification: async () => {},
                persistOtpSubmitted: () => {},
                clickOtpSend: async () => {},
                isAuthVerificationRejected: async () => false,
                waitForVerificationOutcome: async () => {},
                commitEmailConsumed: () => {},
                runAfterEmailConsumed: async () => {},
            })
        ).rejects.toThrow(/injected application_submit_pending write failure/);

        expect(sendClicked).toBe(false);

        const pending = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, {
            allowUnresolvedPending: true,
        }).pendingVerification;
        expect(pending?.phase).toBe('selected');
    });

    test('after application_submit_pending simulated crash blocks next startup', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-crash-after-app';
        const email = buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0);
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            0,
            email,
            runId
        );
        persistApplicationSubmitPending(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );

        expect(() =>
            readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN)
        ).toThrow(/Unresolved pending verification/);
    });

    test('otp_submitted persist failure prevents OTP Send click', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-otp-write-fail';
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            0,
            buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0),
            runId
        );
        persistApplicationSubmitPending(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );

        const { persistOtpSubmitted } = await import('./emailState');

        setWriteEmailStateAtomicOverride(() => {
            throw new Error('injected otp_submitted write failure');
        });

        let otpClicked = false;

        await expect(
            executeVerificationBoundaries({
                persistApplicationSubmitPending: () => {},
                clickInitialApplicationSend: async () => {},
                prepareOtpVerification: async () => {},
                persistOtpSubmitted: () => {
                    persistOtpSubmitted(
                        statePath,
                        DEFAULT_LOCAL_BASE,
                        DEFAULT_DOMAIN,
                        runId
                    );
                },
                clickOtpSend: async () => {
                    otpClicked = true;
                },
                isAuthVerificationRejected: async () => false,
                waitForVerificationOutcome: async () => {},
                commitEmailConsumed: () => {},
                runAfterEmailConsumed: async () => {},
            })
        ).rejects.toThrow(/injected otp_submitted write failure/);

        expect(otpClicked).toBe(false);

        const pending = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, {
            allowUnresolvedPending: true,
        }).pendingVerification;
        expect(pending?.phase).toBe('application_submit_pending');
    });

    test('auth rejection and URL timeout preserve blocking pending', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-auth-timeout';
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            0,
            buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0),
            runId
        );
        persistApplicationSubmitPending(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );

        const { persistOtpSubmitted } = await import('./emailState');
        persistOtpSubmitted(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, runId);

        await expect(
            executeVerificationBoundaries({
                persistApplicationSubmitPending: () => {},
                clickInitialApplicationSend: async () => {},
                prepareOtpVerification: async () => {},
                persistOtpSubmitted: () => {},
                clickOtpSend: async () => {},
                isAuthVerificationRejected: async () => true,
                waitForVerificationOutcome: async () => {},
                commitEmailConsumed: () => {},
                runAfterEmailConsumed: async () => {},
            })
        ).rejects.toThrow(AUTH_VERIFICATION_REJECTED_MESSAGE);

        let pending = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, {
            allowUnresolvedPending: true,
        }).pendingVerification;
        expect(pending?.phase).toBe('otp_submitted');

        await expect(
            executeVerificationBoundaries({
                persistApplicationSubmitPending: () => {},
                clickInitialApplicationSend: async () => {},
                prepareOtpVerification: async () => {},
                persistOtpSubmitted: () => {},
                clickOtpSend: async () => {},
                isAuthVerificationRejected: async () => false,
                waitForVerificationOutcome: async () => {
                    throw new Error('simulated URL timeout');
                },
                commitEmailConsumed: () => {},
                runAfterEmailConsumed: async () => {},
            })
        ).rejects.toThrow(/simulated URL timeout/);

        pending = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, {
            allowUnresolvedPending: true,
        }).pendingVerification;
        expect(pending?.phase).toBe('otp_submitted');
    });

    test('successful complete commits and post-consumption failure does not roll back', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(
            statePath,
            makeBaseState({ nextDotPosition: 2, highWaterMark: 2 })
        );

        const runId = 'run-success-then-fail';
        const dotPosition = 2;
        const { commitEmailConsumed, persistOtpSubmitted } = await import(
            './emailState'
        );

        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            dotPosition,
            buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, dotPosition),
            runId
        );
        persistApplicationSubmitPending(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );
        persistOtpSubmitted(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, runId);

        let afterConsumedRan = false;

        await expect(
            executeVerificationBoundaries({
                persistApplicationSubmitPending: () => {},
                clickInitialApplicationSend: async () => {},
                prepareOtpVerification: async () => {},
                persistOtpSubmitted: () => {},
                clickOtpSend: async () => {},
                isAuthVerificationRejected: async () => false,
                waitForVerificationOutcome: async () => {},
                commitEmailConsumed: () => {
                    commitEmailConsumed(
                        statePath,
                        DEFAULT_LOCAL_BASE,
                        DEFAULT_DOMAIN,
                        runId,
                        dotPosition
                    );
                },
                runAfterEmailConsumed: async () => {
                    afterConsumedRan = true;
                    throw new Error('simulated booking failure');
                },
            })
        ).rejects.toThrow(/simulated booking failure/);

        expect(afterConsumedRan).toBe(true);

        const state = readEmailState(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN
        );
        expect(state.nextDotPosition).toBe(3);
        expect(state.highWaterMark).toBe(3);
        expect(state.pendingVerification).toBeNull();
    });

    test('consumption write failure blocks next startup and preserves prior pending', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-commit-fail';
        const dotPosition = 0;
        const { persistOtpSubmitted, commitEmailConsumed } = await import(
            './emailState'
        );

        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            dotPosition,
            buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, dotPosition),
            runId
        );
        persistApplicationSubmitPending(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );
        persistOtpSubmitted(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, runId);

        const before = fs.readFileSync(statePath, 'utf8');

        setWriteEmailStateAtomicOverride(() => {
            throw new Error('injected consumption write failure');
        });

        expect(() =>
            commitEmailConsumed(
                statePath,
                DEFAULT_LOCAL_BASE,
                DEFAULT_DOMAIN,
                runId,
                dotPosition
            )
        ).toThrow(/injected consumption write failure/);

        expect(fs.readFileSync(statePath, 'utf8')).toBe(before);

        expect(() =>
            readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN)
        ).toThrow(/Unresolved pending verification/);
    });
});

test.describe('registerEmergencyLockRelease', () => {
    function lockMetadata(runId: string) {
        return {
            runId,
            pid: process.pid,
            hostname: os.hostname(),
            acquiredAt: new Date().toISOString(),
        };
    }

    test('dispose removes termination listeners while session continues', () => {
        const dir = initDir();
        const lockPath = lockFilePath(dir);
        const runId = 'dispose-listeners-run';
        acquireExclusiveLock(lockPath, lockMetadata(runId));

        const beforeSigterm = process.listenerCount('SIGTERM');
        const beforeExit = process.listenerCount('exit');

        const dispose = registerEmergencyLockRelease(lockPath, runId, {
            killProcess: () => {},
        });

        expect(process.listenerCount('SIGTERM')).toBe(beforeSigterm + 1);
        expect(process.listenerCount('exit')).toBe(beforeExit + 1);

        dispose();

        expect(process.listenerCount('SIGTERM')).toBe(beforeSigterm);
        expect(process.listenerCount('exit')).toBe(beforeExit);
        expect(fs.existsSync(lockPath)).toBe(true);

        process.emit('SIGTERM');
        expect(fs.existsSync(lockPath)).toBe(true);

        releaseExclusiveLock(lockPath, runId);
    });

    test('synthetic SIGTERM releases owned lock then re-dispatches signal', () => {
        const dir = initDir();
        const lockPath = lockFilePath(dir);
        const runId = 'sigterm-release-run';
        acquireExclusiveLock(lockPath, lockMetadata(runId));

        const kills: Array<{ pid: number; signal: NodeJS.Signals }> = [];
        const dispose = registerEmergencyLockRelease(lockPath, runId, {
            killProcess: (pid, signal) => {
                kills.push({ pid, signal });
            },
        });

        process.emit('SIGTERM');

        expect(fs.existsSync(lockPath)).toBe(false);
        expect(kills).toEqual([{ pid: process.pid, signal: 'SIGTERM' }]);

        dispose();
    });

    test('successful smoke session does not leave emergency listeners attached', async () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const beforeSigterm = process.listenerCount('SIGTERM');
        const beforeExit = process.listenerCount('exit');

        await runSmokeEmailStateSession({
            repoRoot: dir,
            localBase: DEFAULT_LOCAL_BASE,
            domain: DEFAULT_DOMAIN,
            manualDotPositionRaw: undefined,
            runBody: async () => {},
        });

        expect(process.listenerCount('SIGTERM')).toBe(beforeSigterm);
        expect(process.listenerCount('exit')).toBe(beforeExit);
        expect(fs.existsSync(lockFilePath(dir))).toBe(false);
    });
});
