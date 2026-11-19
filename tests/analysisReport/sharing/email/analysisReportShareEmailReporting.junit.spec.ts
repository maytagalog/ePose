import { test } from '@playwright/test';
import {
    AnalysisReportShareEmailRunTracker,
    allShareEmailVerificationsPassed,
    type AnalysisReportShareEmailRunEvidence,
} from './analysisReportShareEmailReporting';

const FIXTURE_EVIDENCE: AnalysisReportShareEmailRunEvidence = {
    customerId: 'ce3f36fd-07c3-4eda-ad87-35631acc39cc',
    analysisId: 'a871ea8f-c5e8-4fbd-b933-75fe8e2a144f',
    recipientEmail: 'aardvarkomonstrosesquip1230000@gmail.com',
    modalRecipientVerified: true,
    sendAttemptedOnce: true,
    sendSuccessToastVerified: true,
    gmailMessageId: 'synthetic-gmail-message-id',
    sharedReportUrl: 'https://app-stg.epose.com/shared-report?token=synthetic-token-value',
    sharedReportAnalysisVerified: true,
    failureStep: null,
};

/**
 * Local-only: emits share-email structured console lines for JUnit <system-out> verification.
 * Does not touch staging, Gmail, or production smoke results files.
 */
test('synthetic analysis report share email reporting for JUnit system-out', () => {
    const tracker = new AnalysisReportShareEmailRunTracker({
        accountEmail: 'synthetic-part2@example.com',
        customerId: FIXTURE_EVIDENCE.customerId,
        analysisId: FIXTURE_EVIDENCE.analysisId,
        recipientEmail: FIXTURE_EVIDENCE.recipientEmail,
    });
    tracker.logRunStarted();
    if (!allShareEmailVerificationsPassed(FIXTURE_EVIDENCE)) {
        throw new Error('fixture evidence must represent a full pass');
    }
    tracker.logVerified(FIXTURE_EVIDENCE);
});

test('synthetic analysis report share email failure reporting', () => {
    const tracker = new AnalysisReportShareEmailRunTracker({
        accountEmail: 'synthetic-fail@example.com',
        customerId: FIXTURE_EVIDENCE.customerId,
        analysisId: FIXTURE_EVIDENCE.analysisId,
        recipientEmail: FIXTURE_EVIDENCE.recipientEmail,
    });
    tracker.logRunStarted();
    tracker.logFailed(new Error('Gmail inbox did not receive share email in time'), {
        ...FIXTURE_EVIDENCE,
        gmailMessageId: null,
        sharedReportUrl: null,
        sharedReportAnalysisVerified: false,
        sendSuccessToastVerified: true,
        failureStep: 'wait_for_gmail',
    });
});

test('synthetic analysis report share email partial pass: send ok, Gmail auth failed', () => {
    const tracker = new AnalysisReportShareEmailRunTracker({
        accountEmail: 'synthetic-gmail-auth@example.com',
        customerId: FIXTURE_EVIDENCE.customerId,
        analysisId: FIXTURE_EVIDENCE.analysisId,
        recipientEmail: FIXTURE_EVIDENCE.recipientEmail,
    });
    tracker.logRunStarted();
    tracker.logFailed(
        new Error(
            'Gmail OAuth token refresh failed (invalid_grant). Reauthorize the test mailbox token.json before send.'
        ),
        {
            ...FIXTURE_EVIDENCE,
            gmailMessageId: null,
            sharedReportUrl: null,
            sharedReportAnalysisVerified: false,
            sendSuccessToastVerified: true,
            failureStep: 'gmail_auth',
        }
    );
});

test('synthetic analysis report share email skipped reporting', () => {
    const tracker = new AnalysisReportShareEmailRunTracker({
        accountEmail: 'synthetic-skip@example.com',
        customerId: FIXTURE_EVIDENCE.customerId,
        analysisId: FIXTURE_EVIDENCE.analysisId,
        recipientEmail: FIXTURE_EVIDENCE.recipientEmail,
    });
    tracker.logRunStarted();
    tracker.logSkipped('credentials or Gmail OAuth not configured for local run');
});
