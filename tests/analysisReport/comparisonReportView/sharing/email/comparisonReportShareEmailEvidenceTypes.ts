import type { ComparisonReportShareEmailStage, StageOutcome } from './comparisonReportShareEmailStageTracker';
import type { ShareEmailValidationMode } from '../../../sharing/email/shareEmailValidationMode';

export type ComparisonReportShareEmailFlowEvidencePartial = {
    validationMode?: ShareEmailValidationMode;
    preEmailLeftAnalysisId?: string | null;
    preEmailRightAnalysisId?: string | null;
    postEmailLeftAnalysisId?: string | null;
    postEmailRightAnalysisId?: string | null;
    modalRecipientVerified?: boolean;
    sendAttemptedOnce?: boolean;
    sendSuccessToastVerified?: boolean;
    gmailMessageId?: string | null;
    sharedComparisonUrlRedacted?: string | null;
    guestComparisonVerified?: boolean;
    guestSectionVisibility?: Record<string, boolean> | null;
    comparisonPairPreserved?: boolean;
    shareEmailStages?: Record<ComparisonReportShareEmailStage, StageOutcome>;
    failureStep?: string | null;
};