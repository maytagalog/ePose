import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
    assertThreeDotIndexAvailable,
    buildThreeDotEmailFromIndex,
    threeDotGapsAtIndex,
    threeDotPoolSize,
    type ThreeDotGaps,
} from './emailStateThreeDotPool';
import {
    copyRegistrationEmailStateBackup,
    ensureEmailArtifactDirs,
} from './emailStateStoragePaths';

export const SUPPORTED_SCHEMA_VERSION = 3;
export const LEGACY_SCHEMA_VERSION = 2;
export const E2E_EMAIL_STATE_FILENAME = 'e2e-email-state.json';
export const E2E_EMAIL_LOCK_FILENAME = 'e2e-email.lock';

export const DEFAULT_LOCAL_BASE = 'aardvarkomonstrosesquip1230000';
export const DEFAULT_DOMAIN = 'gmail.com';

export type RegistrationAllocationPool = 'single_dot' | 'three_dot';

export type PendingPhase =
    | 'selected'
    | 'application_submit_pending'
    | 'otp_submitted';

export type PendingVerification = {
    allocationPool: RegistrationAllocationPool;
    dotPosition?: number;
    threeDotIndex?: number;
    threeDotGaps?: ThreeDotGaps;
    email: string;
    phase: PendingPhase;
    runId: string;
    hostname: string;
    pid: number;
    startedAt: string;
    applicationSubmitAttemptedAt?: string;
    otpSubmittedAt?: string;
};

export type EmailState = {
    schemaVersion: typeof SUPPORTED_SCHEMA_VERSION;
    localBase: string;
    domain: string;
    nextDotPosition: number;
    highWaterMark: number;
    allocationPool: RegistrationAllocationPool;
    nextThreeDotIndex: number;
    threeDotHighWaterMark: number;
    pendingVerification: PendingVerification | null;
};

export type LockMetadata = {
    runId: string;
    pid: number;
    hostname: string;
    acquiredAt: string;
    dotPosition?: number;
    email?: string;
};

export function stateFilePath(repoRoot: string): string {
    return path.join(repoRoot, E2E_EMAIL_STATE_FILENAME);
}

export function lockFilePath(repoRoot: string): string {
    return path.join(repoRoot, E2E_EMAIL_LOCK_FILENAME);
}

export function emailWithDotAt(local: string, position: number): string {
    if (
        !Number.isInteger(position) ||
        position < 0 ||
        position > local.length - 1
    ) {
        throw new Error(
            `Dot position must be a whole number from 0 to ${local.length - 1}. Got: ${position}`
        );
    }

    if (position === 0) {
        return local;
    }

    return `${local.slice(0, position)}.${local.slice(position)}`;
}

export function buildEmail(
    localBase: string,
    domain: string,
    dotPosition: number
): string {
    return `${emailWithDotAt(localBase, dotPosition)}@${domain}`;
}

function parseIsoDate(value: string, label: string): number {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
        throw new Error(`Invalid email-state file: ${label} is not a valid ISO-8601 date`);
    }
    return ms;
}

function assertCounterInRange(value: unknown, label: string, localBaseLength: number): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(
            `Invalid email-state file: ${label} must be an integer`
        );
    }
    if (value < 0 || value > localBaseLength) {
        throw new Error(
            `Invalid email-state file: ${label} ${value} out of range (0 to ${localBaseLength})`
        );
    }
    return value;
}

function assertThreeDotCounterInRange(
    value: unknown,
    label: string,
    localBaseLength: number
): number {
    const poolSize = threeDotPoolSize(localBaseLength);
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`Invalid email-state file: ${label} must be an integer`);
    }
    if (value < 0 || value > poolSize) {
        throw new Error(
            `Invalid email-state file: ${label} ${value} out of range (0 to ${poolSize})`
        );
    }
    return value;
}

function normalizeAllocationPool(value: unknown, legacySingleDotExhausted: boolean): RegistrationAllocationPool {
    if (value === 'three_dot') {
        return 'three_dot';
    }
    if (value === 'single_dot' || value === undefined) {
        return legacySingleDotExhausted ? 'three_dot' : 'single_dot';
    }
    throw new Error(`Invalid email-state file: allocationPool must be single_dot or three_dot (got ${String(value)})`);
}

export function buildRegistrationEmail(
    localBase: string,
    domain: string,
    pool: RegistrationAllocationPool,
    index: number
): string {
    if (pool === 'single_dot') {
        return buildEmail(localBase, domain, index);
    }
    return buildThreeDotEmailFromIndex(localBase, domain, index);
}

export function isSingleDotPoolExhausted(state: Pick<EmailState, 'nextDotPosition'>, localBaseLength: number): boolean {
    return state.nextDotPosition >= localBaseLength;
}

