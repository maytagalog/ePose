import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHANGE_EMAIL_STATE_FILENAME } from '../mypage/changeEmail/changeEmailState';
import {
    DEFAULT_DOMAIN,
    DEFAULT_LOCAL_BASE,
    E2E_EMAIL_STATE_FILENAME,
    writeEmailStateAtomic,
    type EmailState,
} from './emailState';
import {
    copyRegistrationEmailStateBackup,
    emailReconciliationDir,
    emailStateBackupsDir,
    isChangeEmailStateBackupBasename,
    isRegistrationEmailStateBackupBasename,
    pathRelativeToRepo,
    registrationEmailReconciliationBasename,
    registrationEmailReconciliationPath,
    resolveEmailStateBackupPath,
} from './emailStateStoragePaths';
import {
    readRegistrationEmailSkipReconciliationRecord,
    writeRegistrationEmailSkipReconciliationRecord,
} from './emailStateReconciliation';

function sha256File(filePath: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function initRepo(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'epose-email-artifacts-'));
}

function writeMinimalState(repoRoot: string): void {
    const state: EmailState = {
        schemaVersion: 3,
        localBase: DEFAULT_LOCAL_BASE,
        domain: DEFAULT_DOMAIN,
        nextDotPosition: 3,
        highWaterMark: 3,
        allocationPool: 'single_dot',
        nextThreeDotIndex: 0,
        threeDotHighWaterMark: 0,
        pendingVerification: null,
    };
    writeEmailStateAtomic(path.join(repoRoot, E2E_EMAIL_STATE_FILENAME), state);
}

test.describe('email state artifact paths', () => {
    test('backup and reconciliation land under test-state/email/', () => {
        const repoRoot = initRepo();
        writeMinimalState(repoRoot);
        const { relativePath, absolutePath } = copyRegistrationEmailStateBackup(
            repoRoot,
            '2026-11-14T0200+0800'
        );
        expect(relativePath).toBe(
            'test-state/email/backups/e2e-email-state.json.backup-2026-11-14T0200+0800'
        );
        expect(fs.existsSync(absolutePath)).toBe(true);
        expect(absolutePath).toBe(
            path.join(emailStateBackupsDir(repoRoot), 'e2e-email-state.json.backup-2026-11-14T0200+0800')
        );

        const pending = {
            allocationPool: 'single_dot' as const,
            dotPosition: 4,
            email: 'x@example.com',
            phase: 'selected' as const,
            runId: 'run-a',
            hostname: 'host',
            pid: 1,
            startedAt: new Date().toISOString(),
        };
        const { recordPath, backupPath } = writeRegistrationEmailSkipReconciliationRecord(repoRoot, {
            slug: '2026-11-14-dot4-skip',
            timestampLabel: '2026-11-14T0201+0800',
            recordedAt: '2026-11-14T02:01:00+08:00',
            reason: 'fixture skip',
            dotPosition: 4,
            dotConfirmedConsumed: false,
            verifiedBeforeChange: { runId: 'run-a', dotPosition: 4 },
            preservedPendingVerification: pending,
            stateChange: {
                nextDotPosition: 5,
                highWaterMark: 5,
                pendingVerification: null,
                formula: 'Math.max(4, 4, 5)',
            },
            skipExistingStateBackup: true,
        });
        void backupPath;
        expect(recordPath).toBe(
            path.join(
                emailReconciliationDir(repoRoot),
                registrationEmailReconciliationBasename('2026-11-14-dot4-skip')
            )
        );
        const reread = readRegistrationEmailSkipReconciliationRecord(repoRoot, '2026-11-14-dot4-skip');
        expect(reread.dotPosition).toBe(4);
        expect(reread.preservedPendingVerification.runId).toBe('run-a');
    });

    test('resolveEmailStateBackupPath prefers test-state and supports legacy basename', () => {
        const repoRoot = initRepo();
        writeMinimalState(repoRoot);
        const { absolutePath } = copyRegistrationEmailStateBackup(repoRoot, 'legacy-ts');
        const legacyPath = path.join(repoRoot, path.basename(absolutePath));
        fs.copyFileSync(absolutePath, legacyPath);
        fs.unlinkSync(absolutePath);

        const resolved = resolveEmailStateBackupPath(
            repoRoot,
            path.basename(legacyPath)
        );
        expect(resolved).toBe(legacyPath);

        fs.renameSync(legacyPath, absolutePath);
        const resolvedMoved = resolveEmailStateBackupPath(
            repoRoot,
            pathRelativeToRepo(repoRoot, absolutePath)
        );
        expect(resolvedMoved).toBe(absolutePath);
    });

    test('backup basename guards reject unrelated backup names', () => {
        expect(isRegistrationEmailStateBackupBasename('e2e-email-state.json.backup-2026-10-28T1404+0800')).toBe(
            true
        );
        expect(isRegistrationEmailStateBackupBasename('e2e-email-state.json.manual.bak')).toBe(true);
        expect(isRegistrationEmailStateBackupBasename('token.json.bak')).toBe(false);
        expect(isChangeEmailStateBackupBasename('e2e-change-email-state.json.backup-x')).toBe(true);
        expect(isRegistrationEmailStateBackupBasename(CHANGE_EMAIL_STATE_FILENAME)).toBe(false);
    });

    test('reconciliation path rejects traversal slug', () => {
        const repoRoot = initRepo();
        expect(() => registrationEmailReconciliationPath(repoRoot, '../escape')).toThrow(
            /Invalid reconciliation slug/
        );
    });

    test('backup copy preserves content hash', () => {
        const repoRoot = initRepo();
        writeMinimalState(repoRoot);
        const statePath = path.join(repoRoot, E2E_EMAIL_STATE_FILENAME);
        const before = sha256File(statePath);
        const { absolutePath } = copyRegistrationEmailStateBackup(repoRoot, 'hash-check');
        expect(sha256File(absolutePath)).toBe(before);
    });
});
