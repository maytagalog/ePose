import { expect, type Locator, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_COMPARISON_HEADER_LABELS,
    ANALYSIS_REPORT_COMPARISON_TEST_IDS,
} from '../../analysisReportTestIds';
import { comparisonReportRoot } from '../comparisonReportViewLocators';

const ACTION_TIMEOUT_MS = 15000;

/**
 * Staff comparison header chrome: title + customer info row sit in the same ancestor as analysis-report-comparison
 * (trace 2026-11-14; bundle StandingPostureAnalysisComparison + PostureAnalysisHeader variant without analysis-report-header).
 */
export function comparisonReportHeaderRegion(page: Page): Locator {
    const rootTestId = ANALYSIS_REPORT_COMPARISON_TEST_IDS.root;
    const compareExit = page.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.compareExit);
    return compareExit.locator(`xpath=ancestor::*[.//*[@data-testid="${rootTestId}"]][1]`);
}

export function comparisonReportCustomerNameValueInHeader(page: Page): Locator {
    const header = comparisonReportHeaderRegion(page);
    const nameLabel = header.getByText(ANALYSIS_REPORT_COMPARISON_HEADER_LABELS.customerName, {
        exact: true,
    });
    return nameLabel.locator('xpath=following-sibling::*[1]');
}

export async function readComparisonReportCustomerDisplayName(page: Page): Promise<string> {
    const header = comparisonReportHeaderRegion(page);
    await expect(header, 'comparison page chrome containing compare exit + root').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(
        page.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.compareExit),
        'analysis-report-compare-exit visible on comparison view'
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(comparisonReportRoot(page)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const nameValue = comparisonReportCustomerNameValueInHeader(page);
    await expect(nameValue, 'comparison header 氏名 value cell').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const customerDisplayName = (await nameValue.innerText()).trim();
    if (!customerDisplayName) {
        throw new Error(
            'Comparison report header customer name is empty; cannot validate PDF content (scope: 氏名 row in comparison header chrome).'
        );
    }
    return customerDisplayName;
}