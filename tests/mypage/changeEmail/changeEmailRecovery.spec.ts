import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    acquireChangeEmailLock,
    changeEmailLockFilePath,
    changeEmailStateFilePath,
    readChangeEmailState,
    releaseChangeEmailLock,
    writeChangeEmailStateAtomic,
    type ChangeEmailPending,
    type ChangeEmailState,
} from './changeEmailState';
import {
    assertRecoverableOtpRequestPending,
    ChangeEmailRecoveryError,
    otpRequestNotBeforeEpochMs,
} from './changeEmailRecovery';
import { runChangeEmailRecoverySession } from './changeEmailRecoveryOrchestration';
import {
    runCommitVerifiedChangeEmailSuccessSession,
    runRetireAbandonedChangeEmailTargetSession,
} from './changeEmailReconciliation';

function tmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'epose-change-email-recovery-'));
}

function baseState(overrides: Partial<ChangeEmailState> = {}): ChangeEmailState {
    return {
        schemaVersion: 1,
        localBase: 'aardvarkomonstrosesquip1230000',
        domain: 'gmail.com',
        nextTargetIndex: 0,
        highWaterMark: 0,
        pendingChange: null,
        ...overrides,
    };
}

function confirmationSubmittedPending(runId: string, targetIndex: number, targetEmail: string): ChangeEmailPending {
    return {
        targetIndex,
        currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
        targetEmail,
        phase: 'confirmation_submitted',
        runId,
        hostname: 'test-host',
        pid: 1,
        startedAt: '2026-10-23T14:24:30.460Z',
        otpRequestSubmittedAt: '2026-10-23T14:24:34.116Z',
        confirmationSubmittedAt: '2026-10-23T14:24:51.807Z',
    };
}

function otpSubmittedPending(runId: string): ChangeEmailPending {
    return {
        targetIndex: 0,
        currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
        targetEmail: 'a.ar.dvarkomonstrosesquip1230000@gmail.com',
        phase: 'otp_request_submitted',
        runId,
        hostname: 'test-host',
        pid: 1,
        startedAt: '2026-10-23T13:48:17.808Z',
        otpRequestSubmittedAt: '2026-10-23T13:48:25.507Z',
    };
}

