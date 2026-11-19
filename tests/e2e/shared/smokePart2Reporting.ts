import type { LimitDialogFlowResult } from '../../limitDialog/limitDialogFlow';
import type { ExistingUserCustomersReadiness } from '../../login/existingUserLoginFlow';
import type { LogoutRunEvidence } from '../../logout/logoutFlow';

export type Part2FeatureOutcome = 'passed' | 'failed' | 'not_reached';

export type Part2FeatureOutcomes = {
    login: Part2FeatureOutcome;
    limitDialog: Part2FeatureOutcome;
    cirsRecordNavigation: Part2FeatureOutcome;
    cirsResponseDetails: Part2FeatureOutcome;
    cirsHandwrittenNotes: Part2FeatureOutcome;
    cirsTakeoverHandover: Part2FeatureOutcome;
    cirsPostureAnalysis: Part2FeatureOutcome;
    analysisReport: Part2FeatureOutcome;
    comparisonReport: Part2FeatureOutcome;
    logout: Part2FeatureOutcome;
};

export type Part2TestmoCaseTimingKey =
    | 'login'
    | 'limitDialog'
    | 'cirsRecordNavigation'
    | 'cirsResponseDetails'
    | 'cirsHandwrittenNotes'
    | 'cirsTakeoverHandover'
    | 'cirsPostureAnalysisListHandoff'
    | 'logout';

const PART2_STEP_TO_CASE: Partial<Record<Part2StepName, Part2TestmoCaseTimingKey>> = {
    'login existing account': 'login',
    'limit dialog checks': 'limitDialog',
    'cirs record creation and list navigation': 'cirsRecordNavigation',
    'cirs response details': 'cirsResponseDetails',
    'cirs takeover handover CRUD': 'cirsTakeoverHandover',
    'cirs posture analysis navigation': 'cirsPostureAnalysisListHandoff',
    logout: 'logout',
};

const HANDWRITTEN_NOTE_STEPS = new Set<Part2StepName>([
    'cirs handwritten note creation',
    'cirs handwritten note update',
    'cirs handwritten note delete',
]);

export type Part2StepName =
    | 'login existing account'
    | 'limit dialog checks'
    | 'cirs record creation and list navigation'
    | 'cirs response details'
    | 'cirs handwritten note creation'
    | 'cirs handwritten note update'
    | 'cirs handwritten note delete'
    | 'cirs takeover handover CRUD'
    | 'cirs posture analysis navigation'
    | 'analysis report combined smoke'
    | 'comparison report combined smoke'
    | 'logout';

const ACTIVE_COVERAGE = [
    'Login',
    'Limit Dialog',
    'CIRS record creation and list navigation',
    'CIRS Response Details',
    'Handwritten Note creation',
    'Handwritten Note update',
    'Handwritten Note delete',
    'Takeover handover CRUD',
    'CIRS posture analysis navigation (analysis report list handoff)',
    'Analysis Report view through history (deletion default off)',
    'Comparison Report view, QR, email, PDF save, exit to single report',
    'Logout',
] as const;

/** Partial CIRS / related flows not exercised in Part 2 smoke. */
const DEFERRED_COVERAGE = ['CIRS deletion'] as const;

const DEFERRED_SCOPE_REASON = 'explicitly out of Part 2 smoke scope';

const DEFERRED_REASONS: Record<(typeof DEFERRED_COVERAGE)[number], string> = {
    'CIRS deletion': DEFERRED_SCOPE_REASON,
};

export function logPart2SmokeEvent(event: string, payload: Record<string, unknown>): void {
    console.log(event, JSON.stringify(payload));
}

export function sanitizePageLocation(pageUrl: string): { origin: string; pathname: string } {
    try {
        const parsed = new URL(pageUrl);
        return { origin: parsed.origin, pathname: parsed.pathname };
    } catch {
        return { origin: 'invalid', pathname: String(pageUrl).slice(0, 200) };
    }
}

export function sanitizeFailureReason(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
}

