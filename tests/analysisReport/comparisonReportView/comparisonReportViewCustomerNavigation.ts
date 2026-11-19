import { expect, type Page } from '@playwright/test';
import {
    assertCustomerListReadyForCirs,
    CirsRecordFlowError,
} from '../../CIRS/cirsRecord/cirsRecordFlow';
import { CIRS_TEST_IDS, CUSTOMER_ID_ATTR } from '../../CIRS/cirsRecord/cirsRecordTestIds';
import { awaitFirstDisplayedPreviewAnalysisItem } from '../../CIRS/postureAnalysis/postureAnalysisListReadiness';
import { assertAnalysisReportPageLoaded } from '../../CIRS/postureAnalysis/postureAnalysisReportLocators';
import {
    ANALYSIS_ID_ATTR,
    POSTURE_ANALYSIS_TEST_IDS,
} from '../../CIRS/postureAnalysis/postureAnalysisTestIds';
import { runLimitDialogFlowAfterLogin } from '../../limitDialog/limitDialogFlow';
import {
    loginExistingUserForPart2,
    STG_APP_ORIGIN,
    type Part2LoginFlowOptions,
} from '../../login/existingUserLoginFlow';
import type { SmokePart2AccountCredentials } from '../../e2e/shared/smokePart2Config';
import { ComparisonReportViewFlowError } from './comparisonReportViewErrors';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

export const COMPARISON_REPORT_VIEW_SMOKE_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
export const COMPARISON_REPORT_VIEW_SMOKE_CUSTOMER_NAME = 'Nikolas Samuel';

export type ComparisonReportViewNavigationResult = {
    customerId: string;
    customerName: string;
    analysisId: string;
};

export async function navigateToCustomersListForComparison(
    page: Page,
    appOrigin: string = STG_APP_ORIGIN
): Promise<void> {
    await page.goto(`${appOrigin}/customers`, { timeout: NAVIGATION_TIMEOUT_MS });
    await assertCustomerListReadyForCirs(page);
    await expect(page).toHaveURL(/\/customers(?:\/|$|\?)/i, { timeout: NAVIGATION_TIMEOUT_MS });
}

export async function openCustomerFromListById(page: Page, customerId: string): Promise<void> {
    const row = page.locator(
        `[data-testid="${CIRS_TEST_IDS.customerRow}"][${CUSTOMER_ID_ATTR}="${customerId}"]`
    );
    await expect(row, `customer-row for ${customerId}`).toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await row.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(page).toHaveURL(new RegExp(`/customers/${customerId}(?:/|$|\\?)`, 'i'), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
}

export async function loginAndReachCustomersForComparisonView(
    page: Page,
    account: SmokePart2AccountCredentials,
    options?: Part2LoginFlowOptions
): Promise<void> {
    const loginReadiness = await loginExistingUserForPart2(page, account, options);
    await runLimitDialogFlowAfterLogin(page, account, loginReadiness, {
        enforcePrerequisites: false,
    });
    await expect(page).toHaveURL(/\/customers/, { timeout: NAVIGATION_TIMEOUT_MS });
}

export async function openPinnedFirstCustomerFromList(
    page: Page,
    expectedCustomerId: string,
    expectedCustomerName: string
): Promise<{ customerId: string; customerName: string }> {
    await assertCustomerListReadyForCirs(page);
    const row = page.getByTestId(CIRS_TEST_IDS.customerRow).first();
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const customerId = (await row.getAttribute(CUSTOMER_ID_ATTR))?.trim() ?? '';
    const customerName =
        (await row.getByTestId(CIRS_TEST_IDS.customerName).textContent())?.trim() ?? '';
    if (customerId !== expectedCustomerId) {
        throw new ComparisonReportViewFlowError(
            `First visible customer-row is not the pinned smoke customer (expected id ${expectedCustomerId}, got ${customerId ?? 'missing'}).`
        );
    }
    if (customerName !== expectedCustomerName) {
        throw new ComparisonReportViewFlowError(
            `First visible customer-row name mismatch (expected "${expectedCustomerName}", got "${customerName || 'empty'}").`
        );
    }
    await row.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(page).toHaveURL(new RegExp(`/customers/${expectedCustomerId}(?:/|$|\\?)`, 'i'), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    return { customerId, customerName };
}

export async function openFirstPostureAnalysisCardOnCustomer(
    page: Page,
    customerId: string,
    appOrigin: string = STG_APP_ORIGIN
): Promise<string> {
    const section = page.getByTestId(POSTURE_ANALYSIS_TEST_IDS.section);
    const firstItem = await awaitFirstDisplayedPreviewAnalysisItem(section, customerId, 'comparison-smoke');
    const analysisId = (await firstItem.getAttribute(ANALYSIS_ID_ATTR))?.trim();
    if (!analysisId) {
        throw new CirsRecordFlowError('First posture analysis card missing data-analysis-id.');
    }
    await firstItem.click({ timeout: ACTION_TIMEOUT_MS });
    await assertAnalysisReportPageLoaded(page, appOrigin, customerId, analysisId);
    return analysisId;
}