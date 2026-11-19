export type AnalysisReportViewStepName =
    | 'starting report identity'
    | 'main menu analysis report list'
    | 'select report from all list'
    | 'single report readiness'
    | 'help dialogs'
    | 'report content sections'
    | 'muscle condition controls'
    | 'exercises and stretches'
    | 'customer history via bottom link'
    | 'history back navigation';

export type AnalysisReportViewStepStatus = 'Passed' | 'Failed' | 'Skipped' | 'Not reached';

export type AnalysisReportViewStepSummary = Record<
    AnalysisReportViewStepName,
    AnalysisReportViewStepStatus
>;

export type AnalysisReportHelpDialogOutcomeKey =
    | 'generationRatingHelp'
    | 'resultsHelp'
    | 'postureTypeHelp'
    | 'legAlignmentHelp'
    | 'muscleConditionHelp'
    | 'exercisesStretchesHelp';

export type AnalysisReportHelpDialogOutcomes = Partial<
    Record<AnalysisReportHelpDialogOutcomeKey, 'Passed' | 'Skipped'>
>;

export type AnalysisReportViewRunEvidence = {
    customerId: string;
    analysisId: string;
    accountEmail: string | null;
    stepSummary: AnalysisReportViewStepSummary;
    skipReasons: Partial<Record<AnalysisReportViewStepName, string>>;
    helpDialogOutcomes: AnalysisReportHelpDialogOutcomes;
    stepDurationsMs?: Partial<Record<AnalysisReportViewStepName, number>>;
    lastStartedStep: AnalysisReportViewStepName | null;
    lastCompletedStep: AnalysisReportViewStepName | null;
    finalPathname: string;
};

function initialStepSummary(): AnalysisReportViewStepSummary {
    return {
        'starting report identity': 'Not reached',
        'main menu analysis report list': 'Not reached',
        'select report from all list': 'Not reached',
        'single report readiness': 'Not reached',
        'help dialogs': 'Not reached',
        'report content sections': 'Not reached',
        'muscle condition controls': 'Not reached',
        'exercises and stretches': 'Not reached',
        'customer history via bottom link': 'Not reached',
        'history back navigation': 'Not reached',
    };
}

export function logAnalysisReportViewEvent(event: string, payload: Record<string, unknown>): void {
    console.log(event, JSON.stringify(payload));
}

export class AnalysisReportViewRunTracker {
    readonly accountEmail: string | null;
    customerId: string | null = null;
    analysisId: string | null = null;
    lastStartedStep: AnalysisReportViewStepName | null = null;
    lastCompletedStep: AnalysisReportViewStepName | null = null;
    private readonly stepStartedAtMs = new Map<AnalysisReportViewStepName, number>();
    readonly stepDurationsMs: Partial<Record<AnalysisReportViewStepName, number>> = {};
    readonly stepSummary: AnalysisReportViewStepSummary = initialStepSummary();
    readonly skipReasons: Partial<Record<AnalysisReportViewStepName, string>> = {};
    readonly helpDialogOutcomes: AnalysisReportHelpDialogOutcomes = {};

    constructor(options?: { accountEmail?: string | null }) {
        this.accountEmail = options?.accountEmail?.trim() ?? null;
    }

    bindIdentifiers(customerId: string, analysisId: string): void {
        this.customerId = customerId;
        this.analysisId = analysisId;
    }

    stepStarted(step: AnalysisReportViewStepName): void {
        this.lastStartedStep = step;
        this.stepStartedAtMs.set(step, performance.now());
        logAnalysisReportViewEvent('ANALYSIS_REPORT_VIEW_STEP_STARTED', {
            step,
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.analysisId ? { analysisId: this.analysisId } : {}),
        });
    }

    stepPassed(step: AnalysisReportViewStepName): void {
        this.stepSummary[step] = 'Passed';
        this.lastCompletedStep = step;
        const started = this.stepStartedAtMs.get(step);
        const durationMs = started !== undefined ? Math.round(performance.now() - started) : 0;
        this.stepDurationsMs[step] = durationMs;
        this.stepStartedAtMs.delete(step);
        logAnalysisReportViewEvent('ANALYSIS_REPORT_VIEW_STEP_PASSED', {
            step,
            durationMs,
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.analysisId ? { analysisId: this.analysisId } : {}),
        });
    }

    stepSkipped(step: AnalysisReportViewStepName, reason: string): void {
        this.stepSummary[step] = 'Skipped';
        this.skipReasons[step] = reason;
        this.lastCompletedStep = step;
    }

    stepFailed(step: AnalysisReportViewStepName): void {
        this.stepSummary[step] = 'Failed';
    }

    helpDialogOutcome(key: AnalysisReportHelpDialogOutcomeKey, status: 'Passed' | 'Skipped'): void {
        this.helpDialogOutcomes[key] = status;
    }

    /** Set only when unset — preserves e.g. Passed after muscle-phase exercises help. */
    helpDialogOutcomeIfUnset(key: AnalysisReportHelpDialogOutcomeKey, status: 'Passed' | 'Skipped'): void {
        if (this.helpDialogOutcomes[key] === undefined) {
            this.helpDialogOutcomes[key] = status;
        }
    }

    toEvidence(finalPathname: string): AnalysisReportViewRunEvidence {
        return {
            customerId: this.customerId ?? '',
            analysisId: this.analysisId ?? '',
            accountEmail: this.accountEmail,
            stepSummary: { ...this.stepSummary },
            skipReasons: { ...this.skipReasons },
            helpDialogOutcomes: { ...this.helpDialogOutcomes },
            stepDurationsMs: { ...this.stepDurationsMs },
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            finalPathname,
        };
    }

    baseFields(finalPathname: string): Record<string, unknown> {
        return {
            coverage: 'Analysis Report viewing',
            ...(this.accountEmail ? { accountEmail: this.accountEmail } : {}),
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.analysisId ? { analysisId: this.analysisId } : {}),
            stepSummary: { ...this.stepSummary },
            skipReasons: { ...this.skipReasons },
            helpDialogOutcomes: { ...this.helpDialogOutcomes },
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            finalPathname,
        };
    }

    logStarted(finalPathname: string, customerId: string, analysisId: string): void {
        this.bindIdentifiers(customerId, analysisId);
        logAnalysisReportViewEvent('ANALYSIS_REPORT_VIEW_STARTED', this.baseFields(finalPathname));
    }

    logCompleted(finalPathname: string): void {
        logAnalysisReportViewEvent('ANALYSIS_REPORT_VIEW_COMPLETED', this.baseFields(finalPathname));
    }

    logFailed(error: unknown, finalPathname: string): void {
        const reason = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
        logAnalysisReportViewEvent('ANALYSIS_REPORT_VIEW_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: reason,
        });
    }
}
