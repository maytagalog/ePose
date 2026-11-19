import { test, expect } from '@playwright/test';
import {
    SmokePart2RunTracker,
    buildPart2CirsRecordVerifiedPayload,
    buildPart2CirsTakeoverCrudVerifiedPayload,
    buildPart2LimitDialogVerifiedPayload,
    buildPart2LoginVerifiedPayload,
    buildPart2LogoutVerifiedPayload,
    sanitizeFailureReason,
} from './smokePart2Reporting';
import type { LimitDialogFlowResult } from '../../limitDialog/limitDialogFlow';
import type { ExistingUserCustomersReadiness } from '../../login/existingUserLoginFlow';

test('PART2_RUN_STARTED lists posture analysis navigation under activeCoverage', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new SmokePart2RunTracker('user@example.com');
        tracker.logRunStarted();
    } finally {
        console.log = original;
    }
    const startedLine = lines.find((line) => line.startsWith('PART2_RUN_STARTED '));
    expect(startedLine).toBeDefined();
    const payload = JSON.parse(startedLine!.slice('PART2_RUN_STARTED '.length));
    expect(payload.activeCoverage).toContain(
        'CIRS posture analysis navigation (analysis report list handoff)'
    );
    expect(payload.deferredCoverage).not.toContain('CIRS posture analysis');
    expect(payload.activeCoverage).toContain('Analysis Report view through history (deletion default off)');
    expect(payload.deferredCoverage).not.toContain('Analysis Report');
});

test('PART2_RUN_STARTED lists handover CRUD under activeCoverage', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new SmokePart2RunTracker('user@example.com');
        tracker.logRunStarted();
    } finally {
        console.log = original;
    }
    const startedLine = lines.find((line) => line.startsWith('PART2_RUN_STARTED '));
    expect(startedLine).toBeDefined();
    const payload = JSON.parse(startedLine!.slice('PART2_RUN_STARTED '.length));
    expect(payload.activeCoverage).toContain('Takeover handover CRUD');
    expect(payload.deferredCoverage).not.toContain('Takeover handover CRUD');
    expect(payload.deferredReasons['Takeover handover CRUD']).toBeUndefined();
});

test('logCirsTakeoverCrudVerified emits PART2_CIRS_TAKEOVER_CRUD_VERIFIED when CRUD passes', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    const tracker = new SmokePart2RunTracker('user@example.com');
    try {
        tracker.stepStarted('cirs takeover handover CRUD');
        tracker.logCirsTakeoverCrudVerified({
            customerId: 'cust-uuid',
            recordId: 'record-uuid',
            handoverId: '212',
            createVerified: true,
            readVerified: true,
            updateVerified: true,
            deleteVerified: true,
            handoverRetainedOnStaging: false,
        });
    } finally {
        console.log = original;
    }
    expect(tracker.outcomes.cirsTakeoverHandover).toBe('passed');
    expect(tracker.lastCompletedStep).toBe('cirs takeover handover CRUD');
    const verifiedLine = lines.find((line) => line.startsWith('PART2_CIRS_TAKEOVER_CRUD_VERIFIED '));
    expect(verifiedLine).toBeDefined();
    const payload = JSON.parse(verifiedLine!.slice('PART2_CIRS_TAKEOVER_CRUD_VERIFIED '.length));
    expect(payload).toEqual(
        buildPart2CirsTakeoverCrudVerifiedPayload('user@example.com', {
            customerId: 'cust-uuid',
            recordId: 'record-uuid',
            handoverId: '212',
            createVerified: true,
            readVerified: true,
            updateVerified: true,
            deleteVerified: true,
            handoverRetainedOnStaging: false,
        })
    );
});

