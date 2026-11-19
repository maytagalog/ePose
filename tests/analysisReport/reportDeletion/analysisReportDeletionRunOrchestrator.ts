import type { Browser, Page, TestInfo } from '@playwright/test';
import { loginExistingUserForPart2, resolvePart2LoginAccount } from '../../login/existingUserLoginFlow';
import {
    type AnalysisReportDeletionRunConfig,
    resolveAnalysisReportDeletionRunConfig,
} from './analysisReportDeletionConfig';
import { selectOldestCustomerHistoryReport } from './analysisReportDeletionOldestSelection';
import {
    acquireDeletionSubmissionLock,
    assertPlanAllowsCancelOrReserve,
    assertPlanAllowsDeleteOnce,
    createDeletionPlan,
    loadDeletionPlan,
    persistDeletionSubmissionIntent,
    releaseDeletionSubmissionLock,
    updateDeletionPlan,
    type AnalysisReportDeletionPlan,
} from './analysisReportDeletionPlanLedger';
import { isDeletionFixtureOrigin } from './analysisReportDeletionFixtureMode';
import { AnalysisReportDeletionPlanError } from './analysisReportDeletionErrors';
import {
    executeAnalysisReportDeletionCancelFlow,
    executeAnalysisReportDeletionOnce,
} from './analysisReportDeletionFlow';
import { revalidatePinnedDeletionPlanOnHistory } from './analysisReportDeletionTargetValidation';
import { revalidateCombinedPinnedDeletionPlanOnHistory } from '../smoke/analysisReportCombinedHistoryOrderSelection';
import { resolveDeletionPlanChronologyBasis } from './analysisReportDeletionPlanChronology';
import {
    AnalysisReportDeletionStageTracker,
    markOpenDeletionStagesFailed,
    type AnalysisReportDeletionFlowStage,
} from './analysisReportDeletionStageTracker';
import {
    attachAnalysisReportDeletionEvidence,
    reportActualDeletionPassed,
    type AnalysisReportDeletionRunEvidence,
} from './analysisReportDeletionReporting';
import { AnalysisReportDeleteRequestGuardInstallError } from './analysisReportDeletionRequest';
import { resolveAnalysisReportDeletionRunContext } from './analysisReportDeletionRunContext';
import { loadCustomerHistoryCatalogFromNetwork } from './analysisReportCustomerHistoryApiCatalog';
import { abortCaptureOnFailure } from './analysisReportCustomerHistoryNetworkCapture';
import { finalizeDeletionAbsenceCheck } from './analysisReportDeletionTargetValidation';

export type RunAnalysisReportDeletionOptions = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account?: { email: string; password: string };
    appOrigin: string;
    config?: AnalysisReportDeletionRunConfig;
    /** Path A: caller already left the page on verified customer history. */
    startOnCustomerHistory?: boolean;
};

function buildEvidence(
    options: RunAnalysisReportDeletionOptions,
    tracker: AnalysisReportDeletionStageTracker,
    runContext: ReturnType<typeof resolveAnalysisReportDeletionRunContext>,
    config: AnalysisReportDeletionRunConfig,
    plan: AnalysisReportDeletionPlan | null
): AnalysisReportDeletionRunEvidence {
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        mode: config.mode,
        planId: plan?.planId ?? config.planId,
        customerId: config.customerId,
        analysisId: plan?.analysisId ?? null,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        plan,
        stages: tracker.toRecord(),
        actualDeletionReported: reportActualDeletionPassed(tracker),
        failureStep: null,
        deleteRequestGuardInstall: null,
    };
}

