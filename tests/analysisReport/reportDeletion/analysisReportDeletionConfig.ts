import { AnalysisReportDeletionConfigError } from './analysisReportDeletionErrors';

export type AnalysisReportDeletionMode = 'off' | 'cancel' | 'delete-once';

export type AnalysisReportDeletionRunConfig = {
    mode: AnalysisReportDeletionMode;
    customerId: string | null;
    planId: string | null;
    appOrigin: string;
    tieBreakAnalysisId: string | null;
    deleteApiUrl: string | null;
};

const VALID_MODES = new Set<AnalysisReportDeletionMode>(['off', 'cancel', 'delete-once']);

export function resolveAnalysisReportDeletionMode(): AnalysisReportDeletionMode {
    const raw = process.env.ANALYSIS_REPORT_DELETION_MODE?.trim() || 'off';
    if (!VALID_MODES.has(raw as AnalysisReportDeletionMode)) {
        throw new AnalysisReportDeletionConfigError(
            `Invalid ANALYSIS_REPORT_DELETION_MODE="${raw}". Expected off|cancel|delete-once.`
        );
    }
    return raw as AnalysisReportDeletionMode;
}

export function resolveAnalysisReportDeletionRunConfig(appOrigin: string): AnalysisReportDeletionRunConfig {
    const mode = resolveAnalysisReportDeletionMode();
    const customerId = process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID?.trim() || null;
    const planId = process.env.ANALYSIS_REPORT_DELETION_PLAN_ID?.trim() || null;
    const tieBreakAnalysisId = process.env.ANALYSIS_REPORT_DELETION_TIE_BREAK_ANALYSIS_ID?.trim() || null;
    const deleteApiUrl = process.env.ANALYSIS_REPORT_DELETION_API_URL?.trim() || null;

    if (mode === 'off') {
        return { mode, customerId: null, planId: null, appOrigin, tieBreakAnalysisId: null, deleteApiUrl: null };
    }

    if (!customerId) {
        throw new AnalysisReportDeletionConfigError(
            `${mode} requires explicit ANALYSIS_REPORT_DELETION_CUSTOMER_ID (no default customer).`
        );
    }

    if (mode === 'delete-once' && !planId) {
        throw new AnalysisReportDeletionConfigError(
            'delete-once requires ANALYSIS_REPORT_DELETION_PLAN_ID from a prior cancel-only run.'
        );
    }

    return { mode, customerId, planId, appOrigin, tieBreakAnalysisId, deleteApiUrl };
}