export function validatePendingRecord(
    pending: unknown,
    localBase: string,
    domain: string
): PendingVerification {
    if (!pending || typeof pending !== 'object') {
        throw new Error(
            'Invalid email-state file: pendingVerification must be an object or null'
        );
    }

    const p = pending as Record<string, unknown>;
    const allocationPool =
        p.allocationPool === 'three_dot'
            ? 'three_dot'
            : 'single_dot';

    let dotPosition: number | undefined;
    let threeDotIndex: number | undefined;
    let threeDotGaps: ThreeDotGaps | undefined;

    if (allocationPool === 'single_dot') {
        const rawDot = p.dotPosition;
        if (
            typeof rawDot !== 'number' ||
            !Number.isInteger(rawDot) ||
            rawDot < 0 ||
            rawDot > localBase.length - 1
        ) {
            throw new Error(
                `Invalid email-state file: pendingVerification.dotPosition must be an integer from 0 to ${localBase.length - 1}`
            );
        }
        dotPosition = rawDot;
    } else {
        const rawIndex = p.threeDotIndex;
        const poolSize = threeDotPoolSize(localBase.length);
        if (
            typeof rawIndex !== 'number' ||
            !Number.isInteger(rawIndex) ||
            rawIndex < 0 ||
            rawIndex >= poolSize
        ) {
            throw new Error(
                `Invalid email-state file: pendingVerification.threeDotIndex must be an integer from 0 to ${poolSize > 0 ? poolSize - 1 : 0}`
            );
        }
        threeDotIndex = rawIndex;
        threeDotGaps = threeDotGapsAtIndex(localBase.length, rawIndex);
        const rawGaps = p.threeDotGaps;
        if (Array.isArray(rawGaps) && rawGaps.length === 3) {
            const gapTuple = rawGaps as number[];
            if (
                gapTuple[0] !== threeDotGaps[0] ||
                gapTuple[1] !== threeDotGaps[1] ||
                gapTuple[2] !== threeDotGaps[2]
            ) {
                throw new Error(
                    'Invalid email-state file: pendingVerification.threeDotGaps does not match threeDotIndex'
                );
            }
        }
    }

    const email = p.email;
    const expectedEmail =
        allocationPool === 'single_dot'
            ? buildEmail(localBase, domain, dotPosition!)
            : buildThreeDotEmailFromIndex(localBase, domain, threeDotIndex!);
    if (typeof email !== 'string' || email !== expectedEmail) {
        throw new Error(
            `Invalid email-state file: pendingVerification.email must be ${expectedEmail}`
        );
    }

    const phase = p.phase;
    if (
        phase !== 'selected' &&
        phase !== 'application_submit_pending' &&
        phase !== 'otp_submitted'
    ) {
        throw new Error(
            'Invalid email-state file: pendingVerification.phase is unsupported'
        );
    }

    const runId = p.runId;
    if (typeof runId !== 'string' || runId.length === 0) {
        throw new Error(
            'Invalid email-state file: pendingVerification.runId is required'
        );
    }

    const hostname = p.hostname;
    if (typeof hostname !== 'string' || hostname.length === 0) {
        throw new Error(
            'Invalid email-state file: pendingVerification.hostname is required'
        );
    }

    const pid = p.pid;
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
        throw new Error(
            'Invalid email-state file: pendingVerification.pid must be a positive integer'
        );
    }

    const startedAt = p.startedAt;
    if (typeof startedAt !== 'string') {
        throw new Error(
            'Invalid email-state file: pendingVerification.startedAt is required'
        );
    }
    const startedMs = parseIsoDate(startedAt, 'pendingVerification.startedAt');

    const applicationSubmitAttemptedAt = p.applicationSubmitAttemptedAt;
    const otpSubmittedAt = p.otpSubmittedAt;

    if (phase === 'selected') {
        if (applicationSubmitAttemptedAt !== undefined || otpSubmittedAt !== undefined) {
            throw new Error(
                'Invalid email-state file: selected pending must not include submit timestamps'
            );
        }
    }

    if (phase === 'application_submit_pending') {
        if (typeof applicationSubmitAttemptedAt !== 'string') {
            throw new Error(
                'Invalid email-state file: application_submit_pending requires applicationSubmitAttemptedAt'
            );
        }
        if (parseIsoDate(applicationSubmitAttemptedAt, 'applicationSubmitAttemptedAt') < startedMs) {
            throw new Error(
                'Invalid email-state file: applicationSubmitAttemptedAt must be >= startedAt'
            );
        }
        if (otpSubmittedAt !== undefined) {
            throw new Error(
                'Invalid email-state file: application_submit_pending must not include otpSubmittedAt'
            );
        }
    }

    if (phase === 'otp_submitted') {
        if (typeof applicationSubmitAttemptedAt !== 'string') {
            throw new Error(
                'Invalid email-state file: otp_submitted requires applicationSubmitAttemptedAt'
            );
        }
        if (typeof otpSubmittedAt !== 'string') {
            throw new Error(
                'Invalid email-state file: otp_submitted requires otpSubmittedAt'
            );
        }
        const appMs = parseIsoDate(
            applicationSubmitAttemptedAt,
            'applicationSubmitAttemptedAt'
        );
        const otpMs = parseIsoDate(otpSubmittedAt, 'otpSubmittedAt');
        if (appMs < startedMs) {
            throw new Error(
                'Invalid email-state file: applicationSubmitAttemptedAt must be >= startedAt'
            );
        }
        if (otpMs < appMs) {
            throw new Error(
                'Invalid email-state file: otpSubmittedAt must be >= applicationSubmitAttemptedAt'
            );
        }
    }

    return {
        allocationPool,
        dotPosition,
        threeDotIndex,
        threeDotGaps,
        email,
        phase,
        runId,
        hostname,
        pid,
        startedAt,
        applicationSubmitAttemptedAt:
            typeof applicationSubmitAttemptedAt === 'string'
                ? applicationSubmitAttemptedAt
                : undefined,
        otpSubmittedAt:
            typeof otpSubmittedAt === 'string' ? otpSubmittedAt : undefined,
    };
}

