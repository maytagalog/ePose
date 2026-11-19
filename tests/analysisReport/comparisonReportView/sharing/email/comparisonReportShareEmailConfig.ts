import { preflightGmailApiReadAccess } from '../../../../../utils/gmail';
import { resolveAnalysisReportShareEmailSmokeTarget } from '../../../sharing/email/analysisReportShareEmailSmokeConfig';
import { ComparisonReportShareEmailFlowError } from './comparisonReportShareEmailErrors';

export type ComparisonReportShareEmailValidatedConfig = {
    recipientEmail: string;
};

/**
 * Reuses single-report share email recipient resolution (no invented inbox).
 */
export async function validateComparisonReportShareEmailEnvironment(): Promise<ComparisonReportShareEmailValidatedConfig> {
    const target = resolveAnalysisReportShareEmailSmokeTarget();
    const recipientEmail = target.recipientEmail.trim();
    if (!recipientEmail.includes('@')) {
        throw new ComparisonReportShareEmailFlowError(
            `ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT must be a valid email address (got "${recipientEmail || 'empty'}").`
        );
    }
    await preflightGmailApiReadAccess();
    return { recipientEmail };
}