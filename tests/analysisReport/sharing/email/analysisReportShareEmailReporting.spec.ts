import { test, expect } from '@playwright/test';
import {
    AnalysisReportShareEmailRunTracker,
    allShareEmailVerificationsPassed,
    redactEvidenceForReporting,
    redactSharedReportUrl,
    verificationSummaryFromEvidence,
    type AnalysisReportShareEmailRunEvidence,
} from './analysisReportShareEmailReporting';

const BASE_EVIDENCE: AnalysisReportShareEmailRunEvidence = {
    customerId: 'ce3f36fd-07c3-4eda-ad87-35631acc39cc',
    analysisId: 'a871ea8f-c5e8-4fbd-b933-75fe8e2a144f',
    recipientEmail: 'aardvarkomonstrosesquip1230000@gmail.com',
    modalRecipientVerified: true,
    sendAttemptedOnce: true,
    sendSuccessToastVerified: true,
    gmailMessageId: 'msg-123',
    sharedReportUrl: 'https://app-stg.epose.com/shared-report?token=secret-token',
    sharedReportAnalysisVerified: true,
    failureStep: null,
};

test('redactSharedReportUrl removes token query value', () => {
    const redacted = redactSharedReportUrl(BASE_EVIDENCE.sharedReportUrl);
    expect(redacted).toContain('token=%5Bredacted%5D');
    expect(redacted).not.toContain('secret-token');
});

test('ui-send-confirmation mode excludes inbox and guest from pass criteria', () => {
    const uiEvidence = {
        ...BASE_EVIDENCE,
        validationMode: 'ui-send-confirmation' as const,
        gmailMessageId: null,
        sharedReportUrl: null,
        sharedReportAnalysisVerified: false,
    };
    const summary = verificationSummaryFromEvidence(uiEvidence);
    expect(summary.sendConfirmation).toBe('Passed');
    expect(summary.freshEmailReceipt).toBe('Excluded');
    expect(summary.sharedReportLinkVerification).toBe('Excluded');
    expect(allShareEmailVerificationsPassed(uiEvidence)).toBe(true);
});

test('verification summary requires all three stages for pass', () => {
    expect(allShareEmailVerificationsPassed(BASE_EVIDENCE)).toBe(true);
    const partial = { ...BASE_EVIDENCE, sharedReportAnalysisVerified: false, failureStep: 'verify_shared_report_link' };
    expect(allShareEmailVerificationsPassed(partial)).toBe(false);
    const summary = verificationSummaryFromEvidence(partial);
    expect(summary.sendConfirmation).toBe('Passed');
    expect(summary.freshEmailReceipt).toBe('Passed');
    expect(summary.sharedReportLinkVerification).toBe('Failed');
});

test('partial pass after send: Gmail auth failure leaves shared link not reached', () => {
    const partial = {
        ...BASE_EVIDENCE,
        sendSuccessToastVerified: true,
        sendAttemptedOnce: true,
        gmailMessageId: null,
        sharedReportUrl: null,
        sharedReportAnalysisVerified: false,
        failureStep: 'gmail_auth',
    };
    const summary = verificationSummaryFromEvidence(partial);
    expect(summary.sendConfirmation).toBe('Passed');
    expect(summary.freshEmailReceipt).toBe('Failed');
    expect(summary.sharedReportLinkVerification).toBe('Not reached');
    expect(allShareEmailVerificationsPassed(partial)).toBe(false);
    const payload = redactEvidenceForReporting(partial);
    expect(payload.gmailAuthFailure).toBe(true);
    expect(payload.verification).toEqual(summary);
});

test('ANALYSIS_REPORT_SHARE_EMAIL_VERIFIED redacts token in console payload', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new AnalysisReportShareEmailRunTracker();
        tracker.logVerified(BASE_EVIDENCE);
    } finally {
        console.log = original;
    }
    const verifiedLine = lines.find((line) => line.startsWith('ANALYSIS_REPORT_SHARE_EMAIL_VERIFIED '));
    expect(verifiedLine).toBeDefined();
    const payload = JSON.parse(verifiedLine!.slice('ANALYSIS_REPORT_SHARE_EMAIL_VERIFIED '.length));
    expect(payload.overall).toBe('Passed');
    expect(payload.verification.sharedReportLinkVerification).toBe('Passed');
    expect(payload.gmailMessageReceived).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('secret-token');
    expect(JSON.stringify(payload)).not.toContain('msg-123');
});
