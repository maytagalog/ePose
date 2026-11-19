/**
 * Standalone Analysis Report PDF smoke defaults (Nikolas Samuel report on staging).
 * Override via ANALYSIS_REPORT_VIEW_* / optional ANALYSIS_REPORT_VIEW_CUSTOMER_NAME.
 */
export const ANALYSIS_REPORT_PDF_SMOKE_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
export const ANALYSIS_REPORT_PDF_SMOKE_ANALYSIS_ID = 'a871ea8f-c5e8-4fbd-b933-75fe8e2a144f';

export type AnalysisReportPdfSmokeTarget = {
    customerId: string;
    analysisId: string;
    customerDisplayNameHint: string | null;
};

export function resolveAnalysisReportPdfSmokeTarget(): AnalysisReportPdfSmokeTarget {
    const customerId =
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID?.trim() || ANALYSIS_REPORT_PDF_SMOKE_CUSTOMER_ID;
    const analysisId =
        process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID?.trim() || ANALYSIS_REPORT_PDF_SMOKE_ANALYSIS_ID;
    const customerDisplayNameHint =
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_NAME?.trim() || null;

    return { customerId, analysisId, customerDisplayNameHint };
}
