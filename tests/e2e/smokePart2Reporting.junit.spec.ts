import { test } from '@playwright/test';
import { SmokePart2RunTracker } from './shared/smokePart2Reporting';
import { logPart2TestmoCoverage } from './shared/part2TestmoReporting';
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

    tracker.stepStarted('cirs record creation and list navigation');
    tracker.logCirsRecordNavigationVerified({
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        recordUrl:
            'https://app-stg.epose.com/customers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/interaction-records/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        createAttempted: true,
        createConfirmed: true,
        recordIdentitySource: 'api_and_route',
    });
    tracker.stepCompleted('cirs record creation and list navigation');

    tracker.stepStarted('cirs response details');
    tracker.logCirsResponseDetailsVerified({
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        expectedText: 'Staging Smoke Automation Testing 2026-10-27',
        saveOutcome: 'saved_after_edit',
        savedTimestamp: '2026-10-27T10:00:00.000Z',
    });
    tracker.stepCompleted('cirs response details');

    tracker.stepStarted('cirs handwritten note creation');
    const handwrittenCreate = {
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        noteId: 'note-created-fixture',
        createAttempted: true,
        createServerConfirmed: true,
        createIdentityVerified: true,
        noteIdentitySource: 'save_memo_response',
        listVerificationStatus: 'verified',
        noteRetainedOnStaging: true,
    };
    tracker.logCirsHandwrittenCreateVerified(handwrittenCreate);

    tracker.stepStarted('cirs handwritten note update');
    tracker.logCirsHandwrittenUpdateVerified({
        ...handwrittenCreate,
        updateAttempted: true,
        updateVerified: true,
    });

    tracker.stepStarted('cirs handwritten note delete');
    tracker.logCirsHandwrittenDeleteVerified({
        ...handwrittenCreate,
        updateAttempted: true,
        updateVerified: true,
        deleteAttempted: true,
        deleteServerConfirmed: true,
        deleteVerified: true,
        noteRetainedOnStaging: false,
    });

    tracker.stepStarted('cirs takeover handover CRUD');
    tracker.logCirsTakeoverCrudVerified({
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        handoverId: 'handover-synthetic-fixture',
        createVerified: true,
        readVerified: true,
        updateVerified: true,
        deleteVerified: true,
        handoverRetainedOnStaging: false,
    });

    tracker.stepStarted('cirs posture analysis navigation');
    tracker.logCirsPostureAnalysisVerified({
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        analysisId: null,
        listLoadOutcome: 'populated',
        reportOpening: 'deferred_to_analysis_report_list_handoff',
        limitDialogVerified: true,
        navSummary: {
            newAnalysisLimitDialog: 'Passed',
            analysisListVerification: 'Passed',
            backToSelectedCustomerPage: 'Not reached',
            sameRecordReopen: 'Not reached',
            firstReportOpening: 'Deferred',
        },
    });

    tracker.stepStarted('analysis report combined smoke');
    tracker.logAnalysisReportVerified({
        sourceCustomerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceAnalysisId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        deletionMode: 'off',
        reportDeletionStage: 'Skipped',
        combinedPassed: true,
        runOutputRoot: 'test-output/analysisReportFull/synthetic-junit',
        featureStages: {
            login: 'Skipped',
            preflight: 'Passed',
            reportView: 'Passed',
            displaySettings: 'Passed',
            shareQr: 'Passed',
            shareEmail: 'Passed',
            reportPdf: 'Passed',
            reportHistory: 'Passed',
            reportDeletion: 'Skipped',
        },
    });
    tracker.stepStarted('comparison report combined smoke');
    tracker.logComparisonReportVerified({
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        returnedSingleReportAnalysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        combinedPassed: true,
        runOutputRoot: 'test-output/comparisonReport/synthetic-junit',
        featureStages: {
            customersNavigation: 'Passed',
            singleReportEntry: 'Passed',
            comparisonView: 'Passed',
            comparisonShareQr: 'Passed',
            comparisonShareEmail: 'Passed',
            comparisonReportPdf: 'Passed',
            exitComparison: 'Passed',
        },
    });

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

    logPart2TestmoCoverage({
        featureOutcomes: { ...tracker.outcomes },
        comparisonReport: {
            featureStages: {
                customersNavigation: 'Passed',
                singleReportEntry: 'Passed',
                comparisonView: 'Passed',
                comparisonShareQr: 'Passed',
                comparisonShareEmail: 'Passed',
                comparisonReportPdf: 'Passed',
                exitComparison: 'Passed',
            },
            combinedPassed: true,
            runOutputRoot: 'test-output/comparisonReport/synthetic-junit',
            reportPdf: null,
            exitComparison: {
                customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                returnedAnalysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
                stages: {
                    compareExitClick: 'Passed',
                    comparisonViewAbsent: 'Passed',
                    singleReportRouteIdentity: 'Passed',
                    singleReportReady: 'Passed',
                },
            },
        },
        analysisReport: {
            featureStages: {
                login: 'Skipped',
                preflight: 'Passed',
                reportView: 'Passed',
                displaySettings: 'Passed',
                shareQr: 'Passed',
                shareEmail: 'Passed',
                reportPdf: 'Passed',
                reportHistory: 'Passed',
                reportDeletion: 'Skipped',
            },
            deletionMode: 'off',
            combinedPassed: true,
            runOutputRoot: 'test-output/analysisReportFull/synthetic-junit',
            reportPdf: null,
            reportDeletion: null,
        },
    });

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

test('synthetic Part 2 handover failure leaves logout not_reached', () => {
    const tracker = new SmokePart2RunTracker('synthetic-handover-fail@example.com');
    tracker.logRunStarted();
    tracker.logCirsHandwrittenDeleteVerified({
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        recordId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        noteId: 'note-synthetic',
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
    tracker.logRunFailed(new Error('handover create toast timeout'), 'https://app-stg.epose.com/customers/c1/interaction-records/r1');
});