export type ReadEmailStateOptions = {
    /** When false (default), unresolved pending blocks the caller. When true, pending is returned for mutations. */
    allowUnresolvedPending?: boolean;
};

function readEmailStateFileContents(
    statePath: string,
    localBase: string,
    domain: string,
    options: ReadEmailStateOptions = {}
): EmailState {
    const allowUnresolvedPending = options.allowUnresolvedPending === true;

    if (!fs.existsSync(statePath)) {
        throw new Error(
            'Email state file is missing. Restore or initialize e2e-email-state.json before running the smoke test.'
        );
    }

    let raw: string;
    try {
        raw = fs.readFileSync(statePath, 'utf8').trim();
    } catch (err) {
        throw new Error(
            `Invalid email-state file: could not read ${statePath}: ${err}`
        );
    }

    if (!raw) {
        throw new Error(`Invalid email-state file: ${statePath} is empty`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(
            `Invalid email-state file: ${statePath} could not parse JSON`
        );
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid email-state file: root must be a JSON object');
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.schemaVersion === undefined) {
        throw new Error(
            `Invalid email-state file: missing schemaVersion (expected ${SUPPORTED_SCHEMA_VERSION})`
        );
    }
    if (obj.schemaVersion === 1) {
        throw new Error(
            'Unsupported schemaVersion 1. Create schemaVersion 2 manually: set highWaterMark equal to nextDotPosition, pendingVerification null, using historical usage to choose the starting counter.'
        );
    }
    if (obj.schemaVersion !== SUPPORTED_SCHEMA_VERSION && obj.schemaVersion !== LEGACY_SCHEMA_VERSION) {
        throw new Error(
            `Invalid email-state file: unsupported schemaVersion ${obj.schemaVersion} (supported: ${LEGACY_SCHEMA_VERSION}, ${SUPPORTED_SCHEMA_VERSION})`
        );
    }
    const fileSchemaVersion = obj.schemaVersion as number;

    if (typeof obj.localBase !== 'string' || obj.localBase !== localBase) {
        throw new Error(
            `Invalid email-state file: localBase mismatch (expected ${localBase}, got ${obj.localBase})`
        );
    }

    if (typeof obj.domain !== 'string' || obj.domain !== domain) {
        throw new Error(
            `Invalid email-state file: domain mismatch (expected ${domain}, got ${obj.domain})`
        );
    }

    const nextDotPosition = assertCounterInRange(
        obj.nextDotPosition,
        'nextDotPosition',
        localBase.length
    );
    const highWaterMark = assertCounterInRange(
        obj.highWaterMark,
        'highWaterMark',
        localBase.length
    );

    if (nextDotPosition < highWaterMark) {
        throw new Error(
            `Invalid email-state file: nextDotPosition (${nextDotPosition}) is less than highWaterMark (${highWaterMark}). Merge forward; never decrease highWaterMark.`
        );
    }

    if (!Object.prototype.hasOwnProperty.call(obj, 'pendingVerification')) {
        throw new Error(
            'Invalid email-state file: missing pendingVerification field'
        );
    }

    let pendingVerification: PendingVerification | null = null;
    if (obj.pendingVerification === null) {
        pendingVerification = null;
    } else if (obj.pendingVerification !== undefined) {
        pendingVerification = validatePendingRecord(
            obj.pendingVerification,
            localBase,
            domain
        );
    } else {
        throw new Error(
            'Invalid email-state file: pendingVerification must be null or an object'
        );
    }

    if (!allowUnresolvedPending && pendingVerification !== null) {
        throw new Error(
            `Unresolved pending verification for ${pendingVerification.email} (phase: ${pendingVerification.phase}, runId: ${pendingVerification.runId}). Reconcile with staging/Gmail, update counters forward with Math.max(nextDotPosition, highWaterMark, dotPosition + 1), clear pendingVerification, then rerun.`
        );
    }

    const legacySingleDotExhausted = nextDotPosition >= localBase.length;
    let allocationPool: RegistrationAllocationPool;
    let nextThreeDotIndex: number;
    let threeDotHighWaterMark: number;

    if (fileSchemaVersion === LEGACY_SCHEMA_VERSION) {
        allocationPool = pendingVerification
            ? pendingVerification.allocationPool
            : legacySingleDotExhausted
              ? 'three_dot'
              : 'single_dot';
        nextThreeDotIndex = 0;
        threeDotHighWaterMark = 0;
    } else {
        allocationPool = normalizeAllocationPool(obj.allocationPool, legacySingleDotExhausted);
        if (pendingVerification?.allocationPool === 'single_dot') {
            allocationPool = 'single_dot';
        }
        nextThreeDotIndex = assertThreeDotCounterInRange(
            obj.nextThreeDotIndex ?? 0,
            'nextThreeDotIndex',
            localBase.length
        );
        threeDotHighWaterMark = assertThreeDotCounterInRange(
            obj.threeDotHighWaterMark ?? 0,
            'threeDotHighWaterMark',
            localBase.length
        );
        if (nextThreeDotIndex < threeDotHighWaterMark) {
            throw new Error(
                `Invalid email-state file: nextThreeDotIndex (${nextThreeDotIndex}) is less than threeDotHighWaterMark (${threeDotHighWaterMark}).`
            );
        }
        if (allocationPool === 'single_dot' && !legacySingleDotExhausted && nextThreeDotIndex > 0) {
            throw new Error(
                'Invalid email-state file: nextThreeDotIndex cannot advance while single_dot pool is not exhausted'
            );
        }
    }

    return {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        localBase: obj.localBase,
        domain: obj.domain,
        nextDotPosition,
        highWaterMark,
        allocationPool,
        nextThreeDotIndex,
        threeDotHighWaterMark,
        pendingVerification,
    };
}

export type RegistrationEmailStateMigrationResult = {
    migrated: boolean;
    fromVersion: number;
    toVersion: number;
    backupRelativePath: string | null;
    allocationPool: RegistrationAllocationPool;
};

export function migrateRegistrationEmailStateIfNeeded(
    statePath: string,
    localBase: string,
    domain: string,
    options?: { repoRoot?: string }
): RegistrationEmailStateMigrationResult {
    const raw = fs.readFileSync(statePath, 'utf8').trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fromVersion = Number(parsed.schemaVersion);
    if (fromVersion === SUPPORTED_SCHEMA_VERSION) {
        const state = readEmailStateFileContents(statePath, localBase, domain, {
            allowUnresolvedPending: true,
        });
        return {
            migrated: false,
            fromVersion,
            toVersion: SUPPORTED_SCHEMA_VERSION,
            backupRelativePath: null,
            allocationPool: state.allocationPool,
        };
    }
    if (fromVersion !== LEGACY_SCHEMA_VERSION) {
        throw new Error(
            `Cannot migrate registration email state: unsupported schemaVersion ${fromVersion}`
        );
    }

    const repoRoot = options?.repoRoot ?? path.dirname(statePath);
    ensureEmailArtifactDirs(repoRoot);
    const timestampLabel = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = copyRegistrationEmailStateBackup(repoRoot, timestampLabel);

    const state = readEmailStateFileContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const legacyExhausted = isSingleDotPoolExhausted(state, localBase.length);
    const allocationPool: RegistrationAllocationPool = state.pendingVerification
        ? state.pendingVerification.allocationPool
        : legacyExhausted
          ? 'three_dot'
          : 'single_dot';

    const migrated: EmailState = {
        ...state,
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        allocationPool,
        nextThreeDotIndex: allocationPool === 'three_dot' ? state.nextThreeDotIndex : 0,
        threeDotHighWaterMark: allocationPool === 'three_dot' ? state.threeDotHighWaterMark : 0,
    };

    writeEmailStateAtomic(statePath, migrated);

    return {
        migrated: true,
        fromVersion,
        toVersion: SUPPORTED_SCHEMA_VERSION,
        backupRelativePath: backup.relativePath,
        allocationPool: migrated.allocationPool,
    };
}

export function readEmailState(
    statePath: string,
    localBase: string,
    domain: string,
    options?: ReadEmailStateOptions
): EmailState {
    return readEmailStateFileContents(statePath, localBase, domain, options);
}

type WriteEmailStateAtomicFn = (statePath: string, state: EmailState) => void;

let writeEmailStateAtomicOverride: WriteEmailStateAtomicFn | null = null;

/** Test-only: inject deterministic write failures. */
export function setWriteEmailStateAtomicOverride(
    fn: WriteEmailStateAtomicFn | null
): void {
    writeEmailStateAtomicOverride = fn;
}

function writeEmailStateAtomicDefault(
    statePath: string,
    state: EmailState
): void {
    if (state.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        throw new Error('Internal error: invalid schemaVersion on write');
    }

    if (state.nextDotPosition < state.highWaterMark) {
        throw new Error(
            'Internal error: nextDotPosition cannot be less than highWaterMark on write'
        );
    }

    if (state.nextThreeDotIndex < state.threeDotHighWaterMark) {
        throw new Error(
            'Internal error: nextThreeDotIndex cannot be less than threeDotHighWaterMark on write'
        );
    }

    if (state.pendingVerification !== null) {
        validatePendingRecord(
            state.pendingVerification,
            state.localBase,
            state.domain
        );
    }

    const dir = path.dirname(statePath);
    fs.mkdirSync(dir, { recursive: true });

    const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    const body = `${JSON.stringify(state, null, 2)}\n`;
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, statePath);
    try {
        const fd = fs.openSync(statePath, 'r');
        fs.fsyncSync(fd);
        fs.closeSync(fd);
    } catch {
        // Best-effort durability.
    }
}

