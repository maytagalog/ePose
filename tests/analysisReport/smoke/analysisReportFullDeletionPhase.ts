import type { Browser, Page, TestInfo } from '@playwright/test';
import {
    acquireDeletionSubmissionLock,
    assertPlanAllowsCancelOrReserve,
    createDeletionPlan,
    loadDeletionPlan,
    persistDeletionSubmissionIntent,
    releaseDeletionSubmissionLock,
    updateDeletionPlan,
    type AnalysisReportDeletionPlan,
} from '../reportDeletion/analysisReportDeletionPlanLedger';
import {
    AnalysisReportDeletionStageTracker,
    markOpenDeletionStagesFailed,
} from '../reportDeletion/analysisReportDeletionStageTracker';
import {
    attachAnalysisReportDeletionEvidence,
    reportCombinedSimplifiedCancelPassed,
    reportCombinedSimplifiedDeleteOncePassed,
    type AnalysisReportDeletionRunEvidence,
} from '../reportDeletion/analysisReportDeletionReporting';
import { resolveAnalysisReportDeletionRunContext } from '../reportDeletion/analysisReportDeletionRunContext';
import type { OldestReportSelection } from '../reportDeletion/analysisReportDeletionOldestSelection';
import type { AnalysisReportFullSmokeConfig } from './analysisReportFullSmokeConfig';
import { gotoCustomerReportHistoryList } from '../reportDeletion/analysisReportDeletionNavigation';
import {
    COMBINED_SIMPLIFIED_DELETION_COVERAGE,
    executeAnalysisReportSimplifiedDeletionCancelFlow,
    executeAnalysisReportSimplifiedDeletionOnceFlow,
    openPinnedHistoryOrderNewestReport,
} from './analysisReportSimplifiedDeletionFlow';

const COMBINED_DELETION_SKIP_STAGES = [
    'login',
    'historyNavigation',
    'historyRouteReadiness',
    'historyCompleteness',
    'oldestTargetSelection',
    'apiResult',
    'freshHistoryAbsenceVerification',
] as const;

function skipCombinedSimplifiedDeletionSetup(tracker: AnalysisReportDeletionStageTracker): void {
    for (const stage of COMBINED_DELETION_SKIP_STAGES) {
        tracker.skip(stage);
    }
}

export async function persistCombinedDeletionTargetPlan(
    appOrigin: string,
    selection: OldestReportSelection
): Promise<AnalysisReportDeletionPlan> {
    const plan = createDeletionPlan(appOrigin, selection);
    assertPlanAllowsCancelOrReserve(plan);
    return plan;
}

export async function runCombinedCancelOnlyPhase(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan,
    tracker: AnalysisReportDeletionStageTracker
): Promise<AnalysisReportDeletionPlan> {
    await openPinnedHistoryOrderNewestReport(page, appOrigin, plan, {
        onStageEnter: (stage) => tracker.enter(stage),
        onStagePass: (stage) => tracker.pass(stage),
    });
    await executeAnalysisReportSimplifiedDeletionCancelFlow(page, plan, {
        onStageEnter: (stage) => tracker.enter(stage),
        onStagePass: (stage) => tracker.pass(stage),
    });
    return updateDeletionPlan(plan.planId, {
        lifecycle: 'cancel_verified',
        cancelVerifiedAt: new Date().toISOString(),
    });
}

