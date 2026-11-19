import { test, expect } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../../../analysisReport/analysisReportTestIds';
import { openAnalysisReportActionsMenu } from '../../../../../analysisReport/displaySettings/analysisReportDisplayItemSettingsFlow';
import {
    closeAnalysisReportShareQrModalDialog,
    expectAnalysisReportShareQrModalDialog,
} from '../../../../../analysisReport/sharing/qrCode/analysisReportShareQrModal';
import { runAnalysisReportShareQrOpenCloseFlow } from '../../../../../analysisReport/sharing/qrCode/analysisReportShareQrFlow';
import {
    ANALYSIS_REPORT_SHARE_QR_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_SHARE_QR_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_SHARE_QR_FIXTURE_ORIGIN,
    installAnalysisReportShareQrFixtureShell,
} from './analysisReportShareQrFixtureShell';

const FIXTURE_ORIGIN = ANALYSIS_REPORT_SHARE_QR_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_SHARE_QR_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_SHARE_QR_FIXTURE_ANALYSIS_ID;

test.describe.configure({ mode: 'serial' });

test('share QR: menu → dialog → Close → same report (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportShareQrFixtureShell(page, { __arvShareQrFailsOpen: false });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const evidence = await runAnalysisReportShareQrOpenCloseFlow(
        page,
        CUSTOMER_ID,
        ANALYSIS_ID,
        FIXTURE_ORIGIN
    );
    expect(evidence.qrDialogOpened).toBe(true);
    expect(evidence.qrDialogClosed).toBe(true);
    expect(evidence.reportStillReady).toBe(true);
    expect(evidence.failureStep).toBeNull();
});

test('share QR: dialog fails to open (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportShareQrFixtureShell(page, { __arvShareQrFailsOpen: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportShareQrOpenCloseFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN)
    ).rejects.toThrow(/qr_dialog_open|visible|dialog/i);
});

test('share QR: dialog remains visible after Close (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportShareQrFixtureShell(page, { __arvShareQrCloseFails: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportShareQrOpenCloseFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN)
    ).rejects.toThrow(/qr_dialog_close|hidden|Close/i);
});

test('share QR: outer test-id root may lack visible box while inner dialog is open (fixture)', async ({
    page,
}) => {
    test.setTimeout(60000);
    await installAnalysisReportShareQrFixtureShell(page, {
        __arvShareQrRootNoBoundingBox: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrOpen).click();

    const root = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrDialog);
    await expect(root).not.toBeVisible();

    const inner = await expectAnalysisReportShareQrModalDialog(page);
    await expect(inner).toBeVisible();

    await closeAnalysisReportShareQrModalDialog(inner);
});
