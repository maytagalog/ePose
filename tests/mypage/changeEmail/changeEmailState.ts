import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildEmail, emailWithDotAt } from '../../register/emailState';

export const CHANGE_EMAIL_SCHEMA_VERSION = 1;
export const CHANGE_EMAIL_STATE_FILENAME = 'e2e-change-email-state.json';
export const CHANGE_EMAIL_LOCK_FILENAME = 'e2e-change-email.lock';

export const CHANGE_EMAIL_LOCAL_BASE = 'aardvarkomonstrosesquip1230000';
export const CHANGE_EMAIL_DOMAIN = 'gmail.com';

/**
 * Two-dot pool: distinct insert positions (same semantics as registration dot positions),
 * non-adjacent (>= 2 apart), neither at 0 (no undotted) — internal dots only.
 *
 * Initialize example (review historical two-dot usage before first live run):
 * {
 *   "schemaVersion": 1,
 *   "localBase": "aardvarkomonstrosesquip1230000",
 *   "domain": "gmail.com",
 *   "nextTargetIndex": 0,
 *   "highWaterMark": 0,
 *   "pendingChange": null
 * }
 *
 * Recovery (forward-only): reconcile staging/Gmail, then advance counters conservatively:
 *   newNext = Math.max(nextTargetIndex, highWaterMark, pending.targetIndex + 1)
 * Clear pendingChange only after confirming whether that pending target succeeded.
 * Do not lower counters or automatically recycle the released original email.
 *
 * Local state/lock files coordinate only processes sharing the same repo paths.
 */

export type ChangeEmailPendingPhase =
    | 'target_reserved'
    | 'otp_request_submitted'
    | 'confirmation_submitted';

export type ChangeEmailPending = {
    targetIndex: number;
    currentEmail: string;
    targetEmail: string;
    phase: ChangeEmailPendingPhase;
    runId: string;
    hostname: string;
    pid: number;
    startedAt: string;
    otpRequestSubmittedAt?: string;
    confirmationSubmittedAt?: string;
};

export type ChangeEmailState = {
    schemaVersion: typeof CHANGE_EMAIL_SCHEMA_VERSION;
    localBase: string;
    domain: string;
    nextTargetIndex: number;
    highWaterMark: number;
    pendingChange: ChangeEmailPending | null;
};

export type ChangeEmailLockMetadata = {
    runId: string;
    pid: number;
    hostname: string;
    acquiredAt: string;
    currentEmail?: string;
    targetEmail?: string;
};

export type TwoDotPair = readonly [pos1: number, pos2: number];

export function enumerateTwoDotPairs(localBaseLength: number): TwoDotPair[] {
    const pairs: TwoDotPair[] = [];
    for (let pos1 = 1; pos1 <= localBaseLength - 2; pos1++) {
        for (let pos2 = pos1 + 2; pos2 <= localBaseLength - 1; pos2++) {
            pairs.push([pos1, pos2]);
        }
    }
    return pairs;
}

export function twoDotPoolSize(localBase: string): number {
    return enumerateTwoDotPairs(localBase.length).length;
}

export function twoDotPairAtIndex(localBase: string, targetIndex: number): TwoDotPair {
    const pairs = enumerateTwoDotPairs(localBase.length);
    if (targetIndex < 0 || targetIndex >= pairs.length) {
        throw new Error(
            `Two-dot target index ${targetIndex} out of range (0..${pairs.length - 1})`
        );
    }
    return pairs[targetIndex]!;
}

export function buildTwoDotEmail(
    localBase: string,
    domain: string,
    pos1: number,
    pos2: number
): string {
    if (!Number.isInteger(pos1) || !Number.isInteger(pos2) || pos1 >= pos2 || pos2 - pos1 < 2) {
        throw new Error(
            `Invalid two-dot pair (${pos1}, ${pos2}): must be non-adjacent internal positions`
        );
    }
    if (pos1 < 1 || pos2 > localBase.length - 1) {
        throw new Error(
            `Invalid two-dot pair (${pos1}, ${pos2}) for local part length ${localBase.length}`
        );
    }
    const withSecond =
        localBase.slice(0, pos2) + '.' + localBase.slice(pos2);
    const withBoth = withSecond.slice(0, pos1) + '.' + withSecond.slice(pos1);
    return `${withBoth}@${domain}`;
}

export function buildTwoDotEmailFromIndex(
    localBase: string,
    domain: string,
    targetIndex: number
): string {
    const [pos1, pos2] = twoDotPairAtIndex(localBase, targetIndex);
    return buildTwoDotEmail(localBase, domain, pos1, pos2);
}

