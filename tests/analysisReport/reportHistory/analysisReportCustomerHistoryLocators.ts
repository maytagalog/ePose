import { expect, type Locator, type Page } from '@playwright/test';
import { postureAnalysisFullListContainer } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import {
    ANALYSIS_ID_ATTR,
    ANALYSIS_REPORT_ROW_TEST_ID,
    CUSTOMER_ID_ATTR,
} from '../analysisReportTestIds';

const ACTION_TIMEOUT_MS = 15000;

export function customerHistoryReportRowLocator(
    historyList: Locator,
    customerId: string,
    analysisId: string
): Locator {
    return historyList.locator(
        `[data-testid="${ANALYSIS_REPORT_ROW_TEST_ID}"][${CUSTOMER_ID_ATTR}="${customerId}"][${ANALYSIS_ID_ATTR}="${analysisId}"]`
    );
}

/** Resolve exactly one visible source row; scroll into view (ordinary list; no blind scroll loops). */
export async function resolveCustomerHistorySourceRow(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<Locator> {
    const historyList = postureAnalysisFullListContainer(page);
    const row = customerHistoryReportRowLocator(historyList, customerId, analysisId).locator('visible=true');
    await expect(row, 'exactly one visible customer-history row for source report').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await row.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
    return row;
}

export async function assertCustomerHistorySourceRowVisible(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<Locator> {
    return resolveCustomerHistorySourceRow(page, customerId, analysisId);
}

export async function clickCustomerHistoryReportRowByIdentity(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<void> {
    const row = await resolveCustomerHistorySourceRow(page, customerId, analysisId);
    await row.click({ timeout: ACTION_TIMEOUT_MS });
}
