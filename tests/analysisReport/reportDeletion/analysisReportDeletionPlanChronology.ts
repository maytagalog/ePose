import type { AnalysisReportDeletionPlan } from './analysisReportDeletionPlanLedger';
import { AnalysisReportDeletionPlanError } from './analysisReportDeletionErrors';

export type DeletionPlanChronologyBasis = 'measuredAt' | 'history-order-newest-first';

export function resolveDeletionPlanChronologyBasis(plan: AnalysisReportDeletionPlan): DeletionPlanChronologyBasis {
    if (
        plan.chronologyBasis === 'history-order-newest-first' ||
        plan.chronologyBasis === 'measuredAt'
    ) {
        return plan.chronologyBasis;
    }
    const env = process.env.ANALYSIS_REPORT_DELETION_CHRONOLOGY_BASIS?.trim();
    if (env === 'history-order-newest-first' || env === 'measuredAt') {
        return env;
    }
    return 'measuredAt';
}

export function assertHistoryOrderResumeChronologyDeclared(plan: AnalysisReportDeletionPlan): void {
    const basis = resolveDeletionPlanChronologyBasis(plan);
    if (basis !== 'history-order-newest-first') {
        throw new AnalysisReportDeletionPlanError(
            `Resume requires history-order-newest-first revalidation; set plan.chronologyBasis or ANALYSIS_REPORT_DELETION_CHRONOLOGY_BASIS=history-order-newest-first (got ${basis}).`
        );
    }
}