export function buildPart2LoginVerifiedPayload(
    accountEmail: string,
    loginReadiness: ExistingUserCustomersReadiness
): Record<string, unknown> {
    return {
        accountEmail,
        identityEvidenceStatus: loginReadiness.identityEvidence.status,
        profileEmailVerified: loginReadiness.profileEmailVerified,
        sessionTakeoverDetected: loginReadiness.takeoverDetected,
        sessionTakeoverConfirmed: loginReadiness.takeoverConfirmed,
    };
}

export function buildPart2LimitDialogVerifiedPayload(
    accountEmail: string,
    result: LimitDialogFlowResult
): Record<string, unknown> {
    const { prerequisites, triggers } = result;
    return {
        accountEmail,
        automaticDialogOutcome: result.automaticOutcome,
        triggerPlanChange: triggers.plan_change,
        triggerQuickAnalysis: triggers.quick_analysis,
        triggerNewAnalysis: triggers.new_analysis,
        freePlanVerified: prerequisites.freePlanVerified,
        neverPurchasedVerified: prerequisites.neverPurchasedVerified,
        accountAgeStatus: prerequisites.accountAge.status,
        paymentHistoryStatus: prerequisites.paymentHistory.status,
        subscriptionObserved: prerequisites.subscriptionObserved,
        finalPathname: result.finalPathname,
    };
}

export type Part2CirsRecordVerifiedInput = {
    customerId: string;
    recordId: string;
    recordUrl: string;
    createAttempted: boolean;
    createConfirmed: boolean;
    recordIdentitySource: string;
};

export function buildPart2CirsRecordVerifiedPayload(
    accountEmail: string,
    ctx: Part2CirsRecordVerifiedInput
): Record<string, unknown> {
    let recordPathname = ctx.recordUrl;
    try {
        recordPathname = new URL(ctx.recordUrl).pathname;
    } catch {
        recordPathname = ctx.recordUrl.slice(0, 200);
    }
    return {
        accountEmail,
        customerId: ctx.customerId,
        recordId: ctx.recordId,
        createAttempted: ctx.createAttempted,
        createConfirmed: ctx.createConfirmed,
        recordIdentitySource: ctx.recordIdentitySource,
        recordPathname,
    };
}

export type Part2CirsResponseDetailsVerifiedInput = {
    customerId: string;
    recordId: string;
    expectedText: string;
    saveOutcome: string;
    savedTimestamp: string | null;
};

export function buildPart2CirsResponseDetailsVerifiedPayload(
    accountEmail: string,
    result: Part2CirsResponseDetailsVerifiedInput
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        accountEmail,
        customerId: result.customerId,
        recordId: result.recordId,
        expectedText: result.expectedText,
        saveOutcome: result.saveOutcome,
    };
    if (result.savedTimestamp) {
        payload.savedTimestamp = result.savedTimestamp;
        payload.autosaveVerified = true;
    }
    return payload;
}

export type Part2CirsHandwrittenCreateVerifiedInput = {
    customerId: string;
    recordId: string;
    noteId: string | null;
    createAttempted: boolean;
    createServerConfirmed: boolean;
    createIdentityVerified: boolean;
    noteIdentitySource: string | null;
    listVerificationStatus: string;
    noteRetainedOnStaging: boolean;
};

export function buildPart2CirsHandwrittenCreateVerifiedPayload(
    accountEmail: string,
    result: Part2CirsHandwrittenCreateVerifiedInput
): Record<string, unknown> {
    return {
        accountEmail,
        coverage: 'Handwritten Note creation',
        customerId: result.customerId,
        recordId: result.recordId,
        noteId: result.noteId,
        creationAttempted: result.createAttempted,
        creationConfirmed: result.createServerConfirmed,
        createIdentityVerified: result.createIdentityVerified,
        noteIdentitySource: result.noteIdentitySource,
        listVerificationStatus: result.listVerificationStatus,
        noteRetainedOnStaging: result.noteRetainedOnStaging,
    };
}

