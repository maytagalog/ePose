export type PostureAnalysisStepName =
    | 'record identity'
    | 'new analysis limit dialog'
    | 'analysis list verification'
    | 'back to selected customer page'
    | 'same customer and record reopen'
    | 'first analysis report opening';

export type PostureAnalysisSummaryStatus = 'Passed' | 'Failed' | 'Not reached' | 'Skipped' | 'Deferred';

export type PostureAnalysisNavSummary = {
    newAnalysisLimitDialog: PostureAnalysisSummaryStatus;
    analysisListVerification: PostureAnalysisSummaryStatus;
    backToSelectedCustomerPage: PostureAnalysisSummaryStatus;
    sameRecordReopen: PostureAnalysisSummaryStatus;
    firstReportOpening: PostureAnalysisSummaryStatus;
};

export type PostureAnalysisReportOpeningOutcome =
    | 'verified'
    | 'skipped_no_analysis_reports'
    | 'deferred_to_analysis_report_list_handoff'
    | 'not_reached';

export type PostureAnalysisRunEvidence = {
    customerId: string;
    recordId: string;
    analysisId: string | null;
    listLoadOutcome: 'populated' | 'empty' | null;
    limitDialogVerified: boolean;
    reportOpening: PostureAnalysisReportOpeningOutcome;
    navSummary: PostureAnalysisNavSummary;
    lastStartedStep: PostureAnalysisStepName | null;
    lastCompletedStep: PostureAnalysisStepName | null;
};

export function sanitizePostureAnalysisFailureReason(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
}

export function logPostureAnalysisEvent(event: string, payload: Record<string, unknown>): void {
    console.log(event, JSON.stringify(payload));
}

export class PostureAnalysisRunTracker {
    readonly accountEmail: string | null;
    customerId: string | null = null;
    recordId: string | null = null;
    analysisId: string | null = null;
    listLoadOutcome: 'populated' | 'empty' | null = null;
    limitDialogVerified = false;
    reportOpening: PostureAnalysisReportOpeningOutcome = 'not_reached';
    lastStartedStep: PostureAnalysisStepName | null = null;
    lastCompletedStep: PostureAnalysisStepName | null = null;

    readonly navSummary: PostureAnalysisNavSummary = {
        newAnalysisLimitDialog: 'Not reached',
        analysisListVerification: 'Not reached',
        backToSelectedCustomerPage: 'Not reached',
        sameRecordReopen: 'Not reached',
        firstReportOpening: 'Not reached',
    };

    constructor(options?: { accountEmail?: string | null }) {
        this.accountEmail = options?.accountEmail?.trim() ?? null;
    }

    stepStarted(step: PostureAnalysisStepName): void {
        this.lastStartedStep = step;
    }

    stepCompleted(step: PostureAnalysisStepName): void {
        this.lastCompletedStep = step;
    }

    toEvidence(): PostureAnalysisRunEvidence {
        return {
            customerId: this.customerId ?? '',
            recordId: this.recordId ?? '',
            analysisId: this.analysisId,
            listLoadOutcome: this.listLoadOutcome,
            limitDialogVerified: this.limitDialogVerified,
            reportOpening: this.reportOpening,
            navSummary: { ...this.navSummary },
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
        };
    }

