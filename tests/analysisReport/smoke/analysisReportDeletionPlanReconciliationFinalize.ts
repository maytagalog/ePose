import type { Page } from '@playwright/test';
import {
    evaluateReconciliationVerification,
    reconcilePinnedDeletionPlanOnPage,
} from '../reportDeletion/analysisReportDeletionReconciliation';
import {
    loadDeletionPlan,
    releaseDeletionSubmissionLockForPlan,
    updateDeletionPlan,
} from '../reportDeletion/analysisReportDeletionPlanLedger';
import { AnalysisReportFullSmokeConfigError } from './analysisReportFullSmokeConfig';
export type ReconciledAbsentPlanFinalizationEvidence = {
    planId: string;
    targetAnalysisId: string;
    reconciliationVerified: boolean;
    pinnedRowPresent: string;
    apiCatalog: string;
    domRowCheck: string;
    lockReleased: boolean;
    evidenceRef: string;
    notes: string[];
};

export async function finalizeReconciledAbsentDeletionPlan(options: {
    page: Page;
    appOrigin: string;
    planId: string;
    expectedTargetAnalysisId: string;
    evidenceRef: string;
    tieBreakAnalysisId: string | null;
}): Promise<ReconciledAbsentPlanFinalizationEvidence> {
    const plan = loadDeletionPlan(options.planId);
    if (plan.analysisId !== options.expectedTargetAnalysisId) {
        throw new AnalysisReportFullSmokeConfigError(
            `Plan ${options.planId} analysisId ${plan.analysisId} != expected ${options.expectedTargetAnalysisId}.`
        );
    }
    if (plan.lifecycle === 'reconciled_absent') {
        return {
            planId: options.planId,
            targetAnalysisId: plan.analysisId,
            reconciliationVerified: true,
            pinnedRowPresent: 'no',
            apiCatalog: 'complete',
            domRowCheck: 'absent',
            lockReleased: false,
            evidenceRef: plan.reconciliationEvidenceRef ?? options.evidenceRef,
            notes: ['Plan already marked reconciled_absent.'],
        };
    }

    const reconcile = await reconcilePinnedDeletionPlanOnPage(
        options.page,
        options.appOrigin,
        options.planId,
        options.tieBreakAnalysisId
    );
    const verdict = evaluateReconciliationVerification(reconcile);
    if (!verdict.passed) {
        throw new AnalysisReportFullSmokeConfigError(
            `Reconciled-absent finalization refused: ${verdict.summary}`
        );
    }
    if (reconcile.pinnedRowPresent !== 'no' || reconcile.apiCatalog !== 'complete') {
        throw new AnalysisReportFullSmokeConfigError(
            'Reconciled-absent finalization requires complete API catalog and confirmed absence.'
        );
    }
    if (reconcile.domRowCheck !== 'absent') {
        throw new AnalysisReportFullSmokeConfigError(
            `Reconciled-absent finalization requires DOM absence (got ${reconcile.domRowCheck}).`
        );
    }

    updateDeletionPlan(options.planId, {
        lifecycle: 'reconciled_absent',
        reconciledAbsentAt: new Date().toISOString(),
        reconciliationEvidenceRef: options.evidenceRef,
        lastError: null,
    });
    let lockReleased = false;
    try {
        releaseDeletionSubmissionLockForPlan(options.planId);
        lockReleased = true;
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('No deletion submission lock')) {
            throw error;
        }
    }

    return {
        planId: options.planId,
        targetAnalysisId: plan.analysisId,
        reconciliationVerified: true,
        pinnedRowPresent: reconcile.pinnedRowPresent,
        apiCatalog: reconcile.apiCatalog,
        domRowCheck: reconcile.domRowCheck,
        lockReleased,
        evidenceRef: options.evidenceRef,
        notes: reconcile.notes,
    };
}
