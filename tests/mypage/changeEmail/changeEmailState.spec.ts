import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    acquireChangeEmailLock,
    buildTwoDotEmailFromIndex,
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    changeEmailLockFilePath,
    changeEmailStateFilePath,
    commitChangeEmailSuccess,
    enumerateTwoDotPairs,
    isRegistrationPoolEmail,
    persistConfirmationSubmitted,
    persistOtpRequestSubmitted,
    persistPendingTargetReserved,
    readChangeEmailState,
    releaseChangeEmailLock,
    setWriteChangeEmailStateOverride,
    twoDotPoolSize,
    writeChangeEmailStateAtomic,
    type ChangeEmailState,
} from './changeEmailState';
import { buildEmail } from '../../register/emailState';

function tmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'epose-change-email-'));
}

function baseState(overrides: Partial<ChangeEmailState> = {}): ChangeEmailState {
    return {
        schemaVersion: 1,
        localBase: CHANGE_EMAIL_LOCAL_BASE,
        domain: CHANGE_EMAIL_DOMAIN,
        nextTargetIndex: 0,
        highWaterMark: 0,
        pendingChange: null,
        ...overrides,
    };
}

test.describe('changeEmailState two-dot pool', () => {
    test.afterEach(() => {
        setWriteChangeEmailStateOverride(null);
    });

    test('deterministic pairs and pool size', () => {
        const pairs = enumerateTwoDotPairs(CHANGE_EMAIL_LOCAL_BASE.length);
        expect(pairs.length).toBe(twoDotPoolSize(CHANGE_EMAIL_LOCAL_BASE));
        expect(pairs[0]).toEqual([1, 3]);
        expect(pairs[1]).toEqual([1, 4]);
        const index0 = buildTwoDotEmailFromIndex(
            CHANGE_EMAIL_LOCAL_BASE,
            CHANGE_EMAIL_DOMAIN,
            0
        );
        const localPart = index0.split('@')[0] ?? '';
        expect((localPart.match(/\./g) ?? []).length).toBe(2);
        expect(index0.endsWith(`@${CHANGE_EMAIL_DOMAIN}`)).toBe(true);
    });

    test('two-dot targets are outside registration undotted/single-dot pool', () => {
        const target = buildTwoDotEmailFromIndex(
            CHANGE_EMAIL_LOCAL_BASE,
            CHANGE_EMAIL_DOMAIN,
            0
        );
        expect(
            isRegistrationPoolEmail(
                CHANGE_EMAIL_LOCAL_BASE,
                CHANGE_EMAIL_DOMAIN,
                target
            )
        ).toBe(false);
        expect(
            isRegistrationPoolEmail(
                CHANGE_EMAIL_LOCAL_BASE,
                CHANGE_EMAIL_DOMAIN,
                buildEmail(CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, 2)
            )
        ).toBe(true);
    });

    test('missing state fails closed', () => {
        const dir = tmpDir();
        expect(() =>
            readChangeEmailState(
                changeEmailStateFilePath(dir),
                CHANGE_EMAIL_LOCAL_BASE,
                CHANGE_EMAIL_DOMAIN
            )
        ).toThrow(/state file is missing/);
    });

    test('unresolved pending blocks new run', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        writeChangeEmailStateAtomic(
            statePath,
            baseState({
                pendingChange: {
                    targetIndex: 0,
                    currentEmail: 'a@b.com',
                    targetEmail: buildTwoDotEmailFromIndex(
                        CHANGE_EMAIL_LOCAL_BASE,
                        CHANGE_EMAIL_DOMAIN,
                        0
                    ),
                    phase: 'otp_request_submitted',
                    runId: 'run-1',
                    hostname: 'h',
                    pid: 1,
                    startedAt: new Date().toISOString(),
                    otpRequestSubmittedAt: new Date().toISOString(),
                },
            })
        );
        expect(() =>
            readChangeEmailState(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN)
        ).toThrow(/Unresolved Change Email pending/);
    });

    test('lock exclusivity', () => {
        const dir = tmpDir();
        const lockPath = changeEmailLockFilePath(dir);
        acquireChangeEmailLock(lockPath, {
            runId: 'a',
            pid: 1,
            hostname: 'h',
            acquiredAt: new Date().toISOString(),
        });
        expect(() =>
            acquireChangeEmailLock(lockPath, {
                runId: 'b',
                pid: 2,
                hostname: 'h',
                acquiredAt: new Date().toISOString(),
            })
        ).toThrow(/Cannot acquire/);
        releaseChangeEmailLock(lockPath, 'a');
    });

    test('write failure prevents pending reservation path', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        writeChangeEmailStateAtomic(statePath, baseState());
        setWriteChangeEmailStateOverride(() => {
            throw new Error('disk full');
        });
        expect(() =>
            persistPendingTargetReserved(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
                targetIndex: 0,
                currentEmail: buildEmail(CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, 1),
                targetEmail: buildTwoDotEmailFromIndex(
                    CHANGE_EMAIL_LOCAL_BASE,
                    CHANGE_EMAIL_DOMAIN,
                    0
                ),
                phase: 'target_reserved',
                runId: 'run-x',
                hostname: 'h',
                pid: 1,
                startedAt: new Date().toISOString(),
            })
        ).toThrow(/disk full/);
    });

    test('successful commit advances index and clears pending', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const runId = 'run-commit';
        const targetIndex = 0;
        writeChangeEmailStateAtomic(statePath, baseState());
        persistPendingTargetReserved(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
            targetIndex,
            currentEmail: buildEmail(CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, 1),
            targetEmail: buildTwoDotEmailFromIndex(
                CHANGE_EMAIL_LOCAL_BASE,
                CHANGE_EMAIL_DOMAIN,
                targetIndex
            ),
            phase: 'target_reserved',
            runId,
            hostname: 'h',
            pid: 1,
            startedAt: new Date().toISOString(),
        });
        persistOtpRequestSubmitted(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, runId);
        persistConfirmationSubmitted(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, runId);
        commitChangeEmailSuccess(
            statePath,
            CHANGE_EMAIL_LOCAL_BASE,
            CHANGE_EMAIL_DOMAIN,
            runId,
            targetIndex
        );
        const after = readChangeEmailState(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
            allowUnresolvedPending: true,
        });
        expect(after.nextTargetIndex).toBe(1);
        expect(after.highWaterMark).toBe(1);
        expect(after.pendingChange).toBeNull();
    });

    test('pending validation rejects currentEmail equal to targetEmail', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const target = buildTwoDotEmailFromIndex(
            CHANGE_EMAIL_LOCAL_BASE,
            CHANGE_EMAIL_DOMAIN,
            0
        );
        fs.writeFileSync(
            statePath,
            JSON.stringify({
                ...baseState(),
                pendingChange: {
                    targetIndex: 0,
                    currentEmail: target,
                    targetEmail: target,
                    phase: 'target_reserved',
                    runId: 'run-bad',
                    hostname: 'h',
                    pid: 1,
                    startedAt: new Date().toISOString(),
                },
            })
        );
        expect(() =>
            readChangeEmailState(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
                allowUnresolvedPending: true,
            })
        ).toThrow(/must differ/);
    });

    test('commit without confirmation_submitted pending fails', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const runId = 'run-bad';
        writeChangeEmailStateAtomic(statePath, baseState());
        persistPendingTargetReserved(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
            targetIndex: 0,
            currentEmail: 'a@b.com',
            targetEmail: buildTwoDotEmailFromIndex(
                CHANGE_EMAIL_LOCAL_BASE,
                CHANGE_EMAIL_DOMAIN,
                0
            ),
            phase: 'target_reserved',
            runId,
            hostname: 'h',
            pid: 1,
            startedAt: new Date().toISOString(),
        });
        expect(() =>
            commitChangeEmailSuccess(
                statePath,
                CHANGE_EMAIL_LOCAL_BASE,
                CHANGE_EMAIL_DOMAIN,
                runId,
                0
            )
        ).toThrow(/confirmation_submitted/);
    });
});