export function writeEmailStateAtomic(statePath: string, state: EmailState): void {
    if (writeEmailStateAtomicOverride) {
        writeEmailStateAtomicOverride(statePath, state);
        return;
    }
    writeEmailStateAtomicDefault(statePath, state);
}

export function acquireExclusiveLock(
    lockPath: string,
    metadata: LockMetadata
): void {
    if (
        !metadata.runId ||
        !metadata.hostname ||
        !metadata.acquiredAt ||
        !Number.isInteger(metadata.pid) ||
        metadata.pid <= 0
    ) {
        throw new Error('Internal error: incomplete lock metadata');
    }

    const dir = path.dirname(lockPath);
    fs.mkdirSync(dir, { recursive: true });

    let fd: number;
    try {
        fd = fs.openSync(lockPath, 'wx');
    } catch (err: unknown) {
        const code =
            err && typeof err === 'object' && 'code' in err
                ? String((err as NodeJS.ErrnoException).code)
                : '';
        if (code === 'EEXIST') {
            throw new Error(
                `Cannot acquire ${E2E_EMAIL_LOCK_FILENAME} (exclusive). Another smoke run may be active, or a stale lock remains. Confirm no other fullE2ESmoke run is in progress on this machine. Inspect e2e-email-state.json pendingVerification and reconcile with staging/Gmail; record outcomes under test-state/email/reconciliation and state backups under test-state/email/backups. If the lock is stale, remove ${E2E_EMAIL_LOCK_FILENAME} manually only after reconciliation.`
            );
        }
        throw new Error(`Cannot acquire ${E2E_EMAIL_LOCK_FILENAME}: ${err}`);
    }

    try {
        const payload = `${JSON.stringify(metadata, null, 2)}\n`;
        fs.writeFileSync(fd, payload, 'utf8');
        fs.fsyncSync(fd);
    } catch (err) {
        try {
            fs.closeSync(fd);
        } catch {
            /* ignore */
        }
        try {
            const existing = fs.readFileSync(lockPath, 'utf8');
            const parsed = JSON.parse(existing) as LockMetadata;
            if (parsed.runId === metadata.runId) {
                fs.unlinkSync(lockPath);
            }
        } catch {
            /* ignore */
        }
        throw new Error(`Failed to write ${E2E_EMAIL_LOCK_FILENAME}: ${err}`);
    }

    fs.closeSync(fd);
}

