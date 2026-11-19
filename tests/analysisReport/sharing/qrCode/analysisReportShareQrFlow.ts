import { expect, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../analysisReportTestIds';
import { STG_APP_ORIGIN } from '../../../login/existingUserLoginFlow';
import { openAnalysisReportActionsMenu } from '../../displaySettings/analysisReportDisplayItemSettingsFlow';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
    navigateToPinnedAnalysisReport,
} from '../../reportView/analysisReportSingleReportLocators';
import { AnalysisReportViewFlowError } from '../../reportView/analysisReportViewErrors';
import {
    closeAnalysisReportShareQrModalDialog,
    expectAnalysisReportShareQrModalDialog,
} from './analysisReportShareQrModal';
import type { AnalysisReportShareQrRunEvidence } from './analysisReportShareQrReporting';

const ACTION_TIMEOUT_MS = 15000;

export async function openAnalysisReportShareQrFromActionsMenu(page: Page): Promise<void> {
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(menu).toHaveAttribute('data-report-view', 'single');
    const qrOpen = menu.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrOpen);
    await expect(qrOpen).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await qrOpen.click({ timeout: ACTION_TIMEOUT_MS });
}

/**
 * Open report → actions menu → share QR → verify one visible inner dialog → Close → report still ready.
 */
export async function runAnalysisReportShareQrOpenCloseFlow(
    page: Page,
    customerId: string,
    analysisId: string,
    appOrigin?: string
): Promise<AnalysisReportShareQrRunEvidence> {
    const evidence: AnalysisReportShareQrRunEvidence = {
        customerId,
        analysisId,
        qrDialogOpened: false,
        qrDialogClosed: false,
        reportStillReady: false,
        failureStep: null,
    };

    const origin = appOrigin ?? STG_APP_ORIGIN;

    try {
        await navigateToPinnedAnalysisReport(page, origin, customerId, analysisId);

        await openAnalysisReportActionsMenu(page);
        await openAnalysisReportShareQrFromActionsMenu(page);

        const visibleDialogs = page.getByRole('dialog').locator('visible=true');
        let innerDialog;
        try {
            innerDialog = await expectAnalysisReportShareQrModalDialog(page);
            await expect(visibleDialogs).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
        } catch (e) {
            evidence.failureStep = 'qr_dialog_open_or_single_visible';
            throw e;
        }
        evidence.qrDialogOpened = true;

        try {
            await closeAnalysisReportShareQrModalDialog(innerDialog);
        } catch (e) {
            evidence.failureStep = 'qr_dialog_close';
            throw e;
        }
        evidence.qrDialogClosed = true;

        try {
            await assertAnalysisReportReady(page, customerId, analysisId);
            await assertAnalysisReportRouteIdentity(page, origin, customerId, analysisId);
        } catch (e) {
            evidence.failureStep = 'report_still_ready';
            throw e;
        }
        evidence.reportStillReady = true;

        return evidence;
    } catch (e) {
        if (evidence.failureStep === null) {
            evidence.failureStep = 'unknown';
        }
        if (e instanceof AnalysisReportViewFlowError) {
            throw e;
        }
        throw e;
    }
}