    private baseFields(finalPathname: string): Record<string, unknown> {
        return {
            coverage: 'CIRS posture analysis navigation',
            ...(this.accountEmail ? { accountEmail: this.accountEmail } : {}),
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.recordId ? { recordId: this.recordId } : {}),
            ...(this.analysisId ? { analysisId: this.analysisId } : {}),
            listLoadOutcome: this.listLoadOutcome,
            limitDialogVerified: this.limitDialogVerified,
            reportOpening: this.reportOpening,
            navSummary: { ...this.navSummary },
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            finalPathname,
        };
    }

    logNavigationStarted(finalPathname: string, customerId: string, recordId: string): void {
        this.customerId = customerId;
        this.recordId = recordId;
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_NAV_STARTED', this.baseFields(finalPathname));
    }

    logLimitDialogVerified(finalPathname: string): void {
        this.limitDialogVerified = true;
        this.navSummary.newAnalysisLimitDialog = 'Passed';
        this.stepCompleted('new analysis limit dialog');
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_LIMIT_DIALOG_VERIFIED', this.baseFields(finalPathname));
    }

    logLimitDialogFailed(error: unknown, finalPathname: string): void {
        this.navSummary.newAnalysisLimitDialog = 'Failed';
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_LIMIT_DIALOG_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizePostureAnalysisFailureReason(error),
        });
    }

    logListVerified(finalPathname: string, outcome: 'populated' | 'empty'): void {
        this.listLoadOutcome = outcome;
        this.navSummary.analysisListVerification = 'Passed';
        this.stepCompleted('analysis list verification');
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_LIST_VERIFIED', {
            ...this.baseFields(finalPathname),
            listLoadOutcome: outcome,
        });
    }

    logListFailed(error: unknown, finalPathname: string): void {
        this.navSummary.analysisListVerification = 'Failed';
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_LIST_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizePostureAnalysisFailureReason(error),
        });
    }

    logBackToSelectedCustomerVerified(finalPathname: string): void {
        this.navSummary.backToSelectedCustomerPage = 'Passed';
        this.stepCompleted('back to selected customer page');
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_BACK_TO_SELECTED_CUSTOMER_VERIFIED', this.baseFields(finalPathname));
    }

    logBackToSelectedCustomerFailed(error: unknown, finalPathname: string): void {
        this.navSummary.backToSelectedCustomerPage = 'Failed';
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_BACK_TO_SELECTED_CUSTOMER_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizePostureAnalysisFailureReason(error),
        });
    }

    logSameRecordReopenVerified(finalPathname: string): void {
        this.navSummary.sameRecordReopen = 'Passed';
        this.stepCompleted('same customer and record reopen');
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_SAME_RECORD_REOPEN_VERIFIED', this.baseFields(finalPathname));
    }

    logSameRecordReopenFailed(error: unknown, finalPathname: string): void {
        this.navSummary.sameRecordReopen = 'Failed';
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_SAME_RECORD_REOPEN_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizePostureAnalysisFailureReason(error),
        });
    }

    logReportOpeningVerified(finalPathname: string, analysisId: string): void {
        this.analysisId = analysisId;
        this.reportOpening = 'verified';
        this.navSummary.firstReportOpening = 'Passed';
        this.stepCompleted('first analysis report opening');
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_REPORT_OPENING_VERIFIED', this.baseFields(finalPathname));
    }

    logReportOpeningSkipped(finalPathname: string): void {
        this.reportOpening = 'skipped_no_analysis_reports';
        this.navSummary.firstReportOpening = 'Skipped';
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_REPORT_OPENING_SKIPPED', this.baseFields(finalPathname));
    }

    logReportOpeningDeferredToAnalysisReportList(finalPathname: string): void {
        this.reportOpening = 'deferred_to_analysis_report_list_handoff';
        this.navSummary.firstReportOpening = 'Deferred';
        this.stepCompleted('analysis list verification');
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_LIST_HANDOFF_VERIFIED', this.baseFields(finalPathname));
    }

    logReportOpeningFailed(error: unknown, finalPathname: string): void {
        this.navSummary.firstReportOpening = 'Failed';
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_REPORT_OPENING_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizePostureAnalysisFailureReason(error),
        });
    }

    logNavigationFailed(error: unknown, finalPathname: string): void {
        logPostureAnalysisEvent('CIRS_POSTURE_ANALYSIS_NAV_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizePostureAnalysisFailureReason(error),
        });
    }
}

export function logPostureAnalysisNavSummary(summary: PostureAnalysisNavSummary): void {
    console.log('CIRS_POSTURE_ANALYSIS_NAV_SUMMARY', JSON.stringify(summary));
}