export function releaseExclusiveLock(lockPath: string, runId: string): void {
    if (!fs.existsSync(lockPath)) {
        return;
    }

    try {
        const raw = fs.readFileSync(lockPath, 'utf8').trim();
        const lock = JSON.parse(raw) as LockMetadata;
        if (lock.runId === runId) {
            fs.unlinkSync(lockPath);
        }
    } catch {
        // Do not delete lock we cannot verify ownership for.
    }
}

export function assertPositionAvailable(
    nextDotPosition: number,
    localBaseLength: number
): void {
    if (nextDotPosition >= localBaseLength) {
        throw new Error(
            'All single-dot Gmail variants have already been consumed. ' +
                `nextDotPosition is ${nextDotPosition} (valid use positions are 0 to ${localBaseLength - 1}). ` +
                'Extend the generator or initialize a higher strategy before running again.'
        );
    }
}

const MANUAL_DOT_POSITION_PATTERN = /^(0|[1-9]\d*)$/;

export function parseManualDotPosition(
    raw: string,
    localBaseLength: number
): number {
    if (raw.length === 0 || raw.trim().length === 0) {
        throw new Error(
            `EPOSE_DOT_POSITION must be a whole number from 0 to ${localBaseLength - 1}. Got empty value`
        );
    }
    if (raw !== raw.trim() || !MANUAL_DOT_POSITION_PATTERN.test(raw)) {
        throw new Error(
            `EPOSE_DOT_POSITION must be a decimal integer from 0 to ${localBaseLength - 1} with no signs, whitespace, fractions, or alternate notation. Got: ${raw}`
        );
    }

    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > localBaseLength - 1) {
        throw new Error(
            `EPOSE_DOT_POSITION must be a whole number from 0 to ${localBaseLength - 1}. Got: ${raw}`
        );
    }
    return n;
}

