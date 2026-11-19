import { expect, type Page } from '@playwright/test';
import { postureAnalysisFullListContainer } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import { POSTURE_ANALYSIS_TEST_IDS } from '../../CIRS/postureAnalysis/postureAnalysisTestIds';
import { ANALYSIS_ID_ATTR, CUSTOMER_ID_ATTR } from '../analysisReportTestIds';
import { AnalysisReportDeletionFlowError } from '../reportDeletion/analysisReportDeletionErrors';

const ACTION_TIMEOUT_MS = 15000;

/** DOM-only: first visible history row must match pinned customer/analysis (newest-first list order). */
export async function assertHistoryOrderNewestRowMatchesPin(
    page: Page,
    customerId: string,
    pinnedAnalysisId: string
): Promise<void> {
    const historyList = postureAnalysisFullListContainer(page);
    const items = historyList.getByTestId(POSTURE_ANALYSIS_TEST_IDS.item).locator('visible=true');
    await expect(items.first(), 'history list must expose a visible newest-first row').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const first = items.first();
    const rowCustomer = (await first.getAttribute(CUSTOMER_ID_ATTR))?.trim() ?? '';
    const rowAnalysis = (await first.getAttribute(ANALYSIS_ID_ATTR))?.trim() ?? '';
    if (rowCustomer !== customerId || rowAnalysis !== pinnedAnalysisId) {
        throw new AnalysisReportDeletionFlowError(
            `History newest row ${rowCustomer}/${rowAnalysis} != pinned ${customerId}/${pinnedAnalysisId}; no substitution.`
        );
    }
}