export type Part2CirsHandwrittenUpdateVerifiedInput = Part2CirsHandwrittenCreateVerifiedInput & {
    updateAttempted: boolean;
    updateVerified: boolean;
};

export function buildPart2CirsHandwrittenUpdateVerifiedPayload(
    accountEmail: string,
    result: Part2CirsHandwrittenUpdateVerifiedInput
): Record<string, unknown> {
    return {
        ...buildPart2CirsHandwrittenCreateVerifiedPayload(accountEmail, result),
        coverage: 'Handwritten Note creation, read, and update',
        updateAttempted: result.updateAttempted,
        updateVerified: result.updateVerified,
        creationStatus: result.createIdentityVerified ? 'verified' : 'unverified',
        readStatus: result.listVerificationStatus,
        updateStatus: result.updateVerified ? 'verified' : 'failed',
        deleteStatus: 'not_run',
    };
}

export type Part2CirsHandwrittenDeleteVerifiedInput = Part2CirsHandwrittenUpdateVerifiedInput & {
    deleteAttempted: boolean;
    deleteServerConfirmed: boolean;
    deleteVerified: boolean;
};

export function buildPart2CirsHandwrittenDeleteVerifiedPayload(
    accountEmail: string,
    result: Part2CirsHandwrittenDeleteVerifiedInput
): Record<string, unknown> {
    return {
        ...buildPart2CirsHandwrittenUpdateVerifiedPayload(accountEmail, result),
        coverage: 'Handwritten Note creation, read, update, and delete',
        deleteAttempted: result.deleteAttempted,
        deleteServerConfirmed: result.deleteServerConfirmed,
        deleteVerified: result.deleteVerified,
        deleteStatus: result.deleteVerified ? 'verified' : 'failed',
        noteRetainedOnStaging: result.noteRetainedOnStaging,
    };
}

export type Part2CirsTakeoverCrudVerifiedInput = {
    customerId: string;
    recordId: string;
    handoverId: string | null;
    createVerified: boolean;
    readVerified: boolean;
    updateVerified: boolean;
    deleteVerified: boolean;
    handoverRetainedOnStaging: boolean;
};

export type Part2CirsPostureAnalysisVerifiedInput = {
    customerId: string;
    recordId: string;
    analysisId: string | null;
    listLoadOutcome: 'populated' | 'empty';
    reportOpening:
        | 'verified'
        | 'skipped_no_analysis_reports'
        | 'deferred_to_analysis_report_list_handoff';
    limitDialogVerified: boolean;
    navSummary: Record<string, unknown>;
};

export function buildPart2CirsPostureAnalysisVerifiedPayload(
    accountEmail: string,
    result: Part2CirsPostureAnalysisVerifiedInput
): Record<string, unknown> {
    return {
        accountEmail,
        coverage: 'CIRS posture analysis navigation',
        customerId: result.customerId,
        recordId: result.recordId,
        analysisId: result.analysisId,
        listLoadOutcome: result.listLoadOutcome,
        reportOpening: result.reportOpening,
        limitDialogVerified: result.limitDialogVerified,
        navSummary: result.navSummary,
    };
}

export function buildPart2CirsTakeoverCrudVerifiedPayload(
    accountEmail: string,
    result: Part2CirsTakeoverCrudVerifiedInput
): Record<string, unknown> {
    return {
        accountEmail,
        coverage: 'Takeover handover CRUD',
        customerId: result.customerId,
        recordId: result.recordId,
        handoverId: result.handoverId,
        createStatus: result.createVerified ? 'verified' : 'failed',
        readStatus: result.readVerified ? 'verified' : 'failed',
        updateStatus: result.updateVerified ? 'verified' : 'failed',
        deleteStatus: result.deleteVerified ? 'verified' : 'failed',
        handoverRetainedOnStaging: result.handoverRetainedOnStaging,
    };
}

export type Part2AnalysisReportVerifiedInput = {
    sourceCustomerId: string;
    sourceAnalysisId: string;
    deletionMode: string;
    reportDeletionStage: string;
    combinedPassed: boolean;
    runOutputRoot: string;
    featureStages: Record<string, string>;
};

