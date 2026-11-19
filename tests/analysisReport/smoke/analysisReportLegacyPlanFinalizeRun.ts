import type { Page, TestInfo } from '@playwright/test';
import { loginExistingUserForPart2 } from '../../login/existingUserLoginFlow';
import {
    finalizeReconciledAbsentDeletionPlan,
    type ReconciledAbsentPlanFinalizationEvidence,
} from './analysisReportDeletionPlanReconciliationFinalize';
import { loadDeletionPlan } from '../reportDeletion/analysisReportDeletionPlanLedger';
import { resolveAnalysisReportFullRunContext } from './analysisReportFullRunContext';
import {
    ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID,
    ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_TARGET_ANALYSIS_ID,
} from './analysisReportFullSmokeConfig';

export type LegacyPlanFinalizeRunEvidence = {
    runId: string;
    runOutputRoot: string;
    planId: string;
    customerId: string;
    finalization: ReconciledAbsentPlanFinalizationEvidence;
    stagingReadOnly: true;
    localLedgerWrites: true;
    note: string;
};

export async function runAnalysisReportLegacyPlanFinalizeStandalone(options: {
    page: Page;
    testInfo: TestInfo;
    account: { email: string; password: string };
    appOrigin: string;
    planId: string;
    customerId: string;
    tieBreakAnalysisId: string | null;
}): Promise<LegacyPlanFinalizeRunEvidence> {
    const runContext = resolveAnalysisReportFullRunContext(options.testInfo);
    await loginExistingUserForPart2(options.page, options.account);
    const expectedTargetAnalysisId = resolveLegacyFinalizeExpectedTargetAnalysisId(options.planId);
    const finalization = await finalizeReconciledAbsentDeletionPlan({
        page: options.page,
        appOrigin: options.appOrigin,
        planId: options.planId,
        expectedTargetAnalysisId,
        evidenceRef: `${runContext.runOutputRoot}/legacy-plan-reconciliation.json`,
        tieBreakAnalysisId: options.tieBreakAnalysisId,
    });
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        planId: options.planId,
        customerId: options.customerId,
        finalization,
        stagingReadOnly: true,
        localLedgerWrites: true,
        note:
            'Staging: read-only reconciliation (no delete POST). Local ledger: reconciled_absent + optional lock release for matching planId only.',
    };
}

export function defaultLegacyFinalizePlanId(): string {
    return (
        process.env.ANALYSIS_REPORT_LEGACY_FINALIZE_PLAN_ID?.trim() ||
        process.env.ANALYSIS_REPORT_FULL_RECONCILE_PLAN_ID?.trim() ||
        ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID
    );
}

/** Pinned analysis id for reconciliation — env override, else ledger plan record (no substitution). */
export function resolveLegacyFinalizeExpectedTargetAnalysisId(planId: string): string {
    const fromEnv = process.env.ANALYSIS_REPORT_DELETION_TARGET_ANALYSIS_ID?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    return loadDeletionPlan(planId).analysisId;
}
