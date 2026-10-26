import { test, expect } from '@playwright/test';
import {
    SmokePart2RunTracker,
    buildPart2LimitDialogVerifiedPayload,
    buildPart2LoginVerifiedPayload,
    buildPart2LogoutVerifiedPayload,
    sanitizeFailureReason,
} from './smokePart2Reporting';
import type { LimitDialogFlowResult } from '../../limitDialog/limitDialogFlow';
import type { ExistingUserCustomersReadiness } from '../../login/existingUserLoginFlow';

test('buildPart2LoginVerifiedPayload uses allowlisted fields only', () => {
    const readiness = {
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' as const, authProfile: { email: 'secret@example.com' } },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness;

    const payload = buildPart2LoginVerifiedPayload('user@example.com', readiness);
    expect(payload).toEqual({
        accountEmail: 'user@example.com',
        identityEvidenceStatus: 'verified',
        profileEmailVerified: true,
        sessionTakeoverDetected: false,
        sessionTakeoverConfirmed: false,
    });
    expect(JSON.stringify(payload)).not.toContain('authProfile');
});

test('buildPart2LimitDialogVerifiedPayload preserves inconclusive evidence without upgrading', () => {
    const result = {
        automaticOutcome: 'not_shown' as const,
        triggers: {
            plan_change: 'verified_dismissed' as const,
            quick_analysis: 'verified_dismissed' as const,
            new_analysis: 'verified_dismissed' as const,
        },
        prerequisites: {
            subscriptionObserved: false,
            subscriptionSnapshot: null,
            freePlanVerified: 'inconclusive' as const,
            freePlanEvidence: [],
            neverPurchasedVerified: 'inconclusive' as const,
            accountAge: { status: 'not_verifiable' as const, reason: 'fixture' },
            paymentHistory: { status: 'not_observed' as const, reason: 'fixture' },
        },
        selectedCustomer: null,
        finalPathname: '/customers',
        loginReadinessPreserved: {
            profileEmailVerified: true,
            identityEvidenceStatus: 'verified' as const,
            takeoverDetected: false,
            takeoverConfirmed: false,
        },
    } as LimitDialogFlowResult;

    const payload = buildPart2LimitDialogVerifiedPayload('user@example.com', result);
    expect(payload.freePlanVerified).toBe('inconclusive');
    expect(payload.neverPurchasedVerified).toBe('inconclusive');
    expect(payload.accountAgeStatus).toBe('not_verifiable');
    expect(payload.paymentHistoryStatus).toBe('not_observed');
    expect(JSON.stringify(payload)).not.toContain('subscriptionSnapshot');
});

test('SmokePart2RunTracker keeps lastCompletedStep after login when limit dialog step starts and fails', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.logLoginVerified({
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness);
    tracker.stepStarted('limit dialog checks');
    tracker.logRunFailed(new Error('Limit Dialog trigger missing'), 'https://app-stg.epose.com/customers');

    expect(tracker.lastStartedStep).toBe('limit dialog checks');
    expect(tracker.lastCompletedStep).toBe('login existing account');
    expect(tracker.outcomes).toEqual({
        login: 'passed',
        limitDialog: 'failed',
        logout: 'not_reached',
    });
});

test('SmokePart2RunTracker marks later features not_reached on login failure', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.stepStarted('login existing account');
    tracker.logRunFailed(new Error('login timeout'), 'https://app-stg.epose.com/login');

    expect(tracker.outcomes).toEqual({
        login: 'failed',
        limitDialog: 'not_reached',
        logout: 'not_reached',
    });
    expect(sanitizeFailureReason(new Error('x'.repeat(600))).length).toBeLessThanOrEqual(500);
});

test('buildPart2LogoutVerifiedPayload allowlists logout evidence fields', () => {
    const payload = buildPart2LogoutVerifiedPayload('user@example.com', {
        logoutAttempted: true,
        appRedirectVerified: true,
        loginFormVerified: true,
        protectedRouteRejected: true,
        finalPathname: '/login',
    });
    expect(Object.keys(payload).sort()).toEqual(
        [
            'accountEmail',
            'appRedirectVerified',
            'finalPathname',
            'loginFormVerified',
            'logoutAttempted',
            'protectedRouteRejected',
        ].sort()
    );
});
