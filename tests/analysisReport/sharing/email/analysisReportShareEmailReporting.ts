import type { ShareEmailValidationMode } from './shareEmailValidationMode';

export type AnalysisReportShareEmailRunEvidence = {
    customerId: string;
    analysisId: string;
    recipientEmail: string;
    modalRecipientVerified: boolean;
    sendAttemptedOnce: boolean;
    sendSuccessToastVerified: boolean;
    gmailMessageId: string | null;
    sharedReportUrl: string | null;
    sharedReportAnalysisVerified: boolean;
    failureStep: string | null;
    validationMode?: ShareEmailValidationMode;
};

export type ShareEmailVerificationStage =
    | 'sendConfirmation'
    | 'freshEmailReceipt'
    | 'sharedReportLinkVerification';

export type ShareEmailVerificationStatus = 'Passed' | 'Failed' | 'Skipped' | 'Not reached' | 'Excluded';

export type ShareEmailVerificationSummary = Record<
    ShareEmailVerificationStage,
    ShareEmailVerificationStatus
>;

const SHARE_EMAIL_LOG_PREFIX = 'ANALYSIS_REPORT_SHARE_EMAIL';

export function logAnalysisReportShareEmailEvent(
    event: string,
    payload: Record<string, unknown>
): void {
    console.log(event, JSON.stringify(payload));
}

/** Redact shared-report token query values; keep origin and path for debugging. */
export function redactSharedReportUrl(url: string | null): string | null {
    if (!url) {
        return null;
    }
    try {
        const parsed = new URL(url);
        if (parsed.searchParams.has('token')) {
            parsed.searchParams.set('token', '[redacted]');
        }
        return parsed.toString();
    } catch {
        return '[redacted-invalid-url]';
    }
}

export function verificationSummaryFromEvidence(
    evidence: AnalysisReportShareEmailRunEvidence
): ShareEmailVerificationSummary {
    const uiOnly = evidence.validationMode === 'ui-send-confirmation';

    const sendConfirmation: ShareEmailVerificationStatus = evidence.sendSuccessToastVerified
        ? 'Passed'
        : evidence.sendAttemptedOnce
          ? 'Failed'
          : 'Not reached';

    const freshEmailReceipt: ShareEmailVerificationStatus = uiOnly
        ? 'Excluded'
        : evidence.gmailMessageId
          ? 'Passed'
          : evidence.sendSuccessToastVerified
            ? 'Failed'
            : 'Not reached';

    const sharedReportLinkVerification: ShareEmailVerificationStatus = uiOnly
        ? 'Excluded'
        : evidence.sharedReportAnalysisVerified
          ? 'Passed'
          : evidence.sharedReportUrl
            ? 'Failed'
            : evidence.gmailMessageId
              ? 'Failed'
              : 'Not reached';

    return {
        sendConfirmation,
        freshEmailReceipt,
        sharedReportLinkVerification,
    };
}

export function allShareEmailUiSendConfirmationPassed(
    evidence: AnalysisReportShareEmailRunEvidence
): boolean {
    return (
        evidence.modalRecipientVerified &&
        evidence.sendAttemptedOnce &&
        evidence.sendSuccessToastVerified
    );
}

export function allShareEmailVerificationsPassed(
    evidence: AnalysisReportShareEmailRunEvidence
): boolean {
    if (evidence.validationMode === 'ui-send-confirmation') {
        return allShareEmailUiSendConfirmationPassed(evidence);
    }
    const summary = verificationSummaryFromEvidence(evidence);
    return (
        summary.sendConfirmation === 'Passed' &&
        summary.freshEmailReceipt === 'Passed' &&
        summary.sharedReportLinkVerification === 'Passed'
    );
}

export function isAnalysisReportShareEmailGmailAuthFailureStep(failureStep: string | null): boolean {
    return failureStep === 'gmail_preflight' || failureStep === 'gmail_auth';
}

