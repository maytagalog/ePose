import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const SUPPORTED_SCHEMA_VERSION = 2;
export const E2E_EMAIL_STATE_FILENAME = 'e2e-email-state.json';
export const E2E_EMAIL_LOCK_FILENAME = 'e2e-email.lock';

export const DEFAULT_LOCAL_BASE = 'aardvarkomonstrosesquip1230000';
export const DEFAULT_DOMAIN = 'gmail.com';

export type PendingPhase =
    | 'selected'
    | 'application_submit_pending'
    | 'otp_submitted';

export type PendingVerification = {
    dotPosition: number;
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
    const dotPosition = p.dotPosition;
    if (
        typeof dotPosition !== 'number' ||
        !Number.isInteger(dotPosition) ||
        dotPosition < 0 ||
        dotPosition > localBase.length - 1
    ) {
        throw new Error(
            'Invalid email-state file: pendingVerification.dotPosition must be an integer from 0 to 29'
        );
    }

    const email = p.email;
    const expectedEmail = buildEmail(localBase, domain, dotPosition);
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
        dotPosition,
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
            'Invalid email-state file: missing schemaVersion (expected 2)'
        );
    }
    if (obj.schemaVersion === 1) {
        throw new Error(
            'Unsupported schemaVersion 1. Create schemaVersion 2 manually: set highWaterMark equal to nextDotPosition, pendingVerification null, using historical usage to choose the starting counter.'
        );
    }
    if (obj.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
        throw new Error(
            `Invalid email-state file: unsupported schemaVersion ${obj.schemaVersion} (supported: ${SUPPORTED_SCHEMA_VERSION})`
        );
    }

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

    return {
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        localBase: obj.localBase,
        domain: obj.domain,
        nextDotPosition,
        highWaterMark,
        pendingVerification,
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
                `Cannot acquire ${E2E_EMAIL_LOCK_FILENAME} (exclusive). Another smoke run may be active, or a stale lock remains. Confirm no other fullE2ESmoke run is in progress on this machine. Inspect e2e-email-state.json pendingVerification and reconcile with staging/Gmail. If the lock is stale, remove ${E2E_EMAIL_LOCK_FILENAME} manually only after reconciliation.`
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

export function resolveDotPosition(
    state: EmailState,
    manualRaw: string | undefined,
    localBaseLength: number
): DotSelection {
    if (manualRaw !== undefined) {
        const dotPosition = parseManualDotPosition(manualRaw, localBaseLength);
        assertManualOverrideAllowed(dotPosition, state.nextDotPosition);
        return { dotPosition, source: 'manual' };
    }

    assertPositionAvailable(state.nextDotPosition, localBaseLength);
    return { dotPosition: state.nextDotPosition, source: 'persistent' };
}

function basePendingFields(
    dotPosition: number,
    email: string,
    runId: string
): Omit<PendingVerification, 'phase' | 'startedAt'> & { startedAt: string } {
    return {
        dotPosition,
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
    dotPosition: number,
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

    const pending: PendingVerification = {
        ...basePendingFields(dotPosition, email, runId),
        phase: 'selected',
    };

    writeEmailStateAtomic(statePath, { ...current, pendingVerification: pending });
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
    if (
        !pending ||
        pending.runId !== runId ||
        pending.phase !== 'otp_submitted' ||
        pending.dotPosition !== dotPosition
    ) {
        throw new Error(
            'Internal error: expected otp_submitted pending for this run before consumption commit'
        );
    }

    const newNext = Math.max(
        current.nextDotPosition,
        current.highWaterMark,
        dotPosition + 1
    );

    writeEmailStateAtomic(statePath, {
        ...current,
        nextDotPosition: newNext,
        highWaterMark: newNext,
        pendingVerification: null,
    });

    console.log(
        `Email consumed at position ${dotPosition}. Saved nextDotPosition=${newNext} to ${statePath}`
    );
}

export function createRunId(): string {
    return crypto.randomUUID();
}