/** Registration pool uses at most one dot; two-dot targets are disjoint from undotted/single-dot variants. */
export function isRegistrationPoolEmail(localBase: string, domain: string, email: string): boolean {
    const at = email.lastIndexOf('@');
    if (at < 0) {
        return false;
    }
    const local = email.slice(0, at);
    const emailDomain = email.slice(at + 1);
    if (emailDomain !== domain) {
        return false;
    }
    const undotted = `${localBase}@${domain}`;
    if (email === undotted) {
        return true;
    }
    const dotCount = (local.match(/\./g) ?? []).length;
    if (dotCount !== 1) {
        return false;
    }
    for (let p = 0; p <= localBase.length - 1; p++) {
        if (buildEmail(localBase, domain, p) === email) {
            return true;
        }
    }
    return false;
}

export function changeEmailStateFilePath(repoRoot: string): string {
    return path.join(repoRoot, CHANGE_EMAIL_STATE_FILENAME);
}

export function changeEmailLockFilePath(repoRoot: string): string {
    return path.join(repoRoot, CHANGE_EMAIL_LOCK_FILENAME);
}

function parseIsoDate(value: string, label: string): number {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
        throw new Error(`Invalid change-email state: ${label} is not ISO-8601`);
    }
    return ms;
}

function validatePendingChange(
    pending: unknown,
    localBase: string,
    domain: string,
    highWaterMark: number
): ChangeEmailPending {
    if (!pending || typeof pending !== 'object') {
        throw new Error('Invalid change-email state: pendingChange must be an object or null');
    }
    const p = pending as Record<string, unknown>;
    const targetIndex = p.targetIndex;
    if (typeof targetIndex !== 'number' || !Number.isInteger(targetIndex) || targetIndex < 0) {
        throw new Error('Invalid change-email state: pendingChange.targetIndex must be a non-negative integer');
    }
    const expectedTarget = buildTwoDotEmailFromIndex(localBase, domain, targetIndex);
    if (typeof p.targetEmail !== 'string' || p.targetEmail !== expectedTarget) {
        throw new Error(
            `Invalid change-email state: pendingChange.targetEmail must be ${expectedTarget}`
        );
    }
    if (typeof p.currentEmail !== 'string' || p.currentEmail.length === 0) {
        throw new Error('Invalid change-email state: pendingChange.currentEmail is required');
    }
    if (p.currentEmail === expectedTarget) {
        throw new Error('Invalid change-email state: currentEmail must differ from targetEmail');
    }
    if (targetIndex < highWaterMark) {
        throw new Error(
            `Invalid change-email state: pendingChange.targetIndex ${targetIndex} is behind highWaterMark ${highWaterMark}`
        );
    }
    const phase = p.phase;
    if (
        phase !== 'target_reserved' &&
        phase !== 'otp_request_submitted' &&
        phase !== 'confirmation_submitted'
    ) {
        throw new Error('Invalid change-email state: pendingChange.phase is unsupported');
    }
    if (typeof p.runId !== 'string' || !p.runId) {
        throw new Error('Invalid change-email state: pendingChange.runId is required');
    }
    if (typeof p.hostname !== 'string' || !p.hostname) {
        throw new Error('Invalid change-email state: pendingChange.hostname is required');
    }
    if (typeof p.pid !== 'number' || !Number.isInteger(p.pid) || p.pid <= 0) {
        throw new Error('Invalid change-email state: pendingChange.pid must be positive integer');
    }
    if (typeof p.startedAt !== 'string') {
        throw new Error('Invalid change-email state: pendingChange.startedAt is required');
    }
    const startedMs = parseIsoDate(p.startedAt, 'startedAt');
    const otpRequestSubmittedAt = p.otpRequestSubmittedAt;
    const confirmationSubmittedAt = p.confirmationSubmittedAt;

    if (phase === 'target_reserved') {
        if (otpRequestSubmittedAt !== undefined || confirmationSubmittedAt !== undefined) {
            throw new Error('Invalid change-email state: target_reserved must not include submit timestamps');
        }
    }
    if (phase === 'otp_request_submitted') {
        if (typeof otpRequestSubmittedAt !== 'string') {
            throw new Error('Invalid change-email state: otp_request_submitted requires otpRequestSubmittedAt');
        }
        const otpMs = parseIsoDate(otpRequestSubmittedAt, 'otpRequestSubmittedAt');
        if (otpMs < startedMs) {
            throw new Error('Invalid change-email state: otpRequestSubmittedAt must be >= startedAt');
        }
        if (confirmationSubmittedAt !== undefined) {
            throw new Error('Invalid change-email state: otp_request_submitted must not include confirmationSubmittedAt');
        }
    }
    if (phase === 'confirmation_submitted') {
        if (typeof otpRequestSubmittedAt !== 'string' || typeof confirmationSubmittedAt !== 'string') {
            throw new Error('Invalid change-email state: confirmation_submitted requires both submit timestamps');
        }
        const otpMs = parseIsoDate(otpRequestSubmittedAt, 'otpRequestSubmittedAt');
        const confirmMs = parseIsoDate(confirmationSubmittedAt, 'confirmationSubmittedAt');
        if (otpMs < startedMs) {
            throw new Error('Invalid change-email state: otpRequestSubmittedAt must be >= startedAt');
        }
        if (confirmMs < otpMs) {
            throw new Error(
                'Invalid change-email state: confirmationSubmittedAt must be >= otpRequestSubmittedAt'
            );
        }
    }

    return {
        targetIndex,
        currentEmail: p.currentEmail,
        targetEmail: p.targetEmail,
        phase,
        runId: p.runId,
        hostname: p.hostname,
        pid: p.pid,
        startedAt: p.startedAt,
        otpRequestSubmittedAt:
            typeof otpRequestSubmittedAt === 'string' ? otpRequestSubmittedAt : undefined,
        confirmationSubmittedAt:
            typeof confirmationSubmittedAt === 'string' ? confirmationSubmittedAt : undefined,
    };
}

export type ReadChangeEmailStateOptions = {
    allowUnresolvedPending?: boolean;
};

function readChangeEmailStateContents(
    statePath: string,
    localBase: string,
    domain: string,
    options: ReadChangeEmailStateOptions = {}
): ChangeEmailState {
    if (!fs.existsSync(statePath)) {
        throw new Error(
            `Change Email state file is missing. Initialize ${CHANGE_EMAIL_STATE_FILENAME} manually before running Change Email smoke.`
        );
    }
    const raw = fs.readFileSync(statePath, 'utf8').trim();
    if (!raw) {
        throw new Error(`Invalid change-email state: ${statePath} is empty`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`Invalid change-email state: could not parse JSON in ${statePath}`);
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid change-email state: root must be an object');
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.schemaVersion !== CHANGE_EMAIL_SCHEMA_VERSION) {
        throw new Error(
            `Invalid change-email state: unsupported schemaVersion ${obj.schemaVersion} (expected ${CHANGE_EMAIL_SCHEMA_VERSION})`
        );
    }
    if (obj.localBase !== localBase || obj.domain !== domain) {
        throw new Error('Invalid change-email state: localBase/domain mismatch');
    }
    const poolSize = twoDotPoolSize(localBase);
    const nextTargetIndex = obj.nextTargetIndex;
    const highWaterMark = obj.highWaterMark;
    if (
        typeof nextTargetIndex !== 'number' ||
        !Number.isInteger(nextTargetIndex) ||
        nextTargetIndex < 0 ||
        nextTargetIndex > poolSize
    ) {
        throw new Error(
            `Invalid change-email state: nextTargetIndex must be 0..${poolSize}`
        );
    }
    if (
        typeof highWaterMark !== 'number' ||
        !Number.isInteger(highWaterMark) ||
        highWaterMark < 0 ||
        highWaterMark > poolSize
    ) {
        throw new Error(`Invalid change-email state: highWaterMark must be 0..${poolSize}`);
    }
    if (nextTargetIndex < highWaterMark) {
        throw new Error(
            'Invalid change-email state: nextTargetIndex cannot be less than highWaterMark'
        );
    }
    if (!Object.prototype.hasOwnProperty.call(obj, 'pendingChange')) {
        throw new Error('Invalid change-email state: missing pendingChange');
    }
    let pendingChange: ChangeEmailPending | null = null;
    if (obj.pendingChange !== null) {
        pendingChange = validatePendingChange(
            obj.pendingChange,
            localBase,
            domain,
            highWaterMark
        );
    }
    if (!options.allowUnresolvedPending && pendingChange !== null) {
        throw new Error(
            `Unresolved Change Email pending for ${pendingChange.targetEmail} (phase: ${pendingChange.phase}, runId: ${pendingChange.runId}). Reconcile with staging/Gmail before retrying.`
        );
    }
    return {
        schemaVersion: CHANGE_EMAIL_SCHEMA_VERSION,
        localBase,
        domain,
        nextTargetIndex,
        highWaterMark,
        pendingChange,
    };
}

export function readChangeEmailState(
    statePath: string,
    localBase: string,
    domain: string,
    options?: ReadChangeEmailStateOptions
): ChangeEmailState {
    return readChangeEmailStateContents(statePath, localBase, domain, options);
}