export function assertManualOverrideAllowed(
    manualPosition: number,
    savedNextDotPosition: number
): void {
    if (manualPosition < savedNextDotPosition) {
        throw new Error(
            `EPOSE_DOT_POSITION=${manualPosition} is behind saved nextDotPosition=${savedNextDotPosition}. ` +
                `Positions 0–${savedNextDotPosition - 1} may already be verified. ` +
                'Do not lower nextDotPosition or highWaterMark to bypass this check. ' +
                'Reconcile forward using Math.max(nextDotPosition, highWaterMark, evidence) from Gmail and staging.'
        );
    }

    if (manualPosition > savedNextDotPosition) {
        console.warn(
            `Manual position ${manualPosition} is ahead of saved nextDotPosition=${savedNextDotPosition}. ` +
                `If verification completes, state will advance to at least ${manualPosition + 1} (skipped indices remain unused).`
        );
    }
}

export type DotSelection = {
    dotPosition: number;
    source: 'manual' | 'persistent';
};

export type RegistrationAllocationSelection =
    | {
          pool: 'single_dot';
          dotPosition: number;
          source: 'manual' | 'persistent';
      }
    | {
          pool: 'three_dot';
          threeDotIndex: number;
          threeDotGaps: ThreeDotGaps;
          source: 'manual' | 'persistent';
      };

const MANUAL_THREE_DOT_INDEX_PATTERN = /^(0|[1-9]\d*)$/;

export function parseManualThreeDotIndex(raw: string, localBaseLength: number): number {
    if (raw.length === 0 || raw.trim().length === 0) {
        throw new Error(
            `EPOSE_THREE_DOT_INDEX must be a whole number from 0 to ${threeDotPoolSize(localBaseLength) - 1}. Got empty value`
        );
    }
    if (raw !== raw.trim() || !MANUAL_THREE_DOT_INDEX_PATTERN.test(raw)) {
        throw new Error(
            `EPOSE_THREE_DOT_INDEX must be a decimal integer with no signs or whitespace. Got: ${raw}`
        );
    }
    const n = Number(raw);
    const max = threeDotPoolSize(localBaseLength) - 1;
    if (!Number.isInteger(n) || n < 0 || n > max) {
        throw new Error(
            `EPOSE_THREE_DOT_INDEX must be a whole number from 0 to ${max}. Got: ${raw}`
        );
    }
    return n;
}

export function assertManualThreeDotOverrideAllowed(
    manualIndex: number,
    savedNextThreeDotIndex: number
): void {
    if (manualIndex < savedNextThreeDotIndex) {
        throw new Error(
            `EPOSE_THREE_DOT_INDEX=${manualIndex} is behind saved nextThreeDotIndex=${savedNextThreeDotIndex}. ` +
                'Do not lower threeDotHighWaterMark to bypass this check.'
        );
    }
    if (manualIndex > savedNextThreeDotIndex) {
        console.warn(
            `Manual three-dot index ${manualIndex} is ahead of saved nextThreeDotIndex=${savedNextThreeDotIndex}. ` +
                `If verification completes, state will advance to at least ${manualIndex + 1}.`
        );
    }
}