export type Part2ComparisonReportVerifiedInput = {
    customerId: string;
    returnedSingleReportAnalysisId: string | null;
    combinedPassed: boolean;
    runOutputRoot: string;
    featureStages: Record<string, string>;
};

export function buildPart2ComparisonReportVerifiedPayload(
    accountEmail: string,
    result: Part2ComparisonReportVerifiedInput
): Record<string, unknown> {
    return {
        accountEmail,
        coverage:
            'Comparison view, QR, email, A4 PDF save, exit to single report (comparison history excluded)',
        customerId: result.customerId,
        returnedSingleReportAnalysisId: result.returnedSingleReportAnalysisId,
        combinedPassed: result.combinedPassed,
        runOutputRoot: result.runOutputRoot,
        featureStages: result.featureStages,
        samePageHandoff: true,
    };
}

export function buildPart2AnalysisReportVerifiedPayload(
    accountEmail: string,
    result: Part2AnalysisReportVerifiedInput
): Record<string, unknown> {
    return {
        accountEmail,
        coverage:
            'Analysis Report view, display settings, QR, email, PDF, customer history (deletion optional)',
        sourceCustomerId: result.sourceCustomerId,
        sourceAnalysisId: result.sourceAnalysisId,
        deletionMode: result.deletionMode,
        reportDeletionStage: result.reportDeletionStage,
        combinedPassed: result.combinedPassed,
        runOutputRoot: result.runOutputRoot,
        featureStages: result.featureStages,
        samePageHandoff: true,
    };
}

export function buildPart2LogoutVerifiedPayload(
    accountEmail: string,
    evidence: LogoutRunEvidence
): Record<string, unknown> {
    return {
        accountEmail,
        logoutAttempted: evidence.logoutAttempted,
        appRedirectVerified: evidence.appRedirectVerified,
        loginFormVerified: evidence.loginFormVerified,
        protectedRouteRejected: evidence.protectedRouteRejected,
        finalPathname: evidence.finalPathname,
    };
}

export class SmokePart2RunTracker {
    readonly accountEmail: string;
    lastStartedStep: Part2StepName | null = null;
    lastCompletedStep: Part2StepName | null = null;
    readonly caseDurationsMs: Record<string, number> = {};
    private readonly caseStartedAtMs: Record<string, number> = {};
    readonly outcomes: Part2FeatureOutcomes = {
        login: 'not_reached',
        limitDialog: 'not_reached',
        cirsRecordNavigation: 'not_reached',
        cirsResponseDetails: 'not_reached',
        cirsHandwrittenNotes: 'not_reached',
        cirsTakeoverHandover: 'not_reached',
        cirsPostureAnalysis: 'not_reached',
        analysisReport: 'not_reached',
        comparisonReport: 'not_reached',
        logout: 'not_reached',
    };

    constructor(accountEmail: string) {
        this.accountEmail = accountEmail.trim();
    }

    logRunStarted(): void {
        logPart2SmokeEvent('PART2_RUN_STARTED', {
            smokePart: 2,
            environment: 'staging',
            accountEmail: this.accountEmail,
            accountSource: 'existing_account',
            activeCoverage: [...ACTIVE_COVERAGE],
            deferredCoverage: [...DEFERRED_COVERAGE],
            deferredReasons: { ...DEFERRED_REASONS },
        });
    }

    caseFeatureStarted(key: Part2TestmoCaseTimingKey): void {
        if (this.caseStartedAtMs[key] === undefined) {
            this.caseStartedAtMs[key] = Date.now();
        }
    }

    caseFeatureStop(key: Part2TestmoCaseTimingKey): void {
        const started = this.caseStartedAtMs[key];
        if (started !== undefined) {
            this.caseDurationsMs[key] = Date.now() - started;
            delete this.caseStartedAtMs[key];
        }
    }

    caseFeatureFail(key: Part2TestmoCaseTimingKey): void {
        this.caseFeatureStop(key);
    }