test('SmokePart2RunTracker marks handover failed and logout not_reached when handover CRUD fails', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.logCirsHandwrittenDeleteVerified({
        customerId: 'c1',
        recordId: 'r1',
        noteId: 'note-1',
        createAttempted: true,
        createServerConfirmed: true,
        createIdentityVerified: true,
        noteIdentitySource: 'save_memo_response',
        listVerificationStatus: 'verified',
        noteRetainedOnStaging: false,
        updateAttempted: true,
        updateVerified: true,
        deleteAttempted: true,
        deleteServerConfirmed: true,
        deleteVerified: true,
    });
    tracker.stepStarted('cirs takeover handover CRUD');
    tracker.logRunFailed(new Error('handover update footer disabled'), 'https://app-stg.epose.com/customers/c1/interaction-records/r1');

    expect(tracker.lastStartedStep).toBe('cirs takeover handover CRUD');
    expect(tracker.lastCompletedStep).toBe('cirs handwritten note delete');
    expect(tracker.outcomes.cirsTakeoverHandover).toBe('failed');
    expect(tracker.outcomes.cirsPostureAnalysis).toBe('not_reached');
    expect(tracker.outcomes.analysisReport).toBe('not_reached');
    expect(tracker.outcomes.logout).toBe('not_reached');
});

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
        cirsRecordNavigation: 'not_reached',
        cirsResponseDetails: 'not_reached',
        cirsHandwrittenNotes: 'not_reached',
        cirsTakeoverHandover: 'not_reached',
        cirsPostureAnalysis: 'not_reached',
        analysisReport: 'not_reached',
        comparisonReport: 'not_reached',
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
        cirsRecordNavigation: 'not_reached',
        cirsResponseDetails: 'not_reached',
        cirsHandwrittenNotes: 'not_reached',
        cirsTakeoverHandover: 'not_reached',
        cirsPostureAnalysis: 'not_reached',
        analysisReport: 'not_reached',
        comparisonReport: 'not_reached',
        logout: 'not_reached',
    });
    expect(sanitizeFailureReason(new Error('x'.repeat(600))).length).toBeLessThanOrEqual(500);
});

test('buildPart2CirsRecordVerifiedPayload includes customerId and recordId only', () => {
    const payload = buildPart2CirsRecordVerifiedPayload('user@example.com', {
        customerId: 'cust-uuid',
        recordId: 'record-uuid',
        recordUrl: 'https://app-stg.epose.com/customers/cust-uuid/interaction-records/record-uuid',
        createAttempted: true,
        createConfirmed: true,
        recordIdentitySource: 'api_and_route',
    });
    expect(payload.customerId).toBe('cust-uuid');
    expect(payload.recordId).toBe('record-uuid');
    expect(payload.recordPathname).toBe('/customers/cust-uuid/interaction-records/record-uuid');
    expect(JSON.stringify(payload)).not.toContain('apiParseNotes');
});

test('SmokePart2RunTracker marks CIRS failed and logout not_reached when CIRS step fails after limit dialog', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.logLoginVerified({
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness);
    tracker.logLimitDialogVerified({
        automaticOutcome: 'dismissed',
        triggers: {
            plan_change: 'verified_dismissed',
            quick_analysis: 'verified_dismissed',
            new_analysis: 'verified_dismissed',
        },
        prerequisites: {
            subscriptionObserved: false,
            subscriptionSnapshot: null,
            freePlanVerified: true,
            freePlanEvidence: [],
            neverPurchasedVerified: true,
            accountAge: { status: 'verified_over_14_days', accountAgeDays: 30, sourceField: 'x' },
            paymentHistory: { status: 'probe_empty', note: 'fixture' },
        },
        selectedCustomer: null,
        finalPathname: '/customers',
        loginReadinessPreserved: {
            profileEmailVerified: true,
            identityEvidenceStatus: 'verified',
            takeoverDetected: false,
            takeoverConfirmed: false,
        },
    } as LimitDialogFlowResult);
    tracker.stepStarted('cirs record creation and list navigation');
    tracker.logRunFailed(new Error('CIRS preview mismatch'), 'https://app-stg.epose.com/customers/x');

    expect(tracker.lastStartedStep).toBe('cirs record creation and list navigation');
    expect(tracker.lastCompletedStep).toBe('limit dialog checks');
    expect(tracker.outcomes).toEqual({
        login: 'passed',
        limitDialog: 'passed',
        cirsRecordNavigation: 'failed',
        cirsResponseDetails: 'not_reached',
        cirsHandwrittenNotes: 'not_reached',
        cirsTakeoverHandover: 'not_reached',
        cirsPostureAnalysis: 'not_reached',
        analysisReport: 'not_reached',
        comparisonReport: 'not_reached',
        logout: 'not_reached',
    });
});