export async function runAnalysisReportDeletionStandalone(
    options: RunAnalysisReportDeletionOptions
): Promise<{ evidence: AnalysisReportDeletionRunEvidence; primaryError: unknown }> {
    const tracker = new AnalysisReportDeletionStageTracker();
    const runContext = resolveAnalysisReportDeletionRunContext(options.testInfo);
    const config = options.config ?? resolveAnalysisReportDeletionRunConfig(options.appOrigin);
    const evidence = buildEvidence(options, tracker, runContext, config, null);
    let primaryError: unknown = null;
    let plan: AnalysisReportDeletionPlan | null = null;

    try {
        tracker.enter('configuration');
        if (config.mode === 'off') {
            const skipStages = [
                'login',
                'historyNavigation',
                'historyRouteReadiness',
                'historyCompleteness',
                'oldestTargetSelection',
                'pinnedPlanValidation',
                'reportIdentity',
                'deleteConfirmationDialog',
                'cancellationVerification',
                'persistentReservation',
                'deletionSubmission',
                'apiResult',
                'successUiNavigation',
                'freshHistoryAbsenceVerification',
            ] as const;
            for (const stage of skipStages) {
                tracker.skip(stage);
            }
            tracker.pass('configuration');
            evidence.stages = tracker.toRecord();
            return { evidence, primaryError: null };
        }
        tracker.pass('configuration');

        const fixtureMode =
            isDeletionFixtureOrigin(options.appOrigin) || isDeletionFixtureOrigin(options.page.url());

        if (!options.startOnCustomerHistory) {
            tracker.enter('login');
            const account = options.account ?? resolvePart2LoginAccount();
            await loginExistingUserForPart2(options.page, account);
            tracker.pass('login');
        } else {
            tracker.skip('login');
        }

        tracker.enter('historyNavigation');
        let historyCatalog: Awaited<ReturnType<typeof loadCustomerHistoryCatalogFromNetwork>>;
        try {
            if (fixtureMode && !options.startOnCustomerHistory) {
                await options.page.goto(
                    `${options.appOrigin}/customers/${config.customerId!}/posture-analysis-report`
                );
            }
            historyCatalog = await loadCustomerHistoryCatalogFromNetwork(
                options.page,
                options.appOrigin,
                config.customerId!,
                { reload: !fixtureMode || !options.startOnCustomerHistory }
            );
        } catch (error) {
            abortCaptureOnFailure(null, error);
            throw error;
        }
        tracker.pass('historyNavigation');

        tracker.enter('historyRouteReadiness');
        tracker.pass('historyRouteReadiness');

        tracker.enter('historyCompleteness');
        if (!historyCatalog.catalogComplete) {
            throw new AnalysisReportDeletionPlanError('Initial history capture did not reach catalog completeness.');
        }
        tracker.pass('historyCompleteness');

        const sessionAccountId = historyCatalog.accountId;

        if (config.mode === 'cancel') {
            tracker.enter('oldestTargetSelection');
            const selection = await selectOldestCustomerHistoryReport(
                options.page,
                options.appOrigin,
                config.customerId!,
                sessionAccountId,
                config.tieBreakAnalysisId,
                { catalog: historyCatalog }
            );
            plan = createDeletionPlan(options.appOrigin, selection);
            evidence.plan = plan;
            evidence.planId = plan.planId;
            evidence.analysisId = plan.analysisId;
            tracker.pass('oldestTargetSelection');
            assertPlanAllowsCancelOrReserve(plan);

            await executeAnalysisReportDeletionCancelFlow(
                options.page,
                options.appOrigin,
                plan,
                config.deleteApiUrl,
                {
                    onStageEnter: (stage) => tracker.enter(stage),
                    onStagePass: (stage) => tracker.pass(stage),
                }
            );
            plan = updateDeletionPlan(plan.planId, {
                lifecycle: 'cancel_verified',
                cancelVerifiedAt: new Date().toISOString(),
            });
            evidence.plan = plan;
            tracker.skip('pinnedPlanValidation');
            tracker.skip('persistentReservation');
            tracker.skip('deletionSubmission');
            tracker.skip('apiResult');
            tracker.skip('successUiNavigation');
            tracker.skip('freshHistoryAbsenceVerification');
        }

        if (config.mode === 'delete-once') {
            tracker.skip('oldestTargetSelection');
            tracker.enter('pinnedPlanValidation');
            plan = loadDeletionPlan(config.planId!);
            assertPlanAllowsDeleteOnce(plan);
            if (plan.customerId !== config.customerId) {
                throw new Error('Plan customerId does not match ANALYSIS_REPORT_DELETION_CUSTOMER_ID.');
            }
            if (!plan.accountId?.trim() || !plan.deleteRequestId?.trim()) {
                throw new AnalysisReportDeletionPlanError(
                    'Pinned plan lacks verified accountId/deleteRequestId; run cancel-only preflight again.'
                );
            }
            if (plan.accountId !== sessionAccountId) {
                throw new AnalysisReportDeletionPlanError(
                    `Session accountId ${sessionAccountId} != pinned plan accountId ${plan.accountId}.`
                );
            }
            const chronologyBasis = resolveDeletionPlanChronologyBasis(plan);
            if (chronologyBasis === 'history-order-newest-first') {
                await revalidateCombinedPinnedDeletionPlanOnHistory(
                    options.page,
                    options.appOrigin,
                    plan
                );
            } else {
                await revalidatePinnedDeletionPlanOnHistory(
                    options.page,
                    options.appOrigin,
                    plan,
                    config.tieBreakAnalysisId
                );
            }
            evidence.plan = plan;
            evidence.planId = plan.planId;
            evidence.analysisId = plan.analysisId;
            tracker.pass('pinnedPlanValidation');

            tracker.enter('persistentReservation');
            acquireDeletionSubmissionLock(plan.planId);
            tracker.pass('persistentReservation');

            let submissionIntentPersisted = false;
            const activePlan = plan;
            let apiStagesPassed = false;
            try {
                await executeAnalysisReportDeletionOnce(
                    options.page,
                    options.appOrigin,
                    activePlan,
                    config.deleteApiUrl,
                    {
                        onBeforeDestructiveSubmit: () => {
                            submissionIntentPersisted = true;
                            plan = persistDeletionSubmissionIntent(activePlan.planId);
                        },
                        onDeleteRequestGuardInstalled: (diagnostics) => {
                            evidence.deleteRequestGuardInstall = diagnostics;
                        },
                        onStageEnter: (stage) => tracker.enter(stage),
                        onStagePass: (stage) => {
                            tracker.pass(stage);
                            if (stage === 'apiResult') {
                                apiStagesPassed = true;
                            }
                        },
                    }
                );
                tracker.enter('freshHistoryAbsenceVerification');
                await finalizeDeletionAbsenceCheck(options.page, options.appOrigin, plan);
                tracker.pass('freshHistoryAbsenceVerification');
                plan = updateDeletionPlan(plan.planId, {
                    lifecycle: 'completed',
                    completedAt: new Date().toISOString(),
                    submittedAt: plan.submittedAt ?? new Date().toISOString(),
                });
                releaseDeletionSubmissionLock();
            } catch (error) {
                const message = error instanceof Error ? error.message.slice(0, 300) : 'delete_failed';
                if (tracker.outcome('apiResult') === 'Passed' && !apiStagesPassed) {
                    tracker.fail('apiResult');
                }
                if (submissionIntentPersisted) {
                    plan = updateDeletionPlan(activePlan.planId, {
                        lifecycle: 'uncertain',
                        lastError: message,
                        submittedAt: plan?.submittedAt ?? new Date().toISOString(),
                    });
                } else {
                    plan = updateDeletionPlan(activePlan.planId, {
                        lifecycle: 'cancel_verified',
                        lastError: message,
                    });
                    releaseDeletionSubmissionLock();
                }
                if (!apiStagesPassed) {
                    for (const stage of [
                        'deletionSubmission',
                        'apiResult',
                        'successUiNavigation',
                        'freshHistoryAbsenceVerification',
                    ] as const) {
                        if (tracker.outcome(stage) === 'Not reached') {
                            tracker.skip(stage);
                        }
                    }
                } else {
                    if (tracker.outcome('freshHistoryAbsenceVerification') === 'Not reached') {
                        tracker.enter('freshHistoryAbsenceVerification');
                        tracker.fail('freshHistoryAbsenceVerification');
                    }
                }
                throw error;
            }
            evidence.plan = plan;
            tracker.skip('cancellationVerification');
        }
    } catch (error) {
        primaryError = error;
        markOpenDeletionStagesFailed(tracker);
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : 'deletion_run_failed';
        if (
            error instanceof AnalysisReportDeleteRequestGuardInstallError &&
            evidence.deleteRequestGuardInstall === null
        ) {
            evidence.deleteRequestGuardInstall = error.installDiagnostics;
        }
    }

    evidence.stages = tracker.toRecord();
    evidence.plan = plan;
    evidence.actualDeletionReported = reportActualDeletionPassed(tracker);
    return { evidence, primaryError };
}

export async function runAnalysisReportDeletionFromCustomerHistory(
    options: Omit<RunAnalysisReportDeletionOptions, 'startOnCustomerHistory'>
): Promise<{ evidence: AnalysisReportDeletionRunEvidence; primaryError: unknown }> {
    return runAnalysisReportDeletionStandalone({ ...options, startOnCustomerHistory: true });
}

export async function finalizeAnalysisReportDeletionRun(
    testInfo: TestInfo,
    evidence: AnalysisReportDeletionRunEvidence,
    primaryError: unknown
): Promise<void> {
    let attachError: unknown = null;
    try {
        await attachAnalysisReportDeletionEvidence(testInfo, evidence);
    } catch (error) {
        attachError = error;
        console.warn('Failed to attach analysis-report-deletion evidence:', error);
    }
    if (primaryError) {
        throw primaryError;
    }
    if (attachError) {
        throw attachError;
    }
}

export { reconcilePinnedDeletionPlanOnPage } from './analysisReportDeletionReconciliation';
