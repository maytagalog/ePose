import { test, expect } from '@playwright/test';
import { ComparisonReportViewStageTracker } from '../../../../analysisReport/comparisonReportView/comparisonReportViewStageTracker';
import { runComparisonReportViewFlow } from '../../../../analysisReport/comparisonReportView/comparisonReportViewFlow';
import { ComparisonReportViewFlowError } from '../../../../analysisReport/comparisonReportView/comparisonReportViewErrors';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../../analysisReport/analysisReportTestIds';
import {
    assertComparisonReportViewReady,
    clickComparisonOpenFromSingleReport,
    comparisonReportRoot,
    openComparisonReportSelectorDropdown,
    scrollComparisonViewAndAssertSectionsVisible,
    selectDifferentComparisonReportOption,
    readComparisonSlotAnalysisIds,
} from '../../../../analysisReport/comparisonReportView/comparisonReportViewLocators';
import {
    COMPARISON_REPORT_VIEW_FIXTURE_ANALYSIS_ID,
    COMPARISON_REPORT_VIEW_FIXTURE_CUSTOMER_ID,
    COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN,
    installComparisonReportViewFixtureShell,
} from './comparisonReportViewFixtureShell';

const CUSTOMER_ID = COMPARISON_REPORT_VIEW_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = COMPARISON_REPORT_VIEW_FIXTURE_ANALYSIS_ID;

test.describe.configure({ mode: 'serial', retries: 0 });

test('opens Comparison Report View (fixture)', async ({ page }) => {
    await installComparisonReportViewFixtureShell(page);
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    await clickComparisonOpenFromSingleReport(page);
    await assertComparisonReportViewReady(page, CUSTOMER_ID);
});

test('switches to a different report and checks visible sections (fixture)', async ({ page }) => {
    await installComparisonReportViewFixtureShell(page);
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    const tracker = new ComparisonReportViewStageTracker();
    const result = await runComparisonReportViewFlow(
        page,
        { customerId: CUSTOMER_ID, appOrigin: COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN },
        tracker
    );
    const comparisonRoot = comparisonReportRoot(page);
    expect(await comparisonRoot.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.sideStanding).count()).toBe(0);
    expect(result.evidence.sectionVisibilityFirstPass?.['left:standingSagittalPlane']).toBe(true);
    expect(result.evidence.sourceSingleReportAnalysisId).toBe(ANALYSIS_ID);
    expect(result.evidence.selectedComparisonAnalysisId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccc0003');
    expect(tracker.outcome('terminalComparisonView')).toBe('Passed');
});

test('opens comparison dropdown after initial scroll (fixture)', async ({ page }) => {
    await installComparisonReportViewFixtureShell(page);
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    await clickComparisonOpenFromSingleReport(page);
    await assertComparisonReportViewReady(page, CUSTOMER_ID);
    await scrollComparisonViewAndAssertSectionsVisible(page);
    const popup = await openComparisonReportSelectorDropdown(page);
    await expect(popup.getByTestId('analysis-report-comparison-option')).toHaveCount(2);
});

test('missing alternative report (fixture)', async ({ page }) => {
    await installComparisonReportViewFixtureShell(page, { singleOptionOnly: true });
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    await clickComparisonOpenFromSingleReport(page);
    await assertComparisonReportViewReady(page, CUSTOMER_ID);
    const ids = await readComparisonSlotAnalysisIds(page);
    await expect(async () => selectDifferentComparisonReportOption(page, ids)).rejects.toThrow(
        /no second enabled report/i
    );
});

test('missing section while scrolling (fixture)', async ({ page }) => {
    await installComparisonReportViewFixtureShell(page, { missingSection: true });
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    const tracker = new ComparisonReportViewStageTracker();
    await expect(
        runComparisonReportViewFlow(page, { customerId: CUSTOMER_ID, appOrigin: COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN }, tracker)
    ).rejects.toThrow(/standingSagittalPlane|立位矢状面/);
});

test('switch selection stuck loading fails at reportSelectionSwitch (fixture)', async ({ page }) => {
    test.setTimeout(90_000);
    await installComparisonReportViewFixtureShell(page, { delayedSwitchLoading: true });
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    const tracker = new ComparisonReportViewStageTracker();
    let flowError: unknown;
    try {
        await runComparisonReportViewFlow(
            page,
            { customerId: CUSTOMER_ID, appOrigin: COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN, sourceSingleReportAnalysisId: ANALYSIS_ID },
            tracker
        );
    } catch (error) {
        flowError = error;
    }
    expect(flowError).toBeTruthy();
    expect(tracker.outcome('reportSelectionSwitch')).toBe('Failed');
    expect(tracker.outcome('postSwitchScrollSections')).toBe('Not reached');
    expect(tracker.outcome('terminalComparisonView')).toBe('Not reached');
    const partial =
        flowError instanceof ComparisonReportViewFlowError ? flowError.partialEvidence : undefined;
    expect(partial?.selectedComparisonAnalysisId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccc0003');
    expect(partial?.sectionVisibilityFirstPass?.['left:standingSagittalPlane']).toBe(true);
});

test('delayed column id after switch fails reportSelectionSwitch (fixture)', async ({ page }) => {
    test.setTimeout(90_000);
    await installComparisonReportViewFixtureShell(page, { delayedSwitchColumnOnly: true });
    await page.goto(
        `${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    const tracker = new ComparisonReportViewStageTracker();
    let flowError: unknown;
    try {
        await runComparisonReportViewFlow(
            page,
            { customerId: CUSTOMER_ID, appOrigin: COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN, sourceSingleReportAnalysisId: ANALYSIS_ID },
            tracker
        );
    } catch (error) {
        flowError = error;
    }
    expect(flowError).toBeTruthy();
    expect(tracker.outcome('reportSelectionSwitch')).toBe('Failed');
    expect(tracker.outcome('postSwitchScrollSections')).toBe('Not reached');
});