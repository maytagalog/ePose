/** Standalone History smoke defaults (Nikolas Samuel report on staging). */
export const ANALYSIS_REPORT_HISTORY_SMOKE_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
export const ANALYSIS_REPORT_HISTORY_SMOKE_ANALYSIS_ID = 'a871ea8f-c5e8-4fbd-b933-75fe8e2a144f';

export type AnalysisReportHistorySmokeTarget = {
    customerId: string;
    analysisId: string;
    customerDisplayNameHint: string | null;
    customerFuriganaHint: string | null;
};

export function resolveAnalysisReportHistorySmokeTarget(): AnalysisReportHistorySmokeTarget {
    const customerId =
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID?.trim() || ANALYSIS_REPORT_HISTORY_SMOKE_CUSTOMER_ID;
    const analysisId =
        process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID?.trim() || ANALYSIS_REPORT_HISTORY_SMOKE_ANALYSIS_ID;

    return {
        customerId,
        analysisId,
        customerDisplayNameHint: process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_NAME?.trim() || null,
        customerFuriganaHint: process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_FURIGANA?.trim() || null,
    };
}
