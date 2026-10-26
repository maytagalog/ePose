import { test } from '@playwright/test';
import { SmokePart2RunTracker } from './shared/smokePart2Reporting';
import type { LimitDialogFlowResult } from '../limitDialog/limitDialogFlow';
import type { ExistingUserCustomersReadiness } from '../login/existingUserLoginFlow';
import type { LogoutRunEvidence } from '../logout/logoutFlow';

/**
 * Local-only: emits Part 2 structured console lines for JUnit <system-out> verification.
 * Does not touch staging or results.xml from production smoke runs.
 */
test('synthetic Part 2 reporting events for JUnit system-out', () => {
    const tracker = new SmokePart2RunTracker('synthetic-part2@example.com');
    tracker.logRunStarted();

    tracker.stepStarted('login existing account');
    const loginReadiness = {
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' as const },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness;
    tracker.logLoginVerified(loginReadiness);
    tracker.stepCompleted('login existing account');

    tracker.stepStarted('limit dialog checks');
    const limitResult = {
        automaticOutcome: 'dismissed' as const,
        triggers: {
            plan_change: 'verified_dismissed' as const,
            quick_analysis: 'verified_dismissed' as const,
            new_analysis: 'verified_dismissed' as const,
        },
        prerequisites: {
            subscriptionObserved: true,
            subscriptionSnapshot: null,
            freePlanVerified: true,
            freePlanEvidence: [],
            neverPurchasedVerified: true,
            accountAge: { status: 'verified_over_14_days' as const, accountAgeDays: 30, sourceField: 'x' },
            paymentHistory: { status: 'probe_empty' as const, note: 'fixture' },
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
    tracker.logLimitDialogVerified(limitResult);
    tracker.stepCompleted('limit dialog checks');

    tracker.stepStarted('logout');
    const logoutEvidence: LogoutRunEvidence = {
        logoutAttempted: true,
        appRedirectVerified: true,
        loginFormVerified: true,
        protectedRouteRejected: true,
        finalPathname: '/login',
    };
    tracker.logLogoutVerified(logoutEvidence);
    tracker.stepCompleted('logout');

    tracker.logRunCompleted('https://app-stg.epose.com/login');
});

test('synthetic Part 2 failure reporting omits later feature passes', () => {
    const tracker = new SmokePart2RunTracker('synthetic-fail@example.com');
    tracker.logRunStarted();
    tracker.logLoginVerified({
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness);
    tracker.stepStarted('limit dialog checks');
    tracker.logRunFailed(new Error('Limit Dialog trigger missing'), 'https://app-stg.epose.com/customers');
});