export function redactEvidenceForReporting(
    evidence: AnalysisReportShareEmailRunEvidence
): Record<string, unknown> {
    return {
        customerId: evidence.customerId,
        analysisId: evidence.analysisId,
        recipientEmail: evidence.recipientEmail,
        modalRecipientVerified: evidence.modalRecipientVerified,
        sendAttemptedOnce: evidence.sendAttemptedOnce,
        sendSuccessToastVerified: evidence.sendSuccessToastVerified,
        gmailMessageReceived: Boolean(evidence.gmailMessageId),
        sharedReportUrl: redactSharedReportUrl(evidence.sharedReportUrl),
        sharedReportAnalysisVerified: evidence.sharedReportAnalysisVerified,
        failureStep: evidence.failureStep,
        validationMode: evidence.validationMode ?? 'full-inbox-guest',
        gmailAuthFailure: isAnalysisReportShareEmailGmailAuthFailureStep(evidence.failureStep),
        verification: verificationSummaryFromEvidence(evidence),
    };
}

export function analysisReportShareEmailEvidenceAttachmentBody(
    payload: AnalysisReportShareEmailRunEvidence
): string {
    return JSON.stringify(redactEvidenceForReporting(payload), null, 2);
}

export type AnalysisReportShareEmailRunTrackerOptions = {
    accountEmail?: string | null;
    customerId?: string;
    analysisId?: string;
    recipientEmail?: string;
};

export class AnalysisReportShareEmailRunTracker {
    readonly accountEmail: string | null;
    customerId: string | null;
    analysisId: string | null;
    recipientEmail: string | null;

    constructor(options?: AnalysisReportShareEmailRunTrackerOptions) {
        this.accountEmail = options?.accountEmail?.trim() ?? null;
        this.customerId = options?.customerId ?? null;
        this.analysisId = options?.analysisId ?? null;
        this.recipientEmail = options?.recipientEmail ?? null;
    }

    bindTarget(customerId: string, analysisId: string, recipientEmail: string): void {
        this.customerId = customerId;
        this.analysisId = analysisId;
        this.recipientEmail = recipientEmail;
    }

    logRunStarted(): void {
        logAnalysisReportShareEmailEvent(`${SHARE_EMAIL_LOG_PREFIX}_RUN_STARTED`, {
            smokeScope: 'analysis_report_share_email_standalone',
            environment: 'staging',
            accountEmail: this.accountEmail,
            customerId: this.customerId,
            analysisId: this.analysisId,
            recipientEmail: this.recipientEmail,
            part2Integration: 'deferred',
        });
    }

    logVerified(evidence: AnalysisReportShareEmailRunEvidence): void {
        if (!allShareEmailVerificationsPassed(evidence)) {
            throw new Error(
                evidence.validationMode === 'ui-send-confirmation'
                    ? 'AnalysisReportShareEmailRunTracker.logVerified requires UI send confirmation.'
                    : 'AnalysisReportShareEmailRunTracker.logVerified requires send, Gmail, and shared-link verification.'
            );
        }
        logAnalysisReportShareEmailEvent(`${SHARE_EMAIL_LOG_PREFIX}_VERIFIED`, {
            ...redactEvidenceForReporting(evidence),
            overall: 'Passed',
        });
    }

    logFailed(error: unknown, evidence: AnalysisReportShareEmailRunEvidence): void {
        const message = error instanceof Error ? error.message : String(error);
        logAnalysisReportShareEmailEvent(`${SHARE_EMAIL_LOG_PREFIX}_FAILED`, {
            ...redactEvidenceForReporting(evidence),
            overall: 'Failed',
            errorMessage: message.slice(0, 500),
        });
    }

    logSkipped(reason: string): void {
        const verification: ShareEmailVerificationSummary = {
            sendConfirmation: 'Skipped',
            freshEmailReceipt: 'Skipped',
            sharedReportLinkVerification: 'Skipped',
        };
        logAnalysisReportShareEmailEvent(`${SHARE_EMAIL_LOG_PREFIX}_SKIPPED`, {
            smokeScope: 'analysis_report_share_email_standalone',
            overall: 'Skipped',
            skipReason: reason,
            customerId: this.customerId,
            analysisId: this.analysisId,
            recipientEmail: this.recipientEmail,
            verification,
        });
    }
}
