import { test, expect } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../../analysisReport/analysisReportTestIds';
import { exitComparisonReportViewToSingleReport } from '../../../../analysisReport/comparisonReportView/comparisonReportViewExitFlow';
import { ComparisonReportViewExitStageTracker } from '../../../../analysisReport/comparisonReportView/comparisonReportViewExitStageTracker';
import { clickComparisonOpenFromSingleReport } from '../../../../analysisReport/comparisonReportView/comparisonReportViewLocators';
import {
    COMPARISON_REPORT_VIEW_FIXTURE_CUSTOMER_ID,
    COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN,
    installComparisonReportViewFixtureShell,
} from './comparisonReportViewFixtureShell';

const CUSTOMER_ID = COMPARISON_REPORT_VIEW_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';

test('comparison exit: compare-exit returns to ready single analysis-report', async ({ page }) => {
    await installComparisonReportViewFixtureShell(page);
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    await clickComparisonOpenFromSingleReport(page);
    const tracker = new ComparisonReportViewExitStageTracker();
    const result = await exitComparisonReportViewToSingleReport(
        page,
        COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN,
        CUSTOMER_ID,
        tracker
    );
    expect(result.returnedAnalysisId).toBe(ANALYSIS_ID);
    await expect(page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.report)).toBeVisible();
    expect(tracker.outcome('singleReportReady')).toBe('Passed');
});

test('comparison exit: failure marks open exit stage failed', async ({ page }) => {
    await installComparisonReportViewFixtureShell(page);
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    await clickComparisonOpenFromSingleReport(page);
    await page.evaluate(() => {
        document
            .querySelector('[data-testid="analysis-report-compare-exit"]')
            ?.remove();
    });
    const tracker = new ComparisonReportViewExitStageTracker();
    await expect(
        exitComparisonReportViewToSingleReport(
            page,
            COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN,
            CUSTOMER_ID,
            tracker
        )
    ).rejects.toThrow();
    expect(tracker.outcome('compareExitClick')).toBe('Failed');
});