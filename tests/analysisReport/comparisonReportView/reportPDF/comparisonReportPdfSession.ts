import { expect, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_COMPARISON_ROUTE_SEGMENT } from '../../analysisReportTestIds';
import {
    assertComparisonReportViewReady,
    readComparisonSlotAnalysisIds,
    type ComparisonSlotAnalysisIds,
} from '../comparisonReportViewLocators';

const NAVIGATION_TIMEOUT_MS = 30000;

export async function navigateToAuthenticatedComparisonPair(
    page: Page,
    appOrigin: string,
    customerId: string,
    expectedPair: ComparisonSlotAnalysisIds
): Promise<void> {
    const url = `${appOrigin}/customers/${customerId}/reports/${expectedPair.leftAnalysisId}/${ANALYSIS_REPORT_COMPARISON_ROUTE_SEGMENT}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    await assertComparisonReportViewReady(page, customerId);
    const actual = await readComparisonSlotAnalysisIds(page);
    if (
        actual.leftAnalysisId !== expectedPair.leftAnalysisId ||
        actual.rightAnalysisId !== expectedPair.rightAnalysisId
    ) {
        throw new Error(
            `Comparison route did not load expected pair (expected ${expectedPair.leftAnalysisId}/${expectedPair.rightAnalysisId}, got ${actual.leftAnalysisId}/${actual.rightAnalysisId}).`
        );
    }
    await expect(page).toHaveURL(
        new RegExp(
            `/customers/${customerId.replace(/-/g, '\\-')}/reports/${expectedPair.leftAnalysisId.replace(/-/g, '\\-')}/${ANALYSIS_REPORT_COMPARISON_ROUTE_SEGMENT}`,
            'i'
        ),
        { timeout: NAVIGATION_TIMEOUT_MS }
    );
}