import fs from 'node:fs';
import path from 'node:path';
import { CHANGE_EMAIL_STATE_FILENAME } from '../mypage/changeEmail/changeEmailState';
import { E2E_EMAIL_STATE_FILENAME } from './emailState';

export const EMAIL_TEST_STATE_DIR_SEGMENT = path.join('test-state', 'email');
export const EMAIL_RECONCILIATION_DIR_SEGMENT = path.join(
    EMAIL_TEST_STATE_DIR_SEGMENT,
    'reconciliation'
);
export const EMAIL_STATE_BACKUPS_DIR_SEGMENT = path.join(
    EMAIL_TEST_STATE_DIR_SEGMENT,
    'backups'
);

export const REGISTRATION_EMAIL_RECONCILIATION_PREFIX = 'e2e-email-reconciliation-';
export const CHANGE_EMAIL_RECONCILIATION_PREFIX = 'e2e-change-email-reconciliation-';

const REGISTRATION_STATE_BACKUP_RE =
    /^e2e-email-state\.json\.(?:backup-.+|.+\.bak)$/;
const CHANGE_EMAIL_STATE_BACKUP_RE =
    /^e2e-change-email-state\.json\.(?:backup-.+|.+\.bak)$/;

export function emailTestStateRoot(repoRoot: string): string {
    return path.join(repoRoot, EMAIL_TEST_STATE_DIR_SEGMENT);
}

export function emailReconciliationDir(repoRoot: string): string {
    return path.join(repoRoot, EMAIL_RECONCILIATION_DIR_SEGMENT);
}

export function emailStateBackupsDir(repoRoot: string): string {
    return path.join(repoRoot, EMAIL_STATE_BACKUPS_DIR_SEGMENT);
}

export function ensureEmailArtifactDirs(repoRoot: string): {
    reconciliationDir: string;
    backupsDir: string;
} {
    const reconciliationDir = emailReconciliationDir(repoRoot);
    const backupsDir = emailStateBackupsDir(repoRoot);
    fs.mkdirSync(reconciliationDir, { recursive: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    return { reconciliationDir, backupsDir };
}

export function pathRelativeToRepo(repoRoot: string, absolutePath: string): string {
    return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

export function isRegistrationEmailStateBackupBasename(basename: string): boolean {
    return REGISTRATION_STATE_BACKUP_RE.test(basename);
}

export function isChangeEmailStateBackupBasename(basename: string): boolean {
    return CHANGE_EMAIL_STATE_BACKUP_RE.test(basename);
}

export function isEmailStateBackupBasename(basename: string): boolean {
    return (
        isRegistrationEmailStateBackupBasename(basename) ||
        isChangeEmailStateBackupBasename(basename)
    );
}

export function registrationEmailStateBackupBasename(timestampLabel: string): string {
    return `${E2E_EMAIL_STATE_FILENAME}.backup-${timestampLabel}`;
}

export function changeEmailStateBackupBasename(timestampLabel: string): string {
    return `${CHANGE_EMAIL_STATE_FILENAME}.backup-${timestampLabel}`;
}

export function registrationEmailReconciliationBasename(slug: string): string {
    const trimmed = slug.trim();
    if (!trimmed || trimmed.includes('/') || trimmed.includes('..')) {
        throw new Error(`Invalid reconciliation slug: ${slug}`);
    }
    const base = trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`;
    if (!base.startsWith(REGISTRATION_EMAIL_RECONCILIATION_PREFIX)) {
        return `${REGISTRATION_EMAIL_RECONCILIATION_PREFIX}${base}`;
    }
    return base;
}

export function changeEmailReconciliationBasename(slug: string): string {
    const trimmed = slug.trim();
    if (!trimmed || trimmed.includes('/') || trimmed.includes('..')) {
        throw new Error(`Invalid reconciliation slug: ${slug}`);
    }
    const base = trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`;
    if (!base.startsWith(CHANGE_EMAIL_RECONCILIATION_PREFIX)) {
        return `${CHANGE_EMAIL_RECONCILIATION_PREFIX}${base}`;
    }
    return base;
}

export function registrationEmailReconciliationPath(repoRoot: string, slug: string): string {
    return path.join(
        emailReconciliationDir(repoRoot),
        registrationEmailReconciliationBasename(slug)
    );
}

export function registrationEmailStateBackupPath(
    repoRoot: string,
    timestampLabel: string
): string {
    return path.join(
        emailStateBackupsDir(repoRoot),
        registrationEmailStateBackupBasename(timestampLabel)
    );
}

export function changeEmailStateBackupPath(repoRoot: string, timestampLabel: string): string {
    return path.join(
        emailStateBackupsDir(repoRoot),
        changeEmailStateBackupBasename(timestampLabel)
    );
}

/**
 * Resolve backupPath stored on reconciliation records (repo-relative).
 * Accepts legacy repo-root filenames and test-state/email/backups/ paths.
 */
export function resolveEmailStateBackupPath(repoRoot: string, backupPath: string): string {
    const normalized = backupPath.trim().replace(/\\/g, '/');
    if (!normalized) {
        throw new Error('Missing backupPath on reconciliation record.');
    }
    if (normalized.includes('..')) {
        throw new Error(`Invalid backupPath: ${backupPath}`);
    }
    const basename = path.posix.basename(normalized);
    if (!isEmailStateBackupBasename(basename)) {
        throw new Error(
            `backupPath must name an e2e-email-state or e2e-change-email-state backup file: ${backupPath}`
        );
    }
    if (normalized.startsWith(EMAIL_STATE_BACKUPS_DIR_SEGMENT + '/')) {
        return path.join(repoRoot, ...normalized.split('/'));
    }
    if (
        basename.startsWith(E2E_EMAIL_STATE_FILENAME) ||
        basename.startsWith(CHANGE_EMAIL_STATE_FILENAME)
    ) {
        const underBackups = path.join(emailStateBackupsDir(repoRoot), basename);
        if (fs.existsSync(underBackups)) {
            return underBackups;
        }
        const legacy = path.join(repoRoot, basename);
        if (fs.existsSync(legacy)) {
            return legacy;
        }
        return underBackups;
    }
    return path.join(repoRoot, ...normalized.split('/'));
}

export function copyRegistrationEmailStateBackup(
    repoRoot: string,
    timestampLabel: string
): { absolutePath: string; relativePath: string } {
    const statePath = path.join(repoRoot, E2E_EMAIL_STATE_FILENAME);
    if (!fs.existsSync(statePath)) {
        throw new Error(`Missing ${E2E_EMAIL_STATE_FILENAME} at repo root.`);
    }
    ensureEmailArtifactDirs(repoRoot);
    const absolutePath = registrationEmailStateBackupPath(repoRoot, timestampLabel);
    fs.copyFileSync(statePath, absolutePath);
    return {
        absolutePath,
        relativePath: pathRelativeToRepo(repoRoot, absolutePath),
    };
}

export function copyChangeEmailStateBackup(
    repoRoot: string,
    timestampLabel: string
): { absolutePath: string; relativePath: string } {
    const statePath = path.join(repoRoot, CHANGE_EMAIL_STATE_FILENAME);
    if (!fs.existsSync(statePath)) {
        throw new Error(`Missing ${CHANGE_EMAIL_STATE_FILENAME} at repo root.`);
    }
    ensureEmailArtifactDirs(repoRoot);
    const absolutePath = changeEmailStateBackupPath(repoRoot, timestampLabel);
    fs.copyFileSync(statePath, absolutePath);
    return {
        absolutePath,
        relativePath: pathRelativeToRepo(repoRoot, absolutePath),
    };
}

export function listRegistrationEmailReconciliationRecords(repoRoot: string): string[] {
    const dir = emailReconciliationDir(repoRoot);
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir)
        .filter(
            (name) =>
                name.startsWith(REGISTRATION_EMAIL_RECONCILIATION_PREFIX) && name.endsWith('.json')
        )
        .sort();
}
