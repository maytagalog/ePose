import { resolveAnalysisReportDeletionMode } from '../reportDeletion/analysisReportDeletionConfig';
import { loadDeletionPlan, assertPlanAllowsDeleteOnce } from '../reportDeletion/analysisReportDeletionPlanLedger';
import { preflightGmailApiReadAccess } from '../../../utils/gmail';
import {
    AnalysisReportFullSmokeConfigError,
    rejectDestructiveRepeatRun,
    type AnalysisReportFullSmokeConfig,
} from './analysisReportFullSmokeConfig';
import { assertDeletionPlanNotLegacyReconciled } from './analysisReportFullDeletionGuards';
import { assertCombinedSmokeNotBlockedByDeletionSubmissionLock } from './analysisReportCombinedDeletionSubmissionLockGuard';

const BLOCKING_PLAN_LIFECYCLES = new Set([
    'submitted',
    'completed',
    'uncertain',
    'reconciled_absent',
    'reserved',
    'abandoned_before_submission',
]);

/**
 * Validate destructive/combined settings before display-settings mutation or email send.
 */
export async function validateCombinedSmokeBeforeMutations(config: AnalysisReportFullSmokeConfig): Promise<void> {
    rejectDestructiveRepeatRun();

    if (!config.source.analysisId?.trim()) {
        throw new AnalysisReportFullSmokeConfigError(
            'Combined smoke source analysisId must be pinned during preflight before feature mutations.'
        );
    }

    assertCombinedSmokeNotBlockedByDeletionSubmissionLock();

    if (!config.shareEmailRecipient.includes('@')) {
        throw new AnalysisReportFullSmokeConfigError('Share-email recipient must be a valid address.');
    }

    await preflightGmailApiReadAccess();

    if (config.deletionMode === 'off') {
        return;
    }

    if (config.deletionMode === 'delete-once' && config.deletionPlanId) {
        assertDeletionPlanNotLegacyReconciled(config.deletionPlanId);
        const plan = loadDeletionPlan(config.deletionPlanId);
        if (BLOCKING_PLAN_LIFECYCLES.has(plan.lifecycle)) {
            throw new AnalysisReportFullSmokeConfigError(
                `Refusing external plan ${plan.planId} lifecycle=${plan.lifecycle} for combined delete-once.`
            );
        }
        assertPlanAllowsDeleteOnce(plan);
        if (plan.customerId !== config.deletionCustomerId) {
            throw new AnalysisReportFullSmokeConfigError('External deletion plan customerId mismatch.');
        }
    }

    if (config.deletionMode === 'delete-once' && !config.deletionPlanId) {
        const mode = resolveAnalysisReportDeletionMode();
        if (mode !== 'delete-once') {
            throw new AnalysisReportFullSmokeConfigError('Internal error: delete-once mode expected.');
        }
    }
}
