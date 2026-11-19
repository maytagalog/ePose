import { test, expect } from '@playwright/test';
import { assertCustomerHistorySourceRowVisible } from '../../../../analysisReport/reportHistory/analysisReportCustomerHistoryLocators';
import { assertCustomerReportHistoryReadyForRoundTrip } from '../../../../analysisReport/reportHistory/analysisReportHistoryCustomerReadiness';
import {
    openAnalysisReportHistoryFromActionsMenu,
} from '../../../../analysisReport/reportHistory/analysisReportHistoryMenuAction';
import { assertCustomerReportHistoryListTerminal } from '../../../../analysisReport/reportHistory/analysisReportHistoryListTerminal';
import { AnalysisReportHistoryStageTracker, markOpenStagesFailed } from '../../../../analysisReport/reportHistory/analysisReportHistoryStageTracker';
import { captureAnalysisReportHistorySourceIdentity } from '../../../../analysisReport/reportHistory/analysisReportHistorySourceIdentity';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
} from '../../../../analysisReport/reportView/analysisReportSingleReportLocators';
import {
    ANALYSIS_REPORT_HISTORY_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_HISTORY_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_HISTORY_FIXTURE_ORIGIN,
    installAnalysisReportHistoryFixtureShell,
} from './analysisReportHistoryFixtureShell';

const ORIGIN = ANALYSIS_REPORT_HISTORY_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_HISTORY_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_HISTORY_FIXTURE_ANALYSIS_ID;

async function runFixtureHistoryEndsOnList(page: import('@playwright/test').Page): Promise<void> {
    await assertAnalysisReportRouteIdentity(page, ORIGIN, CUSTOMER_ID, ANALYSIS_ID);
    await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    await captureAnalysisReportHistorySourceIdentity(page);
    await openAnalysisReportHistoryFromActionsMenu(page, CUSTOMER_ID);
    await assertCustomerReportHistoryReadyForRoundTrip(page, CUSTOMER_ID, ORIGIN);
    await assertCustomerHistorySourceRowVisible(page, CUSTOMER_ID, ANALYSIS_ID);
    await assertCustomerReportHistoryListTerminal(page, CUSTOMER_ID, ORIGIN, ANALYSIS_ID);
}

test('ellipsis History ends on verified customer history list', async ({ page }) => {
    await installAnalysisReportHistoryFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await runFixtureHistoryEndsOnList(page);
});

test('hidden duplicate history control is not the visible menu target', async ({ page }) => {
    await installAnalysisReportHistoryFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await page.getByTestId('analysis-report-actions-toggle').click();
    const menu = page.getByTestId('analysis-report-actions-menu');
    const visible = menu.getByTestId('analysis-report-history-open').locator('visible=true');
    await expect(visible).toHaveCount(1);
});

test('empty history fails round trip', async ({ page }) => {
    await installAnalysisReportHistoryFixtureShell(page, { historyEmpty: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportHistoryFromActionsMenu(page, CUSTOMER_ID);
    await expect(assertCustomerReportHistoryReadyForRoundTrip(page, CUSTOMER_ID, ORIGIN)).rejects.toThrow(
        /empty/i
    );
});

test('missing source row fails', async ({ page }) => {
    await installAnalysisReportHistoryFixtureShell(page, { omitSourceRow: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportHistoryFromActionsMenu(page, CUSTOMER_ID);
    await assertCustomerReportHistoryReadyForRoundTrip(page, CUSTOMER_ID, ORIGIN);
    await expect(assertCustomerHistorySourceRowVisible(page, CUSTOMER_ID, ANALYSIS_ID)).rejects.toThrow(
        /exactly one visible/i
    );
});

test('wrong analysis row id cannot satisfy source row selection', async ({ page }) => {
    await installAnalysisReportHistoryFixtureShell(page, { wrongAnalysisOnRow: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportHistoryFromActionsMenu(page, CUSTOMER_ID);
    await assertCustomerReportHistoryReadyForRoundTrip(page, CUSTOMER_ID, ORIGIN);
    await expect(assertCustomerHistorySourceRowVisible(page, CUSTOMER_ID, ANALYSIS_ID)).rejects.toThrow(
        /exactly one visible/i
    );
});

test('orchestration marks Failed stage on history menu with empty list', async ({ page }) => {
    const tracker = new AnalysisReportHistoryStageTracker();
    await installAnalysisReportHistoryFixtureShell(page, { historyEmpty: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    tracker.enter('ellipsisHistoryAction');
    tracker.pass('ellipsisHistoryAction');
    tracker.enter('historyReadiness');
    try {
        await assertCustomerReportHistoryReadyForRoundTrip(page, CUSTOMER_ID, ORIGIN);
        tracker.pass('historyReadiness');
    } catch {
        markOpenStagesFailed(tracker);
        tracker.fail('historyReadiness');
    }
    expect(tracker.outcome('historyReadiness')).toBe('Failed');
    expect(tracker.outcome('customerHistoryListTerminal')).toBe('Not reached');
});