    getCaseDurationsMs(): Record<string, number> {
        return { ...this.caseDurationsMs };
    }

    private resolveTimingKeyForStep(step: Part2StepName): Part2TestmoCaseTimingKey | null {
        if (HANDWRITTEN_NOTE_STEPS.has(step)) {
            return 'cirsHandwrittenNotes';
        }
        return PART2_STEP_TO_CASE[step] ?? null;
    }

    private stopTimingForStep(step: Part2StepName, failed = false): void {
        if (HANDWRITTEN_NOTE_STEPS.has(step)) {
            if (step === 'cirs handwritten note delete' || failed) {
                this.caseFeatureStop('cirsHandwrittenNotes');
            }
            return;
        }
        const key = PART2_STEP_TO_CASE[step];
        if (key) {
            if (failed) {
                this.caseFeatureFail(key);
            } else {
                this.caseFeatureStop(key);
            }
        }
    }

    stepStarted(step: Part2StepName): void {
        this.lastStartedStep = step;
        if (HANDWRITTEN_NOTE_STEPS.has(step)) {
            if (step === 'cirs handwritten note creation') {
                this.caseFeatureStarted('cirsHandwrittenNotes');
            }
            return;
        }
        const key = PART2_STEP_TO_CASE[step];
        if (key) {
            this.caseFeatureStarted(key);
        }
    }

    stepCompleted(step: Part2StepName): void {
        this.lastCompletedStep = step;
        this.stopTimingForStep(step, false);
    }

    logLoginVerified(loginReadiness: ExistingUserCustomersReadiness): void {
        this.outcomes.login = 'passed';
        logPart2SmokeEvent(
            'PART2_LOGIN_VERIFIED',
            buildPart2LoginVerifiedPayload(this.accountEmail, loginReadiness)
        );
        this.stepCompleted('login existing account');
    }

