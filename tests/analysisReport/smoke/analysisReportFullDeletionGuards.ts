import { assertAnalysisReportDeletionTargetNotProtected } from '../reportDeletion/analysisReportDeletionProtectedTargets';
import { AnalysisReportFullSmokeConfigError } from './analysisReportFullSmokeConfig';
import { AnalysisReportDeletionFlowError } from '../reportDeletion/analysisReportDeletionErrors';
import {
    ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID,
    ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_TARGET_ANALYSIS_ID,
} from './analysisReportFullSmokeConfig';

export function assertDeletionTargetDistinctFromSource(
    deletionAnalysisId: string,
    sourceAnalysisId: string
): void {
    assertAnalysisReportDeletionTargetNotProtected(deletionAnalysisId);
    if (deletionAnalysisId === sourceAnalysisId) {
        throw new AnalysisReportDeletionFlowError(
            'Measured-at oldest deletion target matches the pinned latest source report; stop without substituting another target.'
        );
    }
    if (deletionAnalysisId === ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_TARGET_ANALYSIS_ID) {
        throw new AnalysisReportFullSmokeConfigError(
            `Refusing legacy reconciled-absent target ${ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_TARGET_ANALYSIS_ID}.`
        );
    }
}

export function assertDeletionPlanNotLegacyReconciled(planId: string): void {
    if (planId === ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID) {
        throw new AnalysisReportFullSmokeConfigError(
            `Plan ${planId} is legacy reconciled-absent and cannot be submitted again.`
        );
    }
}
