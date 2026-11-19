import { expect, type Locator, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../../../analysisReportTestIds';
import type { ComparisonSlotAnalysisIds } from '../../comparisonReportViewLocators';
import {
    analysisReportShareQrDialogRoot,
    closeAnalysisReportShareQrModalDialog,
    expectAnalysisReportShareQrCodeVisible,
    expectAnalysisReportShareQrModalDialog,
} from '../../../sharing/qrCode/analysisReportShareQrModal';

const ACTION_TIMEOUT_MS = 15000;

export async function expectComparisonReportShareQrModalDialog(
    page: Page,
    expectedPair: ComparisonSlotAnalysisIds
): Promise<Locator> {
    const root = analysisReportShareQrDialogRoot(page);
    await expect(root).toHaveAttribute(
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.reportView,
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.reportViewComparison,
        { timeout: ACTION_TIMEOUT_MS }
    );
    await expect(root).toHaveAttribute(
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.leftAnalysisId,
        expectedPair.leftAnalysisId,
        { timeout: ACTION_TIMEOUT_MS }
    );
    await expect(root).toHaveAttribute(
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.rightAnalysisId,
        expectedPair.rightAnalysisId,
        { timeout: ACTION_TIMEOUT_MS }
    );
    return expectAnalysisReportShareQrModalDialog(page);
}

export {
    analysisReportShareQrDialogRoot,
    closeAnalysisReportShareQrModalDialog,
    expectAnalysisReportShareQrCodeVisible,
};