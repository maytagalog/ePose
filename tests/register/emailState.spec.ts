import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    acquireExclusiveLock,
    assertManualOverrideAllowed,
    buildEmail,
    clearPendingSelectedOnly,
    commitEmailConsumed,
    DEFAULT_DOMAIN,
    DEFAULT_LOCAL_BASE,
    E2E_EMAIL_LOCK_FILENAME,
    E2E_EMAIL_STATE_FILENAME,
    lockFilePath,
    persistApplicationSubmitPending,
    persistOtpSubmitted,
    persistPendingSelected,
    parseManualDotPosition,
    readEmailState,
    releaseExclusiveLock,
    resolveDotPosition,
    setWriteEmailStateAtomicOverride,
    stateFilePath,
    writeEmailStateAtomic,
    type EmailState,
} from './emailState';

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
    return fs.mkdtempSync(path.join(os.tmpdir(), 'epose-email-state-'));
}

test.describe('emailState helpers', () => {
    test.afterEach(() => {
        setWriteEmailStateAtomicOverride(null);
    });

    test('missing state file fails closed', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        expect(() =>
            readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN)
        ).toThrow(/Email state file is missing/);
    });

    test('malformed pending email/position fails read', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        fs.writeFileSync(
            statePath,
            JSON.stringify(
                {
                    schemaVersion: 2,
                    localBase: DEFAULT_LOCAL_BASE,
                    domain: DEFAULT_DOMAIN,
                    nextDotPosition: 0,
                    highWaterMark: 0,
                    pendingVerification: {
                        dotPosition: 2,
                        email: 'wrong@gmail.com',
                        phase: 'selected',
                        runId: 'run-1',
                        hostname: 'host',
                        pid: 1,
                        startedAt: new Date().toISOString(),
                    },
                },
                null,
                2
            )
        );

        expect(() =>
            readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, {
                allowUnresolvedPending: true,
            })
        ).toThrow(/pendingVerification.email must be/);
    });

    test('mutation helpers reject unsupported schema without modifying file', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        const invalid = {
            schemaVersion: 99,
            localBase: DEFAULT_LOCAL_BASE,
            domain: DEFAULT_DOMAIN,
            nextDotPosition: 0,
            highWaterMark: 0,
            pendingVerification: null,
        };
        fs.writeFileSync(statePath, JSON.stringify(invalid, null, 2));

        expect(() =>
            persistPendingSelected(
                statePath,
                DEFAULT_LOCAL_BASE,
                DEFAULT_DOMAIN,
                0,
                buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0),
                'run-1'
            )
        ).toThrow(/unsupported schemaVersion/);

        expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toEqual(invalid);
    });

    test('mutation helpers reject localBase mismatch without modifying file', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        const invalid = {
            schemaVersion: 2,
            localBase: 'wrong-local-base',
            domain: DEFAULT_DOMAIN,
            nextDotPosition: 0,
            highWaterMark: 0,
            pendingVerification: null,
        };
        fs.writeFileSync(statePath, JSON.stringify(invalid, null, 2));

        expect(() =>
            persistPendingSelected(
                statePath,
                DEFAULT_LOCAL_BASE,
                DEFAULT_DOMAIN,
                0,
                buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0),
                'run-1'
            )
        ).toThrow(/localBase mismatch/);

        expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toEqual(invalid);
    });

    test('mutation helpers reject missing pendingVerification field without modifying file', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        const invalid = {
            schemaVersion: 2,
            localBase: DEFAULT_LOCAL_BASE,
            domain: DEFAULT_DOMAIN,
            nextDotPosition: 0,
            highWaterMark: 0,
        };
        fs.writeFileSync(statePath, JSON.stringify(invalid, null, 2));

        expect(() =>
            persistPendingSelected(
                statePath,
                DEFAULT_LOCAL_BASE,
                DEFAULT_DOMAIN,
                0,
                buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0),
                'run-1'
            )
        ).toThrow(/missing pendingVerification field/);

        expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toEqual(invalid);
    });

    test('blocking pending prevents new registration read', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        const email = buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 1);
        writeEmailStateAtomic(
            statePath,
            makeBaseState({
                nextDotPosition: 1,
                highWaterMark: 1,
                pendingVerification: {
                    dotPosition: 1,
                    email,
                    phase: 'application_submit_pending',
                    runId: 'run-1',
                    hostname: 'host',
                    pid: 1,
                    startedAt: new Date().toISOString(),
                    applicationSubmitAttemptedAt: new Date().toISOString(),
                },
            })
        );

        expect(() =>
            readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN)
        ).toThrow(/Unresolved pending verification/);
    });

    test('failure before application boundary clears selected only', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-selected-clear';
        const email = buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0);
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            0,
            email,
            runId
        );

        clearPendingSelectedOnly(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );

        const state = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN);
        expect(state.pendingVerification).toBeNull();
    });

    test('application_submit_pending is not cleared by clearPendingSelectedOnly', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-app-pending';
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

        clearPendingSelectedOnly(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );

        const raw = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, {
            allowUnresolvedPending: true,
        });
        expect(raw.pendingVerification?.phase).toBe('application_submit_pending');
    });

    test('commit consumption advances counters and clears pending', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(
            statePath,
            makeBaseState({ nextDotPosition: 3, highWaterMark: 3 })
        );

        const runId = 'run-consume';
        const dotPosition = 3;
        const email = buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, dotPosition);
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            dotPosition,
            email,
            runId
        );
        persistApplicationSubmitPending(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId
        );
        persistOtpSubmitted(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, runId);

        commitEmailConsumed(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId,
            dotPosition
        );

        const state = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN);
        expect(state.nextDotPosition).toBe(4);
        expect(state.highWaterMark).toBe(4);
        expect(state.pendingVerification).toBeNull();
    });

    test('commit uses Math.max with highWaterMark and nextDotPosition', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(
            statePath,
            makeBaseState({ nextDotPosition: 8, highWaterMark: 8 })
        );

        const runId = 'run-max';
        const dotPosition = 5;
        const email = buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, dotPosition);
        writeEmailStateAtomic(
            statePath,
            makeBaseState({
                nextDotPosition: 8,
                highWaterMark: 8,
                pendingVerification: {
                    dotPosition,
                    email,
                    phase: 'otp_submitted',
                    runId,
                    hostname: 'host',
                    pid: 1,
                    startedAt: new Date().toISOString(),
                    applicationSubmitAttemptedAt: new Date().toISOString(),
                    otpSubmittedAt: new Date().toISOString(),
                },
            })
        );

        commitEmailConsumed(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            runId,
            dotPosition
        );

        const state = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN);
        expect(state.nextDotPosition).toBe(8);
        expect(state.highWaterMark).toBe(8);
    });

    test('persistOtpSubmitted requires application_submit_pending', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-otp-order';
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            0,
            buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, 0),
            runId
        );

        expect(() =>
            persistOtpSubmitted(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, runId)
        ).toThrow(/application_submit_pending/);
    });

    test('persistApplicationSubmitPending requires selected', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        expect(() =>
            persistApplicationSubmitPending(
                statePath,
                DEFAULT_LOCAL_BASE,
                DEFAULT_DOMAIN,
                'missing-run'
            )
        ).toThrow(/expected selected pending/);
    });

    test('exclusive lock prevents second acquisition', () => {
        const dir = initDir();
        const lockPath = lockFilePath(dir);
        const meta = {
            runId: 'lock-1',
            pid: process.pid,
            hostname: os.hostname(),
            acquiredAt: new Date().toISOString(),
        };

        acquireExclusiveLock(lockPath, meta);
        expect(() =>
            acquireExclusiveLock(lockPath, {
                ...meta,
                runId: 'lock-2',
            })
        ).toThrow(/Cannot acquire/);

        releaseExclusiveLock(lockPath, 'lock-1');
        acquireExclusiveLock(lockPath, { ...meta, runId: 'lock-3' });
        releaseExclusiveLock(lockPath, 'lock-3');
    });

    test('release does not remove lock owned by another runId', () => {
        const dir = initDir();
        const lockPath = lockFilePath(dir);
        acquireExclusiveLock(lockPath, {
            runId: 'owner',
            pid: process.pid,
            hostname: os.hostname(),
            acquiredAt: new Date().toISOString(),
        });

        releaseExclusiveLock(lockPath, 'other-run');
        expect(fs.existsSync(lockPath)).toBe(true);
        releaseExclusiveLock(lockPath, 'owner');
    });

    test('manual position behind counter is rejected', () => {
        expect(() => assertManualOverrideAllowed(2, 8)).toThrow(/behind saved nextDotPosition/);
        expect(() =>
            resolveDotPosition(
                makeBaseState({ nextDotPosition: 8, highWaterMark: 8 }),
                '2',
                DEFAULT_LOCAL_BASE.length
            )
        ).toThrow(/behind saved nextDotPosition/);
    });

    test('exhaustion at nextDotPosition 30', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(
            statePath,
            makeBaseState({ nextDotPosition: 30, highWaterMark: 30 })
        );

        const state = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN);
        expect(() =>
            resolveDotPosition(state, undefined, DEFAULT_LOCAL_BASE.length)
        ).toThrow(/All single-dot Gmail variants have already been consumed/);
    });

    test('commit write failure leaves blocking otp_submitted pending', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        writeEmailStateAtomic(statePath, makeBaseState());

        const runId = 'run-commit-fail';
        const dotPosition = 0;
        const email = buildEmail(DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, dotPosition);
        persistPendingSelected(
            statePath,
            DEFAULT_LOCAL_BASE,
            DEFAULT_DOMAIN,
            dotPosition,
            email,
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

    test('parseManualDotPosition accepts valid decimal integers', () => {
        expect(parseManualDotPosition('0', DEFAULT_LOCAL_BASE.length)).toBe(0);
        expect(parseManualDotPosition('29', DEFAULT_LOCAL_BASE.length)).toBe(29);
        expect(parseManualDotPosition('12', DEFAULT_LOCAL_BASE.length)).toBe(12);
    });

    test('parseManualDotPosition rejects invalid formats', () => {
        const max = DEFAULT_LOCAL_BASE.length - 1;
        const cases = ['', '   ', ' 5', '5 ', '1e2', '0x10', '-1', '3.14', '29.0'];
        for (const raw of cases) {
            expect(() => parseManualDotPosition(raw, DEFAULT_LOCAL_BASE.length)).toThrow();
        }
        expect(() => parseManualDotPosition(String(max + 1), DEFAULT_LOCAL_BASE.length)).toThrow();
    });

    test('nextDotPosition less than highWaterMark is invalid', () => {
        const dir = initDir();
        const statePath = stateFilePath(dir);
        fs.writeFileSync(
            statePath,
            JSON.stringify(
                {
                    schemaVersion: 2,
                    localBase: DEFAULT_LOCAL_BASE,
                    domain: DEFAULT_DOMAIN,
                    nextDotPosition: 3,
                    highWaterMark: 8,
                    pendingVerification: null,
                },
                null,
                2
            )
        );

        expect(() =>
            readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN)
        ).toThrow(/less than highWaterMark/);
    });
});