export async function runCombinedEmbeddedDeleteOncePhase(options: {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    appOrigin: string;
    plan: AnalysisReportDeletionPlan;
    account: { email: string; password: string };
}): Promise<{ evidence: AnalysisReportDeletionRunEvidence; primaryError: unknown }> {
    const tracker = new AnalysisReportDeletionStageTracker();
    const runContext = resolveAnalysisReportDeletionRunContext(options.testInfo);
    let plan = loadDeletionPlan(options.plan.planId);
    const evidence: AnalysisReportDeletionRunEvidence = {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        mode: 'delete-once',
        planId: plan.planId,
        customerId: plan.customerId,
        analysisId: plan.analysisId,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        plan,
        stages: tracker.toRecord(),
        actualDeletionReported: false,
        failureStep: null,
        deleteRequestGuardInstall: null,
        deletionCoverage: COMBINED_SIMPLIFIED_DELETION_COVERAGE,
    };

    skipCombinedSimplifiedDeletionSetup(tracker);

    let primaryError: unknown = null;
    let submissionIntentPersisted = false;

    try {
        plan = await runCombinedCancelOnlyPhase(options.page, options.appOrigin, plan, tracker);
        evidence.plan = plan;

        tracker.enter('persistentReservation');
        acquireDeletionSubmissionLock(plan.planId);
        tracker.pass('persistentReservation');

        const activePlan = plan;
        await gotoCustomerReportHistoryList(options.page, options.appOrigin, activePlan.customerId);
        await openPinnedHistoryOrderNewestReport(options.page, options.appOrigin, activePlan, {
            onStageEnter: (stage) => tracker.enter(stage),
            onStagePass: (stage) => tracker.pass(stage),
        });

        await executeAnalysisReportSimplifiedDeletionOnceFlow(options.page, options.appOrigin, activePlan, {
                onBeforeDestructiveSubmit: () => {
                    submissionIntentPersisted = true;
                    plan = persistDeletionSubmissionIntent(activePlan.planId);
                },
                onStageEnter: (stage) => tracker.enter(stage),
                onStagePass: (stage) => tracker.pass(stage),
            }
        );

        plan = updateDeletionPlan(plan.planId, {
            lifecycle: 'completed',
            completedAt: new Date().toISOString(),
            submittedAt: plan.submittedAt ?? new Date().toISOString(),
        });
        releaseDeletionSubmissionLock();
        evidence.plan = plan;
    } catch (error) {
        primaryError = error;
        const message = error instanceof Error ? error.message.slice(0, 300) : 'delete_failed';
        const active = loadDeletionPlan(options.plan.planId);
        if (submissionIntentPersisted) {
            plan = updateDeletionPlan(active.planId, {
                lifecycle: 'uncertain',
                lastError: message,
                submittedAt: plan?.submittedAt ?? new Date().toISOString(),
            });
        } else if (plan.lifecycle !== 'cancel_verified') {
            plan = updateDeletionPlan(active.planId, {
                lifecycle: 'cancel_verified',
                lastError: message,
            });
            try {
                releaseDeletionSubmissionLock();
            } catch {
                void error;
            }
        }
        markOpenDeletionStagesFailed(tracker);
        evidence.failureStep = message;
        evidence.plan = plan;
    }

    evidence.stages = tracker.toRecord();
    evidence.actualDeletionReported = reportCombinedSimplifiedDeleteOncePassed(tracker);
    return { evidence, primaryError };
}

export async function runCombinedDeletionPhase(options: {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account: { email: string; password: string };
    appOrigin: string;
    config: AnalysisReportFullSmokeConfig;
    persistedPlan: AnalysisReportDeletionPlan | null;
}): Promise<{ evidence: AnalysisReportDeletionRunEvidence; primaryError: unknown }> {
    if (options.config.deletionMode === 'cancel' && options.persistedPlan) {
        const tracker = new AnalysisReportDeletionStageTracker();
        const runContext = resolveAnalysisReportDeletionRunContext(options.testInfo);
        let primaryError: unknown = null;
        let plan = options.persistedPlan;
        const evidence: AnalysisReportDeletionRunEvidence = {
            runId: runContext.runId,
            runOutputRoot: runContext.runOutputRoot,
            mode: 'cancel',
            planId: plan.planId,
            customerId: plan.customerId,
            analysisId: plan.analysisId,
            browserProject: options.testInfo.project.name,
            browserName: options.browser.browserType().name(),
            browserVersion: options.browser.version(),
            plan,
            stages: tracker.toRecord(),
            actualDeletionReported: false,
            failureStep: null,
            deleteRequestGuardInstall: null,
            deletionCoverage: COMBINED_SIMPLIFIED_DELETION_COVERAGE,
        };
        skipCombinedSimplifiedDeletionSetup(tracker);
        try {
            plan = await runCombinedCancelOnlyPhase(options.page, options.appOrigin, plan, tracker);
            evidence.plan = plan;
        } catch (error) {
            primaryError = error;
            markOpenDeletionStagesFailed(tracker);
            evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : 'cancel_failed';
        }
        evidence.stages = tracker.toRecord();
        evidence.actualDeletionReported = false;
        if (!primaryError && !reportCombinedSimplifiedCancelPassed(tracker)) {
            primaryError = new Error('Combined simplified cancel verification did not pass.');
        }
        return { evidence, primaryError };
    }

    if (options.config.deletionMode === 'delete-once') {
        const plan =
            options.persistedPlan ??
            (options.config.deletionPlanId ? loadDeletionPlan(options.config.deletionPlanId) : null);
        if (!plan) {
            throw new Error('Combined delete-once missing persisted or external plan.');
        }
        return runCombinedEmbeddedDeleteOncePhase({
            page: options.page,
            browser: options.browser,
            testInfo: options.testInfo,
            appOrigin: options.appOrigin,
            plan,
            account: options.account,
        });
    }

    throw new Error('Combined deletion phase missing persisted plan.');
}

export async function attachCombinedDeletionEvidence(
    testInfo: TestInfo,
    evidence: AnalysisReportDeletionRunEvidence
): Promise<void> {
    await attachAnalysisReportDeletionEvidence(testInfo, evidence);
}