test.describe('changeEmailRecovery', () => {
    test('assertRecoverableOtpRequestPending rejects wrong phase and email', () => {
        const state = baseState({
            pendingChange: otpSubmittedPending('run-a'),
        });
        expect(() =>
            assertRecoverableOtpRequestPending(state, 'other@example.com')
        ).toThrow(ChangeEmailRecoveryError);
        expect(assertRecoverableOtpRequestPending(state, state.pendingChange!.currentEmail)).toBe(
            state.pendingChange
        );
    });

    test('otpRequestNotBeforeEpochMs uses pending otpRequestSubmittedAt', () => {
        const pending = otpSubmittedPending('run-a');
        expect(otpRequestNotBeforeEpochMs(pending)).toBe(
            Date.parse('2026-10-23T13:48:25.507Z')
        );
    });

    test('recovery session revalidates pending and commits with original runId', async () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const lockPath = changeEmailLockFilePath(dir);
        const runId = '7fe66021-c729-4b31-bd6f-40fcd5f30488';
        writeChangeEmailStateAtomic(
            statePath,
            baseState({ pendingChange: otpSubmittedPending(runId) })
        );

        let sawPersistConfirm = false;
        await runChangeEmailRecoverySession({
            repoRoot: dir,
            localBase: 'aardvarkomonstrosesquip1230000',
            domain: 'gmail.com',
            currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
            runBody: async (ctx) => {
                expect(ctx.runId).toBe(runId);
                expect(ctx.targetIndex).toBe(0);
                expect(() => ctx.persistOtpRequestSubmitted()).toThrow(/must not persist otp_request/);
                ctx.persistConfirmationSubmitted();
                sawPersistConfirm = true;
                ctx.commitChangeEmailSuccess();
            },
        });

        expect(sawPersistConfirm).toBe(true);
        expect(fs.existsSync(lockPath)).toBe(false);
        const after = readChangeEmailState(statePath, 'aardvarkomonstrosesquip1230000', 'gmail.com', {
            allowUnresolvedPending: true,
        });
        expect(after.pendingChange).toBeNull();
        expect(after.nextTargetIndex).toBe(1);
        expect(after.highWaterMark).toBe(1);
    });

    test('recovery session preserves pending when runBody throws before commit', async () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const runId = 'pending-run';
        writeChangeEmailStateAtomic(
            statePath,
            baseState({ pendingChange: otpSubmittedPending(runId) })
        );

        await expect(
            runChangeEmailRecoverySession({
                repoRoot: dir,
                localBase: 'aardvarkomonstrosesquip1230000',
                domain: 'gmail.com',
                currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
                runBody: async () => {
                    throw new Error('simulated OTP failure');
                },
            })
        ).rejects.toThrow(/simulated OTP failure/);

        const after = readChangeEmailState(statePath, 'aardvarkomonstrosesquip1230000', 'gmail.com', {
            allowUnresolvedPending: true,
        });
        expect(after.pendingChange?.phase).toBe('otp_request_submitted');
        expect(after.nextTargetIndex).toBe(0);
    });

    test('retire abandoned pending advances counters without commit path', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const runId = 'abandoned-run';
        writeChangeEmailStateAtomic(
            statePath,
            baseState({ pendingChange: otpSubmittedPending(runId) })
        );
        const result = runRetireAbandonedChangeEmailTargetSession({
            repoRoot: dir,
            localBase: 'aardvarkomonstrosesquip1230000',
            domain: 'gmail.com',
            expected: {
                targetIndex: 0,
                currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
                targetEmail: 'a.ar.dvarkomonstrosesquip1230000@gmail.com',
            },
        });
        expect(result.newNext).toBe(1);
        expect(result.retiredTargetIndex).toBe(0);
        const after = readChangeEmailState(statePath, 'aardvarkomonstrosesquip1230000', 'gmail.com', {
            allowUnresolvedPending: true,
        });
        expect(after.pendingChange).toBeNull();
        expect(after.nextTargetIndex).toBe(1);
        expect(after.highWaterMark).toBe(1);
    });

    test('commit verified success pending uses production commit helper', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const runId = 'success-run';
        writeChangeEmailStateAtomic(
            statePath,
            baseState({
                nextTargetIndex: 1,
                highWaterMark: 1,
                pendingChange: confirmationSubmittedPending(
                    runId,
                    1,
                    'a.ard.varkomonstrosesquip1230000@gmail.com'
                ),
            })
        );
        const result = runCommitVerifiedChangeEmailSuccessSession({
            repoRoot: dir,
            localBase: 'aardvarkomonstrosesquip1230000',
            domain: 'gmail.com',
            expected: {
                targetIndex: 1,
                currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
                targetEmail: 'a.ard.varkomonstrosesquip1230000@gmail.com',
            },
        });
        expect(result.committedTargetIndex).toBe(1);
        expect(result.newNext).toBe(2);
        expect(result.pendingRunId).toBe(runId);
        const after = readChangeEmailState(statePath, 'aardvarkomonstrosesquip1230000', 'gmail.com', {
            allowUnresolvedPending: true,
        });
        expect(after.pendingChange).toBeNull();
        expect(after.nextTargetIndex).toBe(2);
        expect(after.highWaterMark).toBe(2);
    });

    test('recovery refuses when lock already held', async () => {
        const dir = tmpDir();
        const lockPath = changeEmailLockFilePath(dir);
        const statePath = changeEmailStateFilePath(dir);
        writeChangeEmailStateAtomic(
            statePath,
            baseState({ pendingChange: otpSubmittedPending('run-a') })
        );
        acquireChangeEmailLock(lockPath, {
            runId: 'other-lock',
            pid: 1,
            hostname: 'x',
            acquiredAt: new Date().toISOString(),
        });
        try {
            await expect(
                runChangeEmailRecoverySession({
                    repoRoot: dir,
                    localBase: 'aardvarkomonstrosesquip1230000',
                    domain: 'gmail.com',
                    currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
                    runBody: async () => {},
                })
            ).rejects.toThrow(/Cannot acquire/);
        } finally {
            releaseChangeEmailLock(lockPath, 'other-lock');
        }
    });
});
