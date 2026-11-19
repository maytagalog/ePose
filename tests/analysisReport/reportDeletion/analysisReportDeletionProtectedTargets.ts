import { ANALYSIS_REPORT_HISTORY_SMOKE_ANALYSIS_ID } from '../reportHistory/analysisReportHistorySmokeConfig';
import { ANALYSIS_REPORT_PDF_SMOKE_ANALYSIS_ID } from '../reportPDF/analysisReportPdfSmokeConfig';
import { ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID } from '../sharing/email/analysisReportShareEmailSmokeConfig';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';

/** Analysis IDs reserved for other standalone smoke features — oldest selection must not target these. */
const PROTECTED_ANALYSIS_IDS = new Set<string>([
    ANALYSIS_REPORT_HISTORY_SMOKE_ANALYSIS_ID,
    ANALYSIS_REPORT_PDF_SMOKE_ANALYSIS_ID,
    ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID,
]);

export function assertAnalysisReportDeletionTargetNotProtected(analysisId: string): void {
    if (PROTECTED_ANALYSIS_IDS.has(analysisId)) {
        throw new AnalysisReportDeletionFlowError(
            `Oldest report ${analysisId} is protected for other smoke features; stop without substituting another target.`
        );
    }
}
