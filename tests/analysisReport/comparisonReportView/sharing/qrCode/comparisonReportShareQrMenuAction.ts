import { expect, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../../../analysisReportTestIds';
import { openAnalysisReportActionsMenu } from '../../../displaySettings/analysisReportDisplayItemSettingsFlow';
import { ComparisonReportShareQrFlowError } from './comparisonReportShareQrErrors';

const ACTION_TIMEOUT_MS = 15000;

/**
 * Comparison ellipsis menu (bundle: data-report-view=comparison on analysis-report-actions-menu).
 */
export async function openComparisonReportActionsMenu(page: Page): Promise<void> {
    await openAnalysisReportActionsMenu(page);
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu, 'comparison actions menu visible').toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(menu).toHaveAttribute(
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.reportView,
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.reportViewComparison,
        { timeout: ACTION_TIMEOUT_MS }
    );
}

export async function clickComparisonReportShareQrMenuAction(page: Page): Promise<void> {
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    const qrOpen = menu.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrOpen);
    await expect(qrOpen, 'comparison share QR menu action').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(qrOpen).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await qrOpen.click({ timeout: ACTION_TIMEOUT_MS });
}

export async function openComparisonReportShareQrFromActionsMenu(page: Page): Promise<void> {
    try {
        await openComparisonReportActionsMenu(page);
        await clickComparisonReportShareQrMenuAction(page);
    } catch (error) {
        throw new ComparisonReportShareQrFlowError(
            error instanceof Error ? error.message : String(error)
        );
    }
}