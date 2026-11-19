import { expect, type Browser, type Page, type Response } from '@playwright/test';
import {
    ANALYSIS_ID_ATTR,
    ANALYSIS_REPORT_LOAD_STATES,
    ANALYSIS_REPORT_SHARE_EMAIL_SUCCESS_TOAST,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
    CUSTOMER_ID_ATTR,
    POST_SHARE_REPORT_EMAIL_URL,
    REPORT_LOAD_STATE_ATTR,
} from '../../analysisReportTestIds';
import { openAnalysisReportActionsMenu } from '../../displaySettings/analysisReportDisplayItemSettingsFlow';
import { AnalysisReportViewFlowError } from '../../reportView/analysisReportViewErrors';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
    navigateToPinnedAnalysisReport,
} from '../../reportView/analysisReportSingleReportLocators';
import { STG_APP_ORIGIN } from '../../../login/existingUserLoginFlow';
import { newStagingSmokeBrowserContextOptions } from '../../../e2e/shared/stagingSmokeBrowserContext';
import {
    GmailAuthError,
    isGmailAuthenticationFailure,
    preflightGmailApiReadAccess,
    waitForAnalysisReportShareEmailMatch,
} from '../../../../utils/gmail';
import {
    assertShareEmailModalDisplaysRecipient,
    analysisReportShareEmailSubmitButton,
    expectAnalysisReportShareEmailModalDialog,
} from './analysisReportShareEmailModal';
import {
    type AnalysisReportShareEmailRunEvidence,
    type AnalysisReportShareEmailRunTracker,
} from './analysisReportShareEmailReporting';
import {
    completeSharedReportGuestVerification,
    isFetchSharedReportResponse,
    SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
} from './analysisReportSharedReportVerification';

const ACTION_TIMEOUT_MS = 15000;
const EMAIL_WAIT_TIMEOUT_MS = 120000;
const EMAIL_POLL_INTERVAL_MS = 10000;

export class AnalysisReportShareEmailFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnalysisReportShareEmailFlowError';
    }
}

export class AnalysisReportShareEmailSendGuard {
    private sent = false;

    markSent(): void {
        if (this.sent) {
            throw new AnalysisReportShareEmailFlowError(
                'Analysis report share email was already sent; refusing a second 送信する click.'
            );
        }
        this.sent = true;
    }
}

function isShareReportEmailResponse(res: Response): boolean {
    return res.url().startsWith(POST_SHARE_REPORT_EMAIL_URL) && res.request().method() === 'POST';
}

async function openAnalysisReportShareEmailFromActionsMenu(page: Page): Promise<void> {
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(menu).toHaveAttribute('data-report-view', 'single');
    const emailOpen = menu.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen);
    await expect(emailOpen).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await emailOpen.click({ timeout: ACTION_TIMEOUT_MS });
}

async function assertShareEmailSuccessToast(page: Page): Promise<void> {
    const success = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailSuccess);
    await expect(success).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(success).toContainText(ANALYSIS_REPORT_SHARE_EMAIL_SUCCESS_TOAST);
}

export async function assertSharedAnalysisReportReady(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<void> {
    const report = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.report);
    await expect(report).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect
        .poll(async () => report.getAttribute(REPORT_LOAD_STATE_ATTR), {
            timeout: ACTION_TIMEOUT_MS,
            message: 'shared analysis-report ready',
        })
        .toBe(ANALYSIS_REPORT_LOAD_STATES.ready);
    await expect(report).toHaveAttribute(CUSTOMER_ID_ATTR, customerId);
    await expect(report).toHaveAttribute(ANALYSIS_ID_ATTR, analysisId);
}

export async function verifySharedReportInUnauthenticatedContext(
    browser: Browser,
    sharedReportUrl: string,
    customerId: string,
    analysisId: string
): Promise<void> {
    const context = await browser.newContext(newStagingSmokeBrowserContextOptions());
    const guestPage = await context.newPage();
    try {
        const fetchSharedReportPromise = guestPage.waitForResponse(isFetchSharedReportResponse, {
            timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
        });
        await guestPage.goto(sharedReportUrl, { waitUntil: 'domcontentloaded' });
        await completeSharedReportGuestVerification(
            guestPage,
            fetchSharedReportPromise,
            customerId,
            analysisId
        );
    } finally {
        await context.close();
    }
}

export type RunAnalysisReportShareEmailFlowOptions = {
    tracker?: AnalysisReportShareEmailRunTracker;
    validationMode?: import('./shareEmailValidationMode').ShareEmailValidationMode;
    /** When true, caller is already on the target Analysis Report (Part 2 handoff). */
    skipPinnedNavigation?: boolean;
};

export type RunAnalysisReportShareEmailUiSendConfirmationOptions = {
    /** When false, success toast alone passes; share_report response is not required (Part 2 UI mode). */
    requireShareReportHttpResponse?: boolean;
};

export async function runAnalysisReportShareEmailUiSendConfirmation(
    page: Page,
    customerId: string,
    analysisId: string,
    recipientEmail: string,
    sendGuard: AnalysisReportShareEmailSendGuard,
    options?: RunAnalysisReportShareEmailUiSendConfirmationOptions
): Promise<{
    modalRecipientVerified: boolean;
    sendAttemptedOnce: boolean;
    sendSuccessToastVerified: boolean;
    sendStartedAtMs: number;
}> {
    await openAnalysisReportActionsMenu(page);
    await openAnalysisReportShareEmailFromActionsMenu(page);

    const innerDialog = await expectAnalysisReportShareEmailModalDialog(page);
    const dialogRoot = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailDialog);
    await expect(dialogRoot).toHaveAttribute(ANALYSIS_ID_ATTR, analysisId, {
        timeout: ACTION_TIMEOUT_MS,
    });

    await assertShareEmailModalDisplaysRecipient(innerDialog, recipientEmail);

    const requireShareReportHttpResponse = options?.requireShareReportHttpResponse ?? false;
    sendGuard.markSent();

    const submit = analysisReportShareEmailSubmitButton(innerDialog);
    await expect(submit).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    const sendStartedAtMs = Date.now();

    if (requireShareReportHttpResponse) {
        const shareResponsePromise = page.waitForResponse(isShareReportEmailResponse, {
            timeout: ACTION_TIMEOUT_MS,
        });
        await submit.click({ timeout: ACTION_TIMEOUT_MS });
        const shareResponse = await shareResponsePromise;
        if (shareResponse.status() < 200 || shareResponse.status() >= 300) {
            throw new AnalysisReportShareEmailFlowError(
                `share_report returned HTTP ${shareResponse.status()}`
            );
        }
    } else {
        await submit.click({ timeout: ACTION_TIMEOUT_MS });
    }

    await expect(innerDialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    await assertShareEmailSuccessToast(page);

    return {
        modalRecipientVerified: true,
        sendAttemptedOnce: true,
        sendSuccessToastVerified: true,
        sendStartedAtMs,
    };
}

export async function runAnalysisReportShareEmailFlow(
    page: Page,
    browser: Browser,
    customerId: string,
    analysisId: string,
    recipientEmail: string,
    appOrigin?: string,
    options?: RunAnalysisReportShareEmailFlowOptions
): Promise<AnalysisReportShareEmailRunEvidence> {
    const validationMode = options?.validationMode ?? 'full-inbox-guest';
    const evidence: AnalysisReportShareEmailRunEvidence = {
        customerId,
        analysisId,
        recipientEmail,
        modalRecipientVerified: false,
        sendAttemptedOnce: false,
        sendSuccessToastVerified: false,
        gmailMessageId: null,
        sharedReportUrl: null,
        sharedReportAnalysisVerified: false,
        failureStep: null,
        validationMode,
    };

    const origin = appOrigin ?? STG_APP_ORIGIN;
    const sendGuard = new AnalysisReportShareEmailSendGuard();
    let currentStep = 'open_analysis_report';

    try {
        if (!options?.skipPinnedNavigation) {
            await navigateToPinnedAnalysisReport(page, origin, customerId, analysisId);
        }

        if (validationMode === 'full-inbox-guest') {
            currentStep = 'gmail_preflight';
            await preflightGmailApiReadAccess();
        }

        currentStep = 'share_email_ui_send';
        const ui = await runAnalysisReportShareEmailUiSendConfirmation(
            page,
            customerId,
            analysisId,
            recipientEmail,
            sendGuard,
            { requireShareReportHttpResponse: validationMode === 'full-inbox-guest' }
        );
        evidence.modalRecipientVerified = ui.modalRecipientVerified;
        evidence.sendAttemptedOnce = ui.sendAttemptedOnce;
        evidence.sendSuccessToastVerified = ui.sendSuccessToastVerified;

        if (validationMode === 'ui-send-confirmation') {
            await assertAnalysisReportReady(page, customerId, analysisId);
            await assertAnalysisReportRouteIdentity(page, origin, customerId, analysisId);
            options?.tracker?.logVerified(evidence);
            return evidence;
        }

        currentStep = 'wait_for_gmail';
        const emailMatch = await waitForAnalysisReportShareEmailMatch(
            recipientEmail,
            analysisId,
            ui.sendStartedAtMs,
            EMAIL_WAIT_TIMEOUT_MS,
            EMAIL_POLL_INTERVAL_MS
        );
        evidence.gmailMessageId = emailMatch.messageId;
        evidence.sharedReportUrl = emailMatch.sharedReportUrl;

        currentStep = 'verify_shared_report_link';
        await verifySharedReportInUnauthenticatedContext(
            browser,
            emailMatch.sharedReportUrl,
            customerId,
            analysisId
        );
        evidence.sharedReportAnalysisVerified = true;

        await assertAnalysisReportReady(page, customerId, analysisId);
        await assertAnalysisReportRouteIdentity(page, origin, customerId, analysisId);

        options?.tracker?.logVerified(evidence);
        return evidence;
    } catch (e) {
        if (isGmailAuthenticationFailure(e)) {
            evidence.failureStep = currentStep === 'wait_for_gmail' ? 'gmail_auth' : 'gmail_preflight';
        } else {
            evidence.failureStep = currentStep;
        }
        options?.tracker?.logFailed(e, evidence);
        if (e instanceof GmailAuthError) {
            throw new AnalysisReportShareEmailFlowError(e.message);
        }
        if (e instanceof AnalysisReportViewFlowError || e instanceof AnalysisReportShareEmailFlowError) {
            throw e;
        }
        throw e;
    }
}
