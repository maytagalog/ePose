import { expect, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../analysisReportTestIds';
import { openComparisonReportActionsMenu } from '../qrCode/comparisonReportShareQrMenuAction';
import { ComparisonReportShareEmailFlowError } from './comparisonReportShareEmailErrors';

const ACTION_TIMEOUT_MS = 15000;

export async function openComparisonReportShareEmailFromActionsMenu(page: Page): Promise<void> {
    try {
        await openComparisonReportActionsMenu(page);
        const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
        const emailOpen = menu.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen);
        await expect(emailOpen, 'comparison share email menu action').toHaveCount(1, {
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(emailOpen).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await emailOpen.click({ timeout: ACTION_TIMEOUT_MS });
    } catch (error) {
        throw new ComparisonReportShareEmailFlowError(
            error instanceof Error ? error.message : String(error)
        );
    }
}