import { test, expect } from '@playwright/test';
import { SmokePart2RunTracker } from '../../shared/smokePart2Reporting';
import type { ExistingUserCustomersReadiness } from '../../../login/existingUserLoginFlow';

test('posture list handoff posture outcome accepts deferred report opening', () => {
    const tracker = new SmokePart2RunTracker('handoff-fixture@example.com');
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
    expect(tracker.outcomes.cirsPostureAnalysis).toBe('passed');
});

test('analysis report failure leaves logout not_reached', () => {
    const tracker = new SmokePart2RunTracker('ar-fail-fixture@example.com');
    tracker.logRunStarted();
    tracker.logLoginVerified({
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness);
    tracker.logAnalysisReportVerified({
        sourceCustomerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceAnalysisId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        deletionMode: 'off',
        reportDeletionStage: 'Skipped',
        combinedPassed: true,
        runOutputRoot: 'test-output/analysisReportFull/fixture',
        featureStages: { reportDeletion: 'Skipped' },
    });
    tracker.stepStarted('logout');
    tracker.logRunFailed(new Error('logout timeout'), 'https://app-stg.epose.com/customers');
    expect(tracker.outcomes.analysisReport).toBe('passed');
    expect(tracker.outcomes.logout).toBe('failed');
});

test('earlier posture failure keeps analysis report not_reached', () => {
    const tracker = new SmokePart2RunTracker('early-fail@example.com');
    tracker.logRunStarted();
    tracker.stepStarted('cirs posture analysis navigation');
    tracker.logRunFailed(new Error('list load failed'), 'https://app-stg.epose.com/customers');
    expect(tracker.outcomes.cirsPostureAnalysis).toBe('failed');
    expect(tracker.outcomes.analysisReport).toBe('not_reached');
    expect(tracker.outcomes.logout).toBe('not_reached');
});
