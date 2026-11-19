import { expect, type Locator, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../analysisReportTestIds';

const ACTION_TIMEOUT_MS = 15000;

export function analysisReportShareQrDialogRoot(page: Page): Locator {
    return page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrDialog);
}

/**
 * Exactly one descendant role="dialog" under the share-QR test-id root; assert visible (not the outer root).
 */
export async function expectAnalysisReportShareQrModalDialog(page: Page): Promise<Locator> {
    const root = analysisReportShareQrDialogRoot(page);
    const dialogs = root.getByRole('dialog');
    await expect(dialogs).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    const inner = dialogs.first();
    await expect(inner).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return inner;
}

/** Trace 20261109-072008: Close via analysis-report-share-qr-close (とじる), scoped to inner dialog. */
export async function expectAnalysisReportShareQrCodeVisible(page: Page): Promise<Locator> {
    const root = analysisReportShareQrDialogRoot(page);
    const qrCode = root.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrCode);
    await expect(qrCode).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(qrCode).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return qrCode;
}

export async function closeAnalysisReportShareQrModalDialog(innerDialog: Locator): Promise<void> {
    const close = innerDialog.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrClose);
    await expect(close).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(close).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(close).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await close.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(innerDialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}
