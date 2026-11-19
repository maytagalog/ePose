import fs from 'node:fs';
import type { PendingVerification } from './emailState';
import {
    ensureEmailArtifactDirs,
    pathRelativeToRepo,
    registrationEmailReconciliationPath,
    copyRegistrationEmailStateBackup,
} from './emailStateStoragePaths';

export type RegistrationEmailSkipReconciliationRecord = {
    recordedAt: string;
    reason: string;
    dotPosition: number;
    dotConfirmedConsumed: boolean;
    verifiedBeforeChange: {
        runId: string;
        dotPosition: number;
    };
    preservedPendingVerification: PendingVerification;
    stateChange: {
        nextDotPosition: number;
        highWaterMark: number;
        pendingVerification: null;
        formula: string;
    };
    backupPath: string;
};

function dotConfirmedConsumedField(dotPosition: number): string {
    return `dot${dotPosition}ConfirmedConsumed`;
}

export function writeRegistrationEmailSkipReconciliationRecord(
    repoRoot: string,
    params: {
        slug: string;
        timestampLabel: string;
        recordedAt: string;
        reason: string;
        dotPosition: number;
        dotConfirmedConsumed: boolean;
        verifiedBeforeChange: RegistrationEmailSkipReconciliationRecord['verifiedBeforeChange'];
        preservedPendingVerification: PendingVerification;
        stateChange: RegistrationEmailSkipReconciliationRecord['stateChange'];
        skipExistingStateBackup?: boolean;
    }
): { recordPath: string; backupPath: string } {
    ensureEmailArtifactDirs(repoRoot);
    const backup = params.skipExistingStateBackup
        ? {
              relativePath: '',
              absolutePath: '',
          }
        : copyRegistrationEmailStateBackup(repoRoot, params.timestampLabel);

    const record: Record<string, unknown> = {
        recordedAt: params.recordedAt,
        reason: params.reason,
        [dotConfirmedConsumedField(params.dotPosition)]: params.dotConfirmedConsumed,
        verifiedBeforeChange: params.verifiedBeforeChange,
        preservedPendingVerification: params.preservedPendingVerification,
        stateChange: params.stateChange,
        backupPath: backup.relativePath,
    };

    const recordPath = registrationEmailReconciliationPath(repoRoot, params.slug);
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return {
        recordPath,
        backupPath: backup.relativePath,
    };
}

export function readRegistrationEmailSkipReconciliationRecord(
    repoRoot: string,
    slug: string
): RegistrationEmailSkipReconciliationRecord {
    const recordPath = registrationEmailReconciliationPath(repoRoot, slug);
    const raw = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as Record<string, unknown>;
    const dotPosition = Number(
        (raw.verifiedBeforeChange as { dotPosition?: number } | undefined)?.dotPosition
    );
    if (!Number.isInteger(dotPosition)) {
        throw new Error(`Invalid reconciliation record at ${recordPath}`);
    }
    const dotKey = dotConfirmedConsumedField(dotPosition);
    return {
        recordedAt: String(raw.recordedAt),
        reason: String(raw.reason),
        dotPosition,
        dotConfirmedConsumed: Boolean(raw[dotKey]),
        verifiedBeforeChange: raw.verifiedBeforeChange as RegistrationEmailSkipReconciliationRecord['verifiedBeforeChange'],
        preservedPendingVerification:
            raw.preservedPendingVerification as PendingVerification,
        stateChange: raw.stateChange as RegistrationEmailSkipReconciliationRecord['stateChange'],
        backupPath: String(raw.backupPath),
    };
}

export function registrationReconciliationRecordRelativePath(
    repoRoot: string,
    slug: string
): string {
    return pathRelativeToRepo(repoRoot, registrationEmailReconciliationPath(repoRoot, slug));
}

export type RegistrationEmailPreserveReconciliationEvidence = {
    gmailOtpAfterApplicationSubmit: boolean;
    gmailOtpInternalDate?: number;
    stagingRegistrationStatusHttp?: number;
    stagingRegistrationStatusNote?: string;
};

export type RegistrationEmailPreserveReconciliationRecord = {
    recordedAt: string;
    reason: string;
    allocationPool: PendingVerification['allocationPool'];
    threeDotIndex?: number;
    dotPosition?: number;
    preservedPendingVerification: PendingVerification;
    evidence: RegistrationEmailPreserveReconciliationEvidence;
    stateChange: 'none';
    backupPath: string;
};

/**
 * Audit trail when reconciliation preserves pending + counters (no e2e-email-state.json mutation).
 */
export function writeRegistrationEmailPreserveReconciliationRecord(
    repoRoot: string,
    params: {
        slug: string;
        timestampLabel: string;
        recordedAt: string;
        reason: string;
        preservedPendingVerification: PendingVerification;
        evidence: RegistrationEmailPreserveReconciliationEvidence;
    }
): { recordPath: string; backupPath: string } {
    ensureEmailArtifactDirs(repoRoot);
    const backup = copyRegistrationEmailStateBackup(repoRoot, params.timestampLabel);
    const pending = params.preservedPendingVerification;
    const record: RegistrationEmailPreserveReconciliationRecord = {
        recordedAt: params.recordedAt,
        reason: params.reason,
        allocationPool: pending.allocationPool,
        threeDotIndex: pending.threeDotIndex,
        dotPosition: pending.dotPosition,
        preservedPendingVerification: pending,
        evidence: params.evidence,
        stateChange: 'none',
        backupPath: backup.relativePath,
    };
    const recordPath = registrationEmailReconciliationPath(repoRoot, params.slug);
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return {
        recordPath,
        backupPath: backup.relativePath,
    };
}
