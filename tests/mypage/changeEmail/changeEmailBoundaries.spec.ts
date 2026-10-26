import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    finalizeChangeEmailAccountAfterSuccess,
    performChangeEmailConfirmationBoundary,
    performChangeEmailOtpRequestBoundary,
} from './changeEmailFlowBoundaries';
import {
    buildTwoDotEmailFromIndex,
    changeEmailStateFilePath,
    commitChangeEmailSuccess,
    persistConfirmationSubmitted,
    persistOtpRequestSubmitted,
    persistPendingTargetReserved,
    preflightChangeEmailAllocation,
    readChangeEmailState,
    setWriteChangeEmailStateOverride,
    writeChangeEmailStateAtomic,
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    changeEmailLockFilePath,
} from './changeEmailState';
import { buildEmail } from '../../register/emailState';

function tmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'epose-change-email-boundary-'));
}

test.describe('Change Email submission boundaries', () => {
    test.afterEach(() => {
        setWriteChangeEmailStateOverride(null);
    });

    test('failed otp_request persistence prevents submit', async () => {
        let submitted = false;
        await expect(
            performChangeEmailOtpRequestBoundary({
                persistOtpRequestSubmitted: () => {
                    throw new Error('disk full');
                },
                submitNewEmail: async () => {
                    submitted = true;
                },
            })
        ).rejects.toThrow(/disk full/);
        expect(submitted).toBe(false);
    });

    test('failed confirmation persistence prevents OTP submit', async () => {
        let submitted = false;
        await expect(
            performChangeEmailConfirmationBoundary({
                persistConfirmationSubmitted: () => {
                    throw new Error('disk full');
                },
                submitConfirmation: async () => {
                    submitted = true;
                },
            })
        ).rejects.toThrow(/disk full/);
        expect(submitted).toBe(false);
    });

    test('failed fresh-load verification prevents commit', async () => {
        let committed = false;
        await expect(
            finalizeChangeEmailAccountAfterSuccess({
                account: { email: 'a@b.com', password: 'p' },
                targetEmail: 'c@d.com',
                verifyFreshLoad: async () => {
                    throw new Error('fresh load mismatch');
                },
                commitChangeEmailSuccess: () => {
                    committed = true;
                },
            })
        ).rejects.toThrow(/fresh load mismatch/);
        expect(committed).toBe(false);
    });

    test('success returns updated account email', async () => {
        const account = await finalizeChangeEmailAccountAfterSuccess({
            account: { email: 'old@gmail.com', password: 'Passw0rd' },
            targetEmail: 'new@gmail.com',
            verifyFreshLoad: async () => undefined,
            commitChangeEmailSuccess: () => undefined,
        });
        expect(account.email).toBe('new@gmail.com');
        expect(account.password).toBe('Passw0rd');
    });

    test('commit write failure preserves pending', () => {
        const dir = tmpDir();
        const statePath = changeEmailStateFilePath(dir);
        const runId = 'run-commit-fail';
        writeChangeEmailStateAtomic(statePath, {
            schemaVersion: 1,
            localBase: CHANGE_EMAIL_LOCAL_BASE,
            domain: CHANGE_EMAIL_DOMAIN,
            nextTargetIndex: 0,
            highWaterMark: 0,
            pendingChange: null,
        });
        persistPendingTargetReserved(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
            targetIndex: 0,
            currentEmail: buildEmail(CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, 1),
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
        persistOtpRequestSubmitted(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, runId);
        persistConfirmationSubmitted(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, runId);

        setWriteChangeEmailStateOverride(() => {
            throw new Error('commit write failed');
        });
        expect(() =>
            commitChangeEmailSuccess(
                statePath,
                CHANGE_EMAIL_LOCAL_BASE,
                CHANGE_EMAIL_DOMAIN,
                runId,
                0
            )
        ).toThrow(/commit write failed/);

        setWriteChangeEmailStateOverride(null);
        const after = readChangeEmailState(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
            allowUnresolvedPending: true,
        });
        expect(after.pendingChange?.phase).toBe('confirmation_submitted');
        expect(after.nextTargetIndex).toBe(0);
    });

    test('preflight rejects missing state and existing lock without mutation', () => {
        const dir = tmpDir();
        expect(() =>
            preflightChangeEmailAllocation(dir, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN)
        ).toThrow(/state file is missing/);

        const statePath = changeEmailStateFilePath(dir);
        writeChangeEmailStateAtomic(statePath, {
            schemaVersion: 1,
            localBase: CHANGE_EMAIL_LOCAL_BASE,
            domain: CHANGE_EMAIL_DOMAIN,
            nextTargetIndex: 0,
            highWaterMark: 0,
            pendingChange: null,
        });
        preflightChangeEmailAllocation(dir, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN);

        fs.writeFileSync(changeEmailLockFilePath(dir), '{}');
        expect(() =>
            preflightChangeEmailAllocation(dir, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN)
        ).toThrow(/lock exists/);
    });
});
