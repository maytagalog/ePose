/**
 * Standalone Analysis Report email-share smoke targets (Nikolas Samuel / fixture inbox).
 * Does not use the registration email allocator or edit customer email in the app.
 */
export const ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_RECIPIENT = 'aardvarkomonstrosesquip1230000@gmail.com';

export const ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_CUSTOMER_ID =
    'ce3f36fd-07c3-4eda-ad87-35631acc39cc';

export const ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID =
    'a871ea8f-c5e8-4fbd-b933-75fe8e2a144f';

export type AnalysisReportShareEmailSmokeTarget = {
    customerId: string;
    analysisId: string;
    recipientEmail: string;
};

export function resolveAnalysisReportShareEmailSmokeTarget(): AnalysisReportShareEmailSmokeTarget {
    const customerId =
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID?.trim() ||
        ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_CUSTOMER_ID;
    const analysisId =
        process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID?.trim() ||
        ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID;
    const recipientEmail =
        process.env.ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT?.trim() ||
        ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_RECIPIENT;

    return { customerId, analysisId, recipientEmail };
}