export function resolveRegistrationAllocation(
    state: EmailState,
    manualDotPositionRaw: string | undefined,
    manualThreeDotIndexRaw: string | undefined,
    localBaseLength: number
): RegistrationAllocationSelection {
    const pool =
        state.pendingVerification?.allocationPool ??
        (isSingleDotPoolExhausted(state, localBaseLength) ? 'three_dot' : state.allocationPool);

    if (pool === 'single_dot') {
        if (manualThreeDotIndexRaw !== undefined) {
            throw new Error(
                'EPOSE_THREE_DOT_INDEX is set but registration pool is still single_dot (single-dot slots remain or pending single_dot verification must be reconciled first).'
            );
        }
        if (manualDotPositionRaw !== undefined) {
            const dotPosition = parseManualDotPosition(manualDotPositionRaw, localBaseLength);
            assertManualOverrideAllowed(dotPosition, state.nextDotPosition);
            return { pool: 'single_dot', dotPosition, source: 'manual' };
        }
        assertPositionAvailable(state.nextDotPosition, localBaseLength);
        return { pool: 'single_dot', dotPosition: state.nextDotPosition, source: 'persistent' };
    }

    if (manualDotPositionRaw !== undefined) {
        throw new Error(
            'EPOSE_DOT_POSITION is not valid once the single-dot registration pool is exhausted; use EPOSE_THREE_DOT_INDEX instead.'
        );
    }

    if (manualThreeDotIndexRaw !== undefined) {
        const threeDotIndex = parseManualThreeDotIndex(manualThreeDotIndexRaw, localBaseLength);
        assertManualThreeDotOverrideAllowed(threeDotIndex, state.nextThreeDotIndex);
        return {
            pool: 'three_dot',
            threeDotIndex,
            threeDotGaps: threeDotGapsAtIndex(localBaseLength, threeDotIndex),
            source: 'manual',
        };
    }

    assertThreeDotIndexAvailable(state.nextThreeDotIndex, localBaseLength);
    return {
        pool: 'three_dot',
        threeDotIndex: state.nextThreeDotIndex,
        threeDotGaps: threeDotGapsAtIndex(localBaseLength, state.nextThreeDotIndex),
        source: 'persistent',
    };
}

export function resolveDotPosition(
    state: EmailState,
    manualRaw: string | undefined,
    localBaseLength: number
): DotSelection {
    const selection = resolveRegistrationAllocation(state, manualRaw, undefined, localBaseLength);
    if (selection.pool !== 'single_dot') {
        throw new Error(
            'All single-dot Gmail variants have already been consumed. Migrate state and allocate from the three-dot pool.'
        );
    }
    return { dotPosition: selection.dotPosition, source: selection.source };
}

export function previewNextRegistrationAliases(
    state: EmailState,
    localBase: string,
    domain: string,
    count: number
): string[] {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error('previewNextRegistrationAliases count must be a positive integer');
    }
    const preview: string[] = [];
    let virtual = { ...state };

    for (let i = 0; i < count; i++) {
        const selection = resolveRegistrationAllocation(
            virtual,
            undefined,
            undefined,
            localBase.length
        );
        if (selection.pool === 'single_dot') {
            preview.push(buildEmail(localBase, domain, selection.dotPosition));
            virtual = {
                ...virtual,
                nextDotPosition: selection.dotPosition + 1,
                highWaterMark: Math.max(virtual.highWaterMark, selection.dotPosition + 1),
            };
            if (isSingleDotPoolExhausted(virtual, localBase.length)) {
                virtual = {
                    ...virtual,
                    allocationPool: 'three_dot',
                };
            }
        } else {
            preview.push(buildThreeDotEmailFromIndex(localBase, domain, selection.threeDotIndex));
            const nextIndex = selection.threeDotIndex + 1;
            virtual = {
                ...virtual,
                allocationPool: 'three_dot',
                nextThreeDotIndex: nextIndex,
                threeDotHighWaterMark: Math.max(virtual.threeDotHighWaterMark, nextIndex),
            };
        }
    }
    return preview;
}

function basePendingFields(
    email: string,
    runId: string
): Omit<PendingVerification, 'phase' | 'startedAt' | 'allocationPool'> & { startedAt: string } {
    return {
        email,
        runId,
        hostname: os.hostname(),
        pid: process.pid,
        startedAt: new Date().toISOString(),
    };
}

export function persistPendingSelected(
    statePath: string,
    localBase: string,
    domain: string,
    selection: RegistrationAllocationSelection,
    email: string,
    runId: string
): void {
    const current = readEmailStateFileContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    if (current.pendingVerification !== null) {
        throw new Error(
            'Internal error: cannot persist selected pending while another pending exists'
        );
    }

    const pending: PendingVerification =
        selection.pool === 'single_dot'
            ? {
                  ...basePendingFields(email, runId),
                  allocationPool: 'single_dot',
                  dotPosition: selection.dotPosition,
                  phase: 'selected',
              }
            : {
                  ...basePendingFields(email, runId),
                  allocationPool: 'three_dot',
                  threeDotIndex: selection.threeDotIndex,
                  threeDotGaps: selection.threeDotGaps,
                  phase: 'selected',
              };

    writeEmailStateAtomic(statePath, { ...current, pendingVerification: pending });
}