    logLimitDialogVerified(result: LimitDialogFlowResult): void {
        this.outcomes.limitDialog = 'passed';
        logPart2SmokeEvent(
            'PART2_LIMIT_DIALOG_VERIFIED',
            buildPart2LimitDialogVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('limit dialog checks');
    }

    logCirsRecordNavigationVerified(ctx: Part2CirsRecordVerifiedInput): void {
        this.outcomes.cirsRecordNavigation = 'passed';
        logPart2SmokeEvent(
            'PART2_CIRS_RECORD_NAVIGATION_VERIFIED',
            buildPart2CirsRecordVerifiedPayload(this.accountEmail, ctx)
        );
        this.stepCompleted('cirs record creation and list navigation');
    }

    logCirsResponseDetailsVerified(result: Part2CirsResponseDetailsVerifiedInput): void {
        this.outcomes.cirsResponseDetails = 'passed';
        logPart2SmokeEvent(
            'PART2_CIRS_RESPONSE_DETAILS_VERIFIED',
            buildPart2CirsResponseDetailsVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('cirs response details');
    }

    logCirsHandwrittenCreateVerified(result: Part2CirsHandwrittenCreateVerifiedInput): void {
        logPart2SmokeEvent(
            'PART2_CIRS_HANDWRITTEN_CREATE_VERIFIED',
            buildPart2CirsHandwrittenCreateVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('cirs handwritten note creation');
    }

    logCirsHandwrittenUpdateVerified(result: Part2CirsHandwrittenUpdateVerifiedInput): void {
        if (!result.createIdentityVerified || !result.updateVerified || !result.noteId) {
            throw new Error(
                'Handwritten Part 2 outcome requires verified creation, list read, and update.'
            );
        }
        logPart2SmokeEvent(
            'PART2_CIRS_HANDWRITTEN_UPDATE_VERIFIED',
            buildPart2CirsHandwrittenUpdateVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('cirs handwritten note update');
    }

    logCirsHandwrittenDeleteVerified(result: Part2CirsHandwrittenDeleteVerifiedInput): void {
        if (
            !result.createIdentityVerified ||
            !result.updateVerified ||
            !result.deleteVerified ||
            !result.noteId
        ) {
            throw new Error(
                'Handwritten Part 2 outcome requires verified creation, read, update, and delete.'
            );
        }
        this.outcomes.cirsHandwrittenNotes = 'passed';
        logPart2SmokeEvent(
            'PART2_CIRS_HANDWRITTEN_DELETE_VERIFIED',
            buildPart2CirsHandwrittenDeleteVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('cirs handwritten note delete');
    }

    logCirsTakeoverCrudVerified(result: Part2CirsTakeoverCrudVerifiedInput): void {
        if (
            !result.createVerified ||
            !result.readVerified ||
            !result.updateVerified ||
            !result.deleteVerified ||
            !result.handoverId
        ) {
            throw new Error('Takeover Part 2 outcome requires full verified CRUD with handoverId.');
        }
        this.outcomes.cirsTakeoverHandover = 'passed';
        logPart2SmokeEvent(
            'PART2_CIRS_TAKEOVER_CRUD_VERIFIED',
            buildPart2CirsTakeoverCrudVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('cirs takeover handover CRUD');
    }

    logCirsPostureAnalysisVerified(result: Part2CirsPostureAnalysisVerifiedInput): void {
        if (!result.limitDialogVerified) {
            throw new Error('Posture analysis Part 2 outcome requires verified 新規分析 Limit Dialog.');
        }
        const summary = result.navSummary as {
            analysisListVerification?: string;
            backToSelectedCustomerPage?: string;
            sameRecordReopen?: string;
            firstReportOpening?: string;
        };
        if (summary.analysisListVerification !== 'Passed') {
            throw new Error('Posture analysis Part 2 outcome requires analysis list verification.');
        }
        if (result.reportOpening === 'deferred_to_analysis_report_list_handoff') {
            if (result.listLoadOutcome !== 'populated') {
                throw new Error('Analysis Report list handoff requires populated analysis list.');
            }
            if (summary.analysisListVerification !== 'Passed') {
                throw new Error('Analysis Report list handoff requires passed list verification.');
            }
        } else if (result.listLoadOutcome === 'populated') {
            if (summary.sameRecordReopen !== 'Passed' || summary.firstReportOpening !== 'Passed') {
                throw new Error(
                    'Populated analysis list requires same-record reopen and first report opening.'
                );
            }
            if (!result.analysisId || result.reportOpening !== 'verified') {
                throw new Error('Populated analysis list requires verified report opening with analysisId.');
            }
        } else if (result.reportOpening !== 'skipped_no_analysis_reports') {
            throw new Error('Empty analysis list must skip report opening with skipped_no_analysis_reports.');
        }
        this.outcomes.cirsPostureAnalysis = 'passed';
        logPart2SmokeEvent(
            'PART2_CIRS_POSTURE_ANALYSIS_NAVIGATION_VERIFIED',
            buildPart2CirsPostureAnalysisVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('cirs posture analysis navigation');
    }

    logAnalysisReportVerified(result: Part2AnalysisReportVerifiedInput): void {
        if (!result.combinedPassed) {
            throw new Error('Analysis Report Part 2 outcome requires combinedPassed.');
        }
        if (result.deletionMode === 'off' && result.reportDeletionStage !== 'Skipped') {
            throw new Error('Deletion-off Part 2 requires reportDeletion Skipped.');
        }
        this.outcomes.analysisReport = 'passed';
        logPart2SmokeEvent(
            'PART2_ANALYSIS_REPORT_VERIFIED',
            buildPart2AnalysisReportVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('analysis report combined smoke');
    }

    logComparisonReportVerified(result: Part2ComparisonReportVerifiedInput): void {
        if (!result.combinedPassed) {
            throw new Error('Comparison Report Part 2 outcome requires combinedPassed.');
        }
        this.outcomes.comparisonReport = 'passed';
        logPart2SmokeEvent(
            'PART2_COMPARISON_REPORT_VERIFIED',
            buildPart2ComparisonReportVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('comparison report combined smoke');
    }

    logLogoutVerified(evidence: LogoutRunEvidence): void {
        this.outcomes.logout = 'passed';
        logPart2SmokeEvent(
            'PART2_LOGOUT_VERIFIED',
            buildPart2LogoutVerifiedPayload(this.accountEmail, evidence)
        );
        this.stepCompleted('logout');
    }

    markFeatureFailed(step: Part2StepName): void {
        this.stopTimingForStep(step, true);
        if (step === 'login existing account') {
            this.outcomes.login = 'failed';
        } else if (step === 'limit dialog checks') {
            this.outcomes.limitDialog = 'failed';
        } else if (step === 'cirs record creation and list navigation') {
            this.outcomes.cirsRecordNavigation = 'failed';
        } else if (step === 'cirs response details') {
            this.outcomes.cirsResponseDetails = 'failed';
        } else if (
            step === 'cirs handwritten note creation' ||
            step === 'cirs handwritten note update' ||
            step === 'cirs handwritten note delete'
        ) {
            this.outcomes.cirsHandwrittenNotes = 'failed';
        } else if (step === 'cirs takeover handover CRUD') {
            this.outcomes.cirsTakeoverHandover = 'failed';
        } else if (step === 'cirs posture analysis navigation') {
            this.outcomes.cirsPostureAnalysis = 'failed';
        } else if (step === 'analysis report combined smoke') {
            this.outcomes.analysisReport = 'failed';
        } else if (step === 'comparison report combined smoke') {
            this.outcomes.comparisonReport = 'failed';
        } else {
            this.outcomes.logout = 'failed';
        }
    }

    private markFirstIncompleteFeatureFailed(): void {
        if (this.lastStartedStep) {
            this.markFeatureFailed(this.lastStartedStep);
            return;
        }
        if (this.outcomes.login !== 'passed') {
            this.outcomes.login = 'failed';
            return;
        }
        if (this.outcomes.limitDialog !== 'passed') {
            this.outcomes.limitDialog = 'failed';
            return;
        }
        if (this.outcomes.cirsRecordNavigation !== 'passed') {
            this.outcomes.cirsRecordNavigation = 'failed';
            return;
        }
        if (this.outcomes.cirsResponseDetails !== 'passed') {
            this.outcomes.cirsResponseDetails = 'failed';
            return;
        }
        if (this.outcomes.cirsHandwrittenNotes !== 'passed') {
            this.outcomes.cirsHandwrittenNotes = 'failed';
            return;
        }
        if (this.outcomes.cirsTakeoverHandover !== 'passed') {
            this.outcomes.cirsTakeoverHandover = 'failed';
            return;
        }
        if (this.outcomes.cirsPostureAnalysis !== 'passed') {
            this.outcomes.cirsPostureAnalysis = 'failed';
            return;
        }
        if (this.outcomes.analysisReport !== 'passed') {
            this.outcomes.analysisReport = 'failed';
            return;
        }
        if (this.outcomes.comparisonReport !== 'passed') {
            this.outcomes.comparisonReport = 'failed';
            return;
        }
        this.outcomes.logout = 'failed';
    }

    logRunCompleted(pageUrl: string): void {
        const location = sanitizePageLocation(pageUrl);
        logPart2SmokeEvent('PART2_RUN_COMPLETED', {
            accountEmail: this.accountEmail,
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            featureOutcomes: { ...this.outcomes },
            finalOrigin: location.origin,
            finalPathname: location.pathname,
        });
    }

    logRunFailed(error: unknown, pageUrl: string): void {
        this.markFirstIncompleteFeatureFailed();
        const location = sanitizePageLocation(pageUrl);
        logPart2SmokeEvent('PART2_RUN_FAILED', {
            accountEmail: this.accountEmail,
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            featureOutcomes: { ...this.outcomes },
            finalOrigin: location.origin,
            finalPathname: location.pathname,
            failureReason: sanitizeFailureReason(error),
        });
    }
}