test('SmokePart2RunTracker preserves CIRS navigation step when Response Details fails', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.logLoginVerified({
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness);
    tracker.logLimitDialogVerified({
        automaticOutcome: 'dismissed',
        triggers: {
            plan_change: 'verified_dismissed',
            quick_analysis: 'verified_dismissed',
            new_analysis: 'verified_dismissed',
        },
        prerequisites: {
            subscriptionObserved: false,
            subscriptionSnapshot: null,
            freePlanVerified: true,
            freePlanEvidence: [],
            neverPurchasedVerified: true,
            accountAge: { status: 'verified_over_14_days', accountAgeDays: 30, sourceField: 'x' },
            paymentHistory: { status: 'probe_empty', note: 'fixture' },
        },
        selectedCustomer: null,
        finalPathname: '/customers',
        loginReadinessPreserved: {
            profileEmailVerified: true,
            identityEvidenceStatus: 'verified',
            takeoverDetected: false,
            takeoverConfirmed: false,
        },
    } as LimitDialogFlowResult);
    tracker.logCirsRecordNavigationVerified({
        customerId: 'c1',
        recordId: 'r1',
        recordUrl: 'https://app-stg.epose.com/customers/c1/interaction-records/r1',
        createAttempted: true,
        createConfirmed: true,
        recordIdentitySource: 'api_and_route',
    });
    tracker.stepStarted('cirs response details');
    tracker.logRunFailed(new Error('autosave timeout'), 'https://app-stg.epose.com/customers/c1/interaction-records/r1');

    expect(tracker.lastStartedStep).toBe('cirs response details');
    expect(tracker.lastCompletedStep).toBe('cirs record creation and list navigation');
    expect(tracker.outcomes).toEqual({
        login: 'passed',
        limitDialog: 'passed',
        cirsRecordNavigation: 'passed',
        cirsResponseDetails: 'failed',
        cirsHandwrittenNotes: 'not_reached',
        cirsTakeoverHandover: 'not_reached',
        cirsPostureAnalysis: 'not_reached',
        analysisReport: 'not_reached',
        comparisonReport: 'not_reached',
        logout: 'not_reached',
    });
});

test('SmokePart2RunTracker preserves response details step when handwritten notes fails', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.logCirsResponseDetailsVerified({
        customerId: 'c1',
        recordId: 'r1',
        expectedText: 'Staging Smoke Automation Testing 2026-10-27',
        saveOutcome: 'saved_after_edit',
        savedTimestamp: '2026-10-27T10:00:00.000Z',
    });
    tracker.stepStarted('cirs handwritten note creation');
    tracker.logRunFailed(new Error('handwritten create failed'), 'https://app-stg.epose.com/customers/c1/interaction-records/r1');

    expect(tracker.lastStartedStep).toBe('cirs handwritten note creation');
    expect(tracker.lastCompletedStep).toBe('cirs response details');
    expect(tracker.outcomes.cirsHandwrittenNotes).toBe('failed');
    expect(tracker.outcomes.cirsTakeoverHandover).toBe('not_reached');
    expect(tracker.outcomes.analysisReport).toBe('not_reached');
    expect(tracker.outcomes.logout).toBe('not_reached');
});

test('logCirsRecordNavigationVerified completes CIRS step', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.stepStarted('cirs record creation and list navigation');
    tracker.logCirsRecordNavigationVerified({
        customerId: 'c1',
        recordId: 'r1',
        recordUrl: 'https://app-stg.epose.com/customers/c1/interaction-records/r1',
        createAttempted: true,
        createConfirmed: true,
        recordIdentitySource: 'api_and_route',
    });
    expect(tracker.lastCompletedStep).toBe('cirs record creation and list navigation');
    expect(tracker.outcomes.cirsRecordNavigation).toBe('passed');
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
