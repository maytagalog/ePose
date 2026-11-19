import { test, expect } from '@playwright/test';
import { executeAnalysisReportHistoryCustomerStages } from './analysisReportHistoryCustomerStages';
import { openAnalysisReportHistoryFromActionsMenu } from './analysisReportHistoryMenuAction';
import { AnalysisReportHistoryStageTracker } from './analysisReportHistoryStageTracker';
import {
    ANALYSIS_REPORT_HISTORY_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_HISTORY_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_HISTORY_FIXTURE_ORIGIN,
    installAnalysisReportHistoryFixtureShell,
} from '../../e2e/fixtures/analysisReport/reportHistory/analysisReportHistoryFixtureShell';

const ORIGIN = ANALYSIS_REPORT_HISTORY_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_HISTORY_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_HISTORY_FIXTURE_ANALYSIS_ID;
const WRONG_HISTORY_CUSTOMER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function openFixtureReport(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportHistoryFromActionsMenu(page, CUSTOMER_ID);
}

test('orchestration: wrong history route fails route; readiness Not reached', async ({ page }) => {
    const tracker = new AnalysisReportHistoryStageTracker();
    await installAnalysisReportHistoryFixtureShell(page, { wrongHistoryCustomer: true });
    await page.goto(`${ORIGIN}/customers/${WRONG_HISTORY_CUSTOMER_ID}/posture-analysis-report`);

    const result = await executeAnalysisReportHistoryCustomerStages(page, tracker, CUSTOMER_ID, ORIGIN);

    expect(result.error).toBeTruthy();
    expect(tracker.outcome('historyRouteCustomerVerification')).toBe('Failed');
    expect(tracker.outcome('historyReadiness')).toBe('Not reached');
    expect(tracker.outcome('sourceRowVerification')).toBe('Not reached');
});

test('orchestration: empty history passes route; readiness fails; later Not reached', async ({ page }) => {
    const tracker = new AnalysisReportHistoryStageTracker();
    await installAnalysisReportHistoryFixtureShell(page, { historyEmpty: true });
    await openFixtureReport(page);

    const result = await executeAnalysisReportHistoryCustomerStages(page, tracker, CUSTOMER_ID, ORIGIN);

    expect(result.error).toBeTruthy();
    expect(tracker.outcome('historyRouteCustomerVerification')).toBe('Passed');
    expect(tracker.outcome('historyReadiness')).toBe('Failed');
    expect(tracker.outcome('sourceRowVerification')).toBe('Not reached');
});
