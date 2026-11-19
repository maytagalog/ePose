import { test, expect } from '@playwright/test';
import {
    extractRegistrationVerificationUrlFromEmailBody,
    assertRecoverableApplicationSubmitPending,
    RegistrationEmailRecoveryError,
} from './registrationEmailRecovery';
import type { EmailState } from './emailState';

function baseState(): EmailState {
    return {
        schemaVersion: 3,
        localBase: 'aardvarkomonstrosesquip1230000',
        domain: 'gmail.com',
        nextDotPosition: 30,
        highWaterMark: 30,
        allocationPool: 'three_dot',
        nextThreeDotIndex: 4,
        threeDotHighWaterMark: 4,
        pendingVerification: {
            allocationPool: 'three_dot',
            threeDotIndex: 4,
            threeDotGaps: [1, 2, 7],
            email: 'a.a.rdvar.komonstrosesquip1230000@gmail.com',
            phase: 'application_submit_pending',
            runId: 'run-1',
            hostname: 'h',
            pid: 1,
            startedAt: '2026-11-17T09:09:59.902Z',
            applicationSubmitAttemptedAt: '2026-11-17T09:10:15.892Z',
        },
    };
}

test('extractRegistrationVerificationUrlFromEmailBody parses staging-style anchor', () => {
    const url = 'https://app-stg.epose.com/application/verification?token=abc';
    const html = `<a href="${url}">メール認証ページはこちら</a>`;
    expect(extractRegistrationVerificationUrlFromEmailBody(html)).toBe(url);
});

test('assertRecoverableApplicationSubmitPending rejects otp_submitted', () => {
    const state = baseState();
    state.pendingVerification = {
        ...state.pendingVerification!,
        phase: 'otp_submitted',
        otpSubmittedAt: '2026-11-17T09:11:00.000Z',
    };
    expect(() => assertRecoverableApplicationSubmitPending(state)).toThrow(
        RegistrationEmailRecoveryError
    );
});