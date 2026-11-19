import type { Page } from '@playwright/test';
import {
    assertPostureAnalysisFullListRoute,
    postureAnalysisFullListUrlPattern,
} from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { expect } from '@playwright/test';
import { postureAnalysisFullListContainer } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import { assertCustomerReportHistoryListReady } from './analysisReportHistoryCustomerReadiness';
import { ANALYSIS_ID_ATTR, ANALYSIS_REPORT_ROW_TEST_ID, CUSTOMER_ID_ATTR } from '../analysisReportTestIds';

const NAVIGATION_TIMEOUT_MS = 30000;

/** Standalone History endpoint: customer history list visible and terminal (populated with source row). */
export async function assertCustomerReportHistoryListTerminal(
    page: Page,
    customerId: string,
    appOrigin: string,
    sourceAnalysisId: string
): Promise<void> {
    await assertPostureAnalysisFullListRoute(page, customerId, appOrigin);
    await expect(page).toHaveURL(postureAnalysisFullListUrlPattern(customerId), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await assertCustomerReportHistoryListReady(page, customerId);
    const historyList = postureAnalysisFullListContainer(page);
    await expect(historyList).toBeVisible();
    const sourceRow = historyList
        .locator(
            `[data-testid="${ANALYSIS_REPORT_ROW_TEST_ID}"][${CUSTOMER_ID_ATTR}="${customerId}"][${ANALYSIS_ID_ATTR}="${sourceAnalysisId}"]`
        )
        .locator('visible=true');
    await expect(sourceRow, 'configured source report row on customer history list').toHaveCount(1);
}
