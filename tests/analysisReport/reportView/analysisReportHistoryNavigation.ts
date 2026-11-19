import { expect, type Page } from '@playwright/test';
import { assertSelectedCustomerIdentity } from '../../accountRegistration/customerFlow';
import {
    assertCustomerDetailsCollapsedForCirs,
    assertCustomerListReadyForCirs,
    parseCustomerIdFromUrl,
} from '../../CIRS/cirsRecord/cirsRecordFlow';
import { CIRS_TEST_IDS, CUSTOMER_ID_ATTR } from '../../CIRS/cirsRecord/cirsRecordTestIds';
import {
    assertPostureAnalysisFullListItemCustomerIds,
    assertPostureAnalysisFullListReady,
} from '../../CIRS/postureAnalysis/postureAnalysisFullListReadiness';
import { postureAnalysisFullListContainer } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import { assertCustomerHistorySourceRowVisible } from '../reportHistory/analysisReportCustomerHistoryLocators';
import {
    clickPostureAnalysisFullListBack,
    postureAnalysisFullListUrlPattern,
} from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { postureAnalysisSelectedCustomerPath } from '../../CIRS/postureAnalysis/postureAnalysisTestIds';
import { ANALYSIS_REPORT_HISTORY_TEST_IDS } from '../analysisReportTestIds';
import { AnalysisReportViewFlowError } from './analysisReportViewErrors';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

export async function assertCustomerReportHistoryReady(
    page: Page,
    expectedCustomerId: string
): Promise<void> {
    await expect(page).toHaveURL(postureAnalysisFullListUrlPattern(expectedCustomerId), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    const historyList = postureAnalysisFullListContainer(page);
    await assertPostureAnalysisFullListReady(page, 'analysis_full_list');
    await assertPostureAnalysisFullListItemCustomerIds(historyList, expectedCustomerId, 'report_history');
}

export async function assertHistoryContainsReportRow(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<void> {
    await assertCustomerHistorySourceRowVisible(page, customerId, analysisId);
}

export async function clickHistoryBackToCustomerPage(
    page: Page,
    appOrigin: string,
    expectedCustomerId: string,
    customerNameHint?: string | null,
    customerFuriganaHint?: string | null
): Promise<void> {
    await clickPostureAnalysisFullListBack(page);
    await expect(postureAnalysisFullListContainer(page)).toBeHidden({
        timeout: NAVIGATION_TIMEOUT_MS,
    });

    const origin = new URL(page.url()).origin;
    if (origin !== appOrigin) {
        throw new AnalysisReportViewFlowError(`After history back, origin ${origin} != ${appOrigin}.`);
    }
    const pathname = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
    const expectedPath = postureAnalysisSelectedCustomerPath(expectedCustomerId);
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    if (routeCustomerId !== expectedCustomerId || pathname !== expectedPath) {
        throw new AnalysisReportViewFlowError(
            `After history back, expected ${expectedPath} for ${expectedCustomerId}, got ${pathname}.`
        );
    }

    await assertCustomerListReadyForCirs(page);
    const row = page.locator(
        `[data-testid="${CIRS_TEST_IDS.customerRow}"][${CUSTOMER_ID_ATTR}="${expectedCustomerId}"]`
    );
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const nameFromRow = (await row.getByTestId(CIRS_TEST_IDS.customerName).textContent())?.trim() ?? '';
    const customerName = customerNameHint?.trim() || nameFromRow;
    const customerFurigana = customerFuriganaHint?.trim() || customerName;
    if (!customerName) {
        throw new AnalysisReportViewFlowError('Customer name required to verify selected customer page.');
    }
    await assertSelectedCustomerIdentity(page, customerName, customerFurigana);
    await assertCustomerDetailsCollapsedForCirs(page.getByRole('main'));
}

export async function assertHistoryBackControlVisible(page: Page): Promise<void> {
    await expect(page.getByTestId(ANALYSIS_REPORT_HISTORY_TEST_IDS.back)).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}