/** @deprecated Use persistPendingSelected with RegistrationAllocationSelection */
export function persistPendingSelectedAtDotPosition(
    statePath: string,
    localBase: string,
    domain: string,
    dotPosition: number,
    email: string,
    runId: string
): void {
    persistPendingSelected(
        statePath,
        localBase,
        domain,
        { pool: 'single_dot', dotPosition, source: 'persistent' },
        email,
        runId
    );
}

export function persistApplicationSubmitPending(
    statePath: string,
    localBase: string,
    domain: string,
    runId: string
): void {
    const current = readEmailStateFileContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = current.pendingVerification;
    if (!pending || pending.runId !== runId || pending.phase !== 'selected') {
        throw new Error(
            'Internal error: expected selected pending for this run before application_submit_pending'
        );
    }

    const updated: PendingVerification = {
        ...pending,
        phase: 'application_submit_pending',
        applicationSubmitAttemptedAt: new Date().toISOString(),
    };

    writeEmailStateAtomic(statePath, {
        ...current,
        pendingVerification: updated,
    });
}

export function persistOtpSubmitted(
    statePath: string,
    localBase: string,
    domain: string,
    runId: string
): void {
    const current = readEmailStateFileContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = current.pendingVerification;
    if (
        !pending ||
        pending.runId !== runId ||
        pending.phase !== 'application_submit_pending' ||
        !pending.applicationSubmitAttemptedAt
    ) {
        throw new Error(
            'Internal error: expected application_submit_pending for this run before otp_submitted'
        );
    }

    const updated: PendingVerification = {
        ...pending,
        phase: 'otp_submitted',
        otpSubmittedAt: new Date().toISOString(),
    };

    writeEmailStateAtomic(statePath, {
        ...current,
        pendingVerification: updated,
    });
}

export function clearPendingSelectedOnly(
    statePath: string,
    localBase: string,
    domain: string,
    runId: string
): void {
    const current = readEmailStateFileContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = current.pendingVerification;
    if (!pending) {
        return;
    }
    if (pending.runId !== runId) {
        return;
    }
    if (pending.phase !== 'selected') {
        return;
    }

    writeEmailStateAtomic(statePath, {
        ...current,
        pendingVerification: null,
    });
}

export function commitEmailConsumed(
    statePath: string,
    localBase: string,
    domain: string,
    runId: string,
    dotPosition: number
): void {
    const current = readEmailStateFileContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = current.pendingVerification;
    if (!pending || pending.runId !== runId || pending.phase !== 'otp_submitted') {
        throw new Error(
            'Internal error: expected otp_submitted pending for this run before consumption commit'
        );
    }

    if (pending.allocationPool === 'three_dot') {
        if (
            typeof pending.threeDotIndex !== 'number' ||
            (dotPosition !== undefined && dotPosition !== pending.threeDotIndex)
        ) {
            throw new Error(
                'Internal error: three-dot consumption commit requires matching threeDotIndex on pending record'
            );
        }
        const consumedIndex = pending.threeDotIndex;
        const newThreeNext = Math.max(
            current.nextThreeDotIndex,
            current.threeDotHighWaterMark,
            consumedIndex + 1
        );
        writeEmailStateAtomic(statePath, {
            ...current,
            allocationPool: 'three_dot',
            nextThreeDotIndex: newThreeNext,
            threeDotHighWaterMark: newThreeNext,
            pendingVerification: null,
        });
        console.log(
            `Email consumed at three-dot index ${consumedIndex}. Saved nextThreeDotIndex=${newThreeNext} to ${statePath}`
        );
        return;
    }

    if (
        typeof pending.dotPosition !== 'number' ||
        (dotPosition !== undefined && dotPosition !== pending.dotPosition)
    ) {
        throw new Error(
            'Internal error: expected matching dotPosition on pending record before consumption commit'
        );
    }
    const consumedDot = pending.dotPosition;
    const newNext = Math.max(current.nextDotPosition, current.highWaterMark, consumedDot + 1);
    const singleExhausted = newNext >= localBase.length;

    writeEmailStateAtomic(statePath, {
        ...current,
        nextDotPosition: newNext,
        highWaterMark: newNext,
        allocationPool: singleExhausted ? 'three_dot' : current.allocationPool,
        nextThreeDotIndex: singleExhausted ? current.nextThreeDotIndex : 0,
        threeDotHighWaterMark: singleExhausted ? current.threeDotHighWaterMark : 0,
        pendingVerification: null,
    });

    console.log(
        `Email consumed at position ${consumedDot}. Saved nextDotPosition=${newNext} to ${statePath}`
    );
}

export function createRunId(): string {
    return crypto.randomUUID();
}