type WriteFn = (statePath: string, state: ChangeEmailState) => void;
let writeOverride: WriteFn | null = null;

export function setWriteChangeEmailStateOverride(fn: WriteFn | null): void {
    writeOverride = fn;
}

function writeAtomicDefault(statePath: string, state: ChangeEmailState): void {
    if (state.nextTargetIndex < state.highWaterMark) {
        throw new Error('Internal error: nextTargetIndex < highWaterMark on write');
    }
    if (state.pendingChange) {
        validatePendingChange(
            state.pendingChange,
            state.localBase,
            state.domain,
            state.highWaterMark
        );
    }
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, statePath);
}

export function writeChangeEmailStateAtomic(statePath: string, state: ChangeEmailState): void {
    if (writeOverride) {
        writeOverride(statePath, state);
        return;
    }
    writeAtomicDefault(statePath, state);
}

export function acquireChangeEmailLock(
    lockPath: string,
    metadata: ChangeEmailLockMetadata
): void {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
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
                `Cannot acquire ${CHANGE_EMAIL_LOCK_FILENAME}. Another Change Email run may be active, or reconcile pendingChange before removing a stale lock.`
            );
        }
        throw err;
    }
    try {
        fs.writeFileSync(fd, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

export function releaseChangeEmailLock(lockPath: string, runId: string): void {
    if (!fs.existsSync(lockPath)) {
        return;
    }
    try {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as ChangeEmailLockMetadata;
        if (lock.runId === runId) {
            fs.unlinkSync(lockPath);
        }
    } catch {
        /* keep lock if ownership unknown */
    }
}

/**
 * Read-only preflight for full E2E: no lock acquisition, no target reservation, no writes.
 */
export function preflightChangeEmailAllocation(
    repoRoot: string,
    localBase: string,
    domain: string
): void {
    const statePath = changeEmailStateFilePath(repoRoot);
    const lockPath = changeEmailLockFilePath(repoRoot);
    if (fs.existsSync(lockPath)) {
        throw new Error(
            `Change Email preflight failed: ${CHANGE_EMAIL_LOCK_FILENAME} exists at ${lockPath}. Another run may be active; reconcile before starting full E2E.`
        );
    }
    const state = readChangeEmailState(statePath, localBase, domain);
    assertTwoDotTargetAvailable(state.nextTargetIndex, localBase);
}

export function assertTwoDotTargetAvailable(nextTargetIndex: number, localBase: string): void {
    const poolSize = twoDotPoolSize(localBase);
    if (nextTargetIndex >= poolSize) {
        throw new Error(
            `Two-dot Change Email pool exhausted (${poolSize} targets). Extend strategy before running again.`
        );
    }
}

export function persistPendingTargetReserved(
    statePath: string,
    localBase: string,
    domain: string,
    pending: ChangeEmailPending
): void {
    const current = readChangeEmailStateContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    if (current.pendingChange !== null) {
        throw new Error('Internal error: pendingChange already set');
    }
    writeChangeEmailStateAtomic(statePath, { ...current, pendingChange: pending });
}

export function persistOtpRequestSubmitted(
    statePath: string,
    localBase: string,
    domain: string,
    runId: string
): void {
    const current = readChangeEmailStateContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = current.pendingChange;
    if (!pending || pending.runId !== runId || pending.phase !== 'target_reserved') {
        throw new Error('Internal error: expected target_reserved pending for this run');
    }
    writeChangeEmailStateAtomic(statePath, {
        ...current,
        pendingChange: {
            ...pending,
            phase: 'otp_request_submitted',
            otpRequestSubmittedAt: new Date().toISOString(),
        },
    });
}

export function persistConfirmationSubmitted(
    statePath: string,
    localBase: string,
    domain: string,
    runId: string
): void {
    const current = readChangeEmailStateContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = current.pendingChange;
    if (
        !pending ||
        pending.runId !== runId ||
        pending.phase !== 'otp_request_submitted' ||
        !pending.otpRequestSubmittedAt
    ) {
        throw new Error('Internal error: expected otp_request_submitted pending for this run');
    }
    writeChangeEmailStateAtomic(statePath, {
        ...current,
        pendingChange: {
            ...pending,
            phase: 'confirmation_submitted',
            confirmationSubmittedAt: new Date().toISOString(),
        },
    });
}

export function commitChangeEmailSuccess(
    statePath: string,
    localBase: string,
    domain: string,
    runId: string,
    targetIndex: number
): void {
    const current = readChangeEmailStateContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = current.pendingChange;
    if (
        !pending ||
        pending.runId !== runId ||
        pending.phase !== 'confirmation_submitted' ||
        pending.targetIndex !== targetIndex
    ) {
        throw new Error('Internal error: expected confirmation_submitted pending before commit');
    }
    const newNext = Math.max(current.nextTargetIndex, current.highWaterMark, targetIndex + 1);
    writeChangeEmailStateAtomic(statePath, {
        ...current,
        nextTargetIndex: newNext,
        highWaterMark: newNext,
        pendingChange: null,
    });
    console.log(
        `Change Email target index ${targetIndex} committed. nextTargetIndex=${newNext}`
    );
}

export type ExpectedAbandonedPendingRetirement = {
    targetIndex: number;
    currentEmail: string;
    targetEmail: string;
};

/**
 * Validates pending for conservative retirement (abandoned OTP flow — not a successful commit).
 */
export function validateExpectedAbandonedPendingForRetirement(
    state: ChangeEmailState,
    expected: ExpectedAbandonedPendingRetirement
): ChangeEmailPending {
    const pending = state.pendingChange;
    if (!pending) {
        throw new Error('Change Email retirement requires pendingChange; none is set.');
    }
    if (pending.phase !== 'otp_request_submitted') {
        throw new Error(
            `Change Email retirement expects phase otp_request_submitted, got ${pending.phase}.`
        );
    }
    if (pending.targetIndex !== expected.targetIndex) {
        throw new Error(
            `Change Email retirement targetIndex mismatch: expected ${expected.targetIndex}, got ${pending.targetIndex}.`
        );
    }
    if (pending.currentEmail !== expected.currentEmail) {
        throw new Error('Change Email retirement currentEmail does not match expected.');
    }
    if (pending.targetEmail !== expected.targetEmail) {
        throw new Error('Change Email retirement targetEmail does not match expected.');
    }
    if (pending.confirmationSubmittedAt !== undefined) {
        throw new Error(
            'Change Email retirement refuses pending with confirmationSubmittedAt already set.'
        );
    }
    if (!pending.otpRequestSubmittedAt) {
        throw new Error('Change Email retirement requires otpRequestSubmittedAt on pending.');
    }
    return pending;
}

/**
 * Retire an abandoned target: forward-only counters, clear pending (not commitChangeEmailSuccess).
 */
export function retireAbandonedChangeEmailTargetAtomic(
    statePath: string,
    localBase: string,
    domain: string,
    expected: ExpectedAbandonedPendingRetirement
): { newNext: number; retiredTargetIndex: number } {
    const current = readChangeEmailStateContents(statePath, localBase, domain, {
        allowUnresolvedPending: true,
    });
    const pending = validateExpectedAbandonedPendingForRetirement(current, expected);
    const newNext = Math.max(
        current.nextTargetIndex,
        current.highWaterMark,
        pending.targetIndex + 1
    );
    writeChangeEmailStateAtomic(statePath, {
        ...current,
        nextTargetIndex: newNext,
        highWaterMark: newNext,
        pendingChange: null,
    });
    console.log(
        `Change Email target index ${pending.targetIndex} retired (abandoned). nextTargetIndex=${newNext}`
    );
    return { newNext, retiredTargetIndex: pending.targetIndex };
}

export type ExpectedSuccessCommitPending = {
    targetIndex: number;
    currentEmail: string;
    targetEmail: string;
};

export function validateExpectedSuccessCommitPending(
    state: ChangeEmailState,
    expected: ExpectedSuccessCommitPending
): ChangeEmailPending {
    const pending = state.pendingChange;
    if (!pending) {
        throw new Error('Change Email success commit requires pendingChange; none is set.');
    }
    if (pending.phase !== 'confirmation_submitted') {
        throw new Error(
            `Change Email success commit expects phase confirmation_submitted, got ${pending.phase}.`
        );
    }
    if (pending.targetIndex !== expected.targetIndex) {
        throw new Error(
            `Change Email success commit targetIndex mismatch: expected ${expected.targetIndex}, got ${pending.targetIndex}.`
        );
    }
    if (pending.currentEmail !== expected.currentEmail) {
        throw new Error('Change Email success commit currentEmail does not match expected.');
    }
    if (pending.targetEmail !== expected.targetEmail) {
        throw new Error('Change Email success commit targetEmail does not match expected.');
    }
    if (!pending.otpRequestSubmittedAt || !pending.confirmationSubmittedAt) {
        throw new Error(
            'Change Email success commit requires otpRequestSubmittedAt and confirmationSubmittedAt.'
        );
    }
    return pending;
}

export function createChangeEmailRunId(): string {
    return crypto.randomUUID();
}

/** @internal for tests — documents single-dot builder used by registration pool check */
export { emailWithDotAt };
