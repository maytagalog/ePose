import { expect, type Page } from '@playwright/test';
import { postureAnalysisFullListUrlPattern } from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../analysisReportTestIds';
import { openAnalysisReportActionsMenu } from '../displaySettings/analysisReportDisplayItemSettingsFlow';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

/**
 * Ellipsis menu → analysis-report-history-open (§14 過去のレポート).
 * Does not use the bottom customer-name history control.
 */
export async function openAnalysisReportHistoryFromActionsMenu(
    page: Page,
    customerId: string
): Promise<void> {
    await openAnalysisReportActionsMenu(page);
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(menu).toHaveAttribute('data-report-view', 'single');

    const historyAction = menu
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.historyOpenMenu)
        .locator('visible=true');
    await expect(historyAction, 'visible Report History action in actions menu').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });

    await historyAction.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(page).toHaveURL(postureAnalysisFullListUrlPattern(customerId), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
}

export async function assertActionsMenuClosed(page: Page): Promise<void> {
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}
