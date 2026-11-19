import { expect, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test';
import { newStagingSmokeBrowserContextOptions } from '../../../../e2e/shared/stagingSmokeBrowserContext';
import { POST_SHARE_REPORT_EMAIL_URL } from '../../../analysisReportTestIds';
import {
    assertComparisonReportViewReady,
    readComparisonSlotAnalysisIds,
    type ComparisonSlotAnalysisIds,
} from '../../comparisonReportViewLocators';
import { AnalysisReportShareEmailSendGuard } from '../../../sharing/email/analysisReportShareEmailFlow';
import {
    GmailAuthError,
    isGmailAuthenticationFailure,
    preflightGmailApiReadAccess,
    waitForComparisonReportShareEmailMatch,
} from '../../../../../utils/gmail';
import {
    assertComparisonShareEmailRecipient,
    assertComparisonShareEmailSuccessToast,
    comparisonShareEmailSubmitButton,
    expectComparisonReportShareEmailModalDialog,
} from './comparisonReportShareEmailModal';
import { openComparisonReportShareEmailFromActionsMenu } from './comparisonReportShareEmailMenuAction';
import {
    attachComparisonShareEmailFlowErrorEvidence,
    ComparisonReportShareEmailFlowError,
} from './comparisonReportShareEmailErrors';
import type { ComparisonReportShareEmailFlowEvidencePartial } from './comparisonReportShareEmailReporting';
import { redactComparisonShareUrlForEvidence } from './comparisonReportShareEmailReporting';
import {
    ComparisonReportShareEmailStageTracker,
    failEnteredComparisonShareEmailStages,
    markComparisonShareEmailExtendedStagesExcluded,
} from './comparisonReportShareEmailStageTracker';
import {
    completeSharedComparisonGuestVerification,
    isFetchSharedComparisonReportResponse,
    SHARED_COMPARISON_GUEST_ACTION_TIMEOUT_MS,
} from './comparisonReportSharedGuestVerification';
import type { ShareEmailValidationMode } from '../../../sharing/email/shareEmailValidationMode';

const ACTION_TIMEOUT_MS = 15000;
const EMAIL_WAIT_TIMEOUT_MS = 120000;
const EMAIL_POLL_INTERVAL_MS = 10000;

function isShareReportEmailResponse(res: Response): boolean {
    return res.url().startsWith(POST_SHARE_REPORT_EMAIL_URL) && res.request().method() === 'POST';
}

function assertPairUnchanged(before: ComparisonSlotAnalysisIds, after: ComparisonSlotAnalysisIds): void {
    if (
        after.leftAnalysisId !== before.leftAnalysisId ||
        after.rightAnalysisId !== before.rightAnalysisId
    ) {
        throw new ComparisonReportShareEmailFlowError(
            `Comparison pair changed after share email (before ${before.leftAnalysisId}/${before.rightAnalysisId}, after ${after.leftAnalysisId}/${after.rightAnalysisId}).`
        );
    }
}

export type RunComparisonReportShareEmailFromComparisonPageInput = {
    customerId: string;
    recipientEmail: string;
    validationMode?: ShareEmailValidationMode;
    skipGmailPreflight?: boolean;
    prepareGuestContext?: (context: BrowserContext) => Promise<void>;
};

function emptyPartial(
    tracker: ComparisonReportShareEmailStageTracker,
    validationMode: ShareEmailValidationMode
): ComparisonReportShareEmailFlowEvidencePartial {
    return {
        validationMode,
        preEmailLeftAnalysisId: null,
        preEmailRightAnalysisId: null,
        postEmailLeftAnalysisId: null,
        postEmailRightAnalysisId: null,
        modalRecipientVerified: false,
        sendAttemptedOnce: false,
        sendSuccessToastVerified: false,
        gmailMessageId: null,
        sharedComparisonUrlRedacted: null,
        guestComparisonVerified: false,
        guestSectionVisibility: null,
        comparisonPairPreserved: false,
        shareEmailStages: tracker.toRecord(),
        failureStep: null,
    };
}

/**
 * Reusable comparison share-email flow; caller already completed comparison setup/login.
 */
export async function runComparisonReportShareEmailFromComparisonPage(
    page: Page,
    browser: Browser,
    input: RunComparisonReportShareEmailFromComparisonPageInput,
    tracker: ComparisonReportShareEmailStageTracker
): Promise<ComparisonReportShareEmailFlowEvidencePartial> {
    const validationMode = input.validationMode ?? 'full-inbox-guest';
    const partial = emptyPartial(tracker, validationMode);

    const sendGuard = new AnalysisReportShareEmailSendGuard();
    let sharedComparisonUrl: string | null = null;

    try {
        const pairBefore = await readComparisonSlotAnalysisIds(page);
        partial.preEmailLeftAnalysisId = pairBefore.leftAnalysisId;
        partial.preEmailRightAnalysisId = pairBefore.rightAnalysisId;

        tracker.enter('ellipsisMenuOpen');
        await openComparisonReportShareEmailFromActionsMenu(page);
        tracker.pass('ellipsisMenuOpen');

        tracker.enter('shareEmailDialogVisible');
        const innerDialog = await expectComparisonReportShareEmailModalDialog(page, pairBefore);
        tracker.pass('shareEmailDialogVisible');

        tracker.enter('recipientDisplayed');
        await assertComparisonShareEmailRecipient(innerDialog, input.recipientEmail);
        partial.modalRecipientVerified = true;
        tracker.pass('recipientDisplayed');

        if (validationMode === 'full-inbox-guest' && !input.skipGmailPreflight) {
            await preflightGmailApiReadAccess();
        }

        tracker.enter('sendShareEmail');
        const submit = comparisonShareEmailSubmitButton(innerDialog);
        await expect(submit).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
        const sendStartedAtMs = Date.now();
        sendGuard.markSent();
        partial.sendAttemptedOnce = true;

        if (validationMode === 'full-inbox-guest') {
            const shareResponsePromise = page.waitForResponse(isShareReportEmailResponse, {
                timeout: ACTION_TIMEOUT_MS,
            });
            await submit.click({ timeout: ACTION_TIMEOUT_MS });
            const shareResponse = await shareResponsePromise;
            if (shareResponse.status() < 200 || shareResponse.status() >= 300) {
                throw new ComparisonReportShareEmailFlowError(
                    `share_report returned HTTP ${shareResponse.status()}`
                );
            }
        } else {
            await submit.click({ timeout: ACTION_TIMEOUT_MS });
        }
        tracker.pass('sendShareEmail');

        await expect(innerDialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        tracker.enter('sendSuccessConfirmation');
        await assertComparisonShareEmailSuccessToast(page);
        partial.sendSuccessToastVerified = true;
        tracker.pass('sendSuccessConfirmation');

        if (validationMode === 'ui-send-confirmation') {
            markComparisonShareEmailExtendedStagesExcluded(tracker);
            tracker.enter('comparisonPairPreserved');
            await assertComparisonReportViewReady(page, input.customerId);
            const pairAfter = await readComparisonSlotAnalysisIds(page);
            partial.postEmailLeftAnalysisId = pairAfter.leftAnalysisId;
            partial.postEmailRightAnalysisId = pairAfter.rightAnalysisId;
            assertPairUnchanged(pairBefore, pairAfter);
            partial.comparisonPairPreserved = true;
            tracker.pass('comparisonPairPreserved');
            partial.shareEmailStages = tracker.toRecord();
            return partial;
        }

        tracker.enter('gmailMessageReceived');
        const emailMatch = await waitForComparisonReportShareEmailMatch(
            input.recipientEmail,
            pairBefore.leftAnalysisId,
            pairBefore.rightAnalysisId,
            sendStartedAtMs,
            EMAIL_WAIT_TIMEOUT_MS,
            EMAIL_POLL_INTERVAL_MS
        );
        partial.gmailMessageId = emailMatch.messageId;
        sharedComparisonUrl = emailMatch.sharedComparisonUrl;
        partial.sharedComparisonUrlRedacted = redactComparisonShareUrlForEvidence(sharedComparisonUrl);
        tracker.pass('gmailMessageReceived');

        tracker.enter('guestComparisonReady');
        tracker.enter('guestSectionVisibility');
        const context = await browser.newContext(newStagingSmokeBrowserContextOptions());
        if (input.prepareGuestContext) {
            await input.prepareGuestContext(context);
        }
        const guestPage = await context.newPage();
        let guestSectionVisibility: Record<string, boolean> | null = null;
        try {
            const fetchPromise = guestPage.waitForResponse(isFetchSharedComparisonReportResponse, {
                timeout: SHARED_COMPARISON_GUEST_ACTION_TIMEOUT_MS,
            });
            await guestPage.goto(sharedComparisonUrl, { waitUntil: 'domcontentloaded' });
            guestSectionVisibility = await completeSharedComparisonGuestVerification(
                guestPage,
                fetchPromise,
                input.customerId,
                pairBefore.leftAnalysisId,
                pairBefore.rightAnalysisId,
                redactComparisonShareUrlForEvidence(sharedComparisonUrl)
            );
            partial.guestComparisonVerified = true;
            partial.guestSectionVisibility = guestSectionVisibility;
            tracker.pass('guestComparisonReady');
            tracker.pass('guestSectionVisibility');
        } catch (guestError) {
            failEnteredComparisonShareEmailStages(tracker);
            if (tracker.outcome('guestComparisonReady') === 'Entered') {
                tracker.fail('guestComparisonReady');
            }
            if (tracker.outcome('guestSectionVisibility') === 'Entered') {
                tracker.fail('guestSectionVisibility');
            }
            throw guestError;
        } finally {
            await context.close();
        }

        tracker.enter('comparisonPairPreserved');
        await assertComparisonReportViewReady(page, input.customerId);
        const pairAfter = await readComparisonSlotAnalysisIds(page);
        partial.postEmailLeftAnalysisId = pairAfter.leftAnalysisId;
        partial.postEmailRightAnalysisId = pairAfter.rightAnalysisId;
        assertPairUnchanged(pairBefore, pairAfter);
        partial.comparisonPairPreserved = true;
        tracker.pass('comparisonPairPreserved');
    } catch (error) {
        partial.failureStep = error instanceof Error ? error.message : String(error);
        if (isGmailAuthenticationFailure(error)) {
            partial.failureStep = 'gmail_auth';
        }
        partial.shareEmailStages = tracker.toRecord();
        failEnteredComparisonShareEmailStages(tracker);
        partial.shareEmailStages = tracker.toRecord();
        if (error instanceof GmailAuthError) {
            throw new ComparisonReportShareEmailFlowError(error.message, partial);
        }
        throw attachComparisonShareEmailFlowErrorEvidence(error, partial);
    }

    partial.shareEmailStages = tracker.toRecord();
    return partial;
}