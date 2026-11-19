import { test, expect } from '@playwright/test';
import { ComparisonReportViewStageTracker } from '../../../../../../analysisReport/comparisonReportView/comparisonReportViewStageTracker';
import { runComparisonReportViewFlow } from '../../../../../../analysisReport/comparisonReportView/comparisonReportViewFlow';
import { ComparisonReportShareQrFlowError } from '../../../../../../analysisReport/comparisonReportView/sharing/qrCode/comparisonReportShareQrErrors';
import { runComparisonReportShareQrOpenCloseFromComparisonPage } from '../../../../../../analysisReport/comparisonReportView/sharing/qrCode/comparisonReportShareQrFlow';
import { ComparisonReportShareQrStageTracker } from '../../../../../../analysisReport/comparisonReportView/sharing/qrCode/comparisonReportShareQrStageTracker';
import {
    COMPARISON_REPORT_SHARE_QR_FIXTURE_ANALYSIS_ID,
    COMPARISON_REPORT_SHARE_QR_FIXTURE_CUSTOMER_ID,
    COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN,
    installComparisonReportShareQrFixtureShell,
} from './comparisonReportShareQrFixtureShell';

const CUSTOMER_ID = COMPARISON_REPORT_SHARE_QR_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = COMPARISON_REPORT_SHARE_QR_FIXTURE_ANALYSIS_ID;

test.describe.configure({ mode: 'serial', retries: 0 });

async function reachComparisonAfterSwitch(page: import('@playwright/test').Page): Promise<void> {
    await installComparisonReportShareQrFixtureShell(page);
    await page.goto(`${COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const comparisonTracker = new ComparisonReportViewStageTracker();
    await runComparisonReportViewFlow(
        page,
        {
            customerId: CUSTOMER_ID,
            appOrigin: COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN,
            sourceSingleReportAnalysisId: ANALYSIS_ID,
        },
        comparisonTracker
    );
    expect(comparisonTracker.outcome('terminalComparisonView')).toBe('Passed');
}

test('comparison share QR open/close (fixture)', async ({ page }) => {
    await reachComparisonAfterSwitch(page);
    const qrTracker = new ComparisonReportShareQrStageTracker();
    const partial = await runComparisonReportShareQrOpenCloseFromComparisonPage(
        page,
        { customerId: CUSTOMER_ID },
        qrTracker
    );
    expect(partial.qrContentVisible).toBe(true);
    expect(partial.comparisonPairPreserved).toBe(true);
    expect(qrTracker.outcome('comparisonPairPreserved')).toBe('Passed');
});

test('comparison share QR missing content fails (fixture)', async ({ page }) => {
    await installComparisonReportShareQrFixtureShell(page, { missingQrContent: true });
    await page.goto(`${COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const comparisonTracker = new ComparisonReportViewStageTracker();
    await runComparisonReportViewFlow(
        page,
        { customerId: CUSTOMER_ID, appOrigin: COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN, sourceSingleReportAnalysisId: ANALYSIS_ID },
        comparisonTracker
    );
    const qrTracker = new ComparisonReportShareQrStageTracker();
    await expect(
        runComparisonReportShareQrOpenCloseFromComparisonPage(page, { customerId: CUSTOMER_ID }, qrTracker)
    ).rejects.toThrow();
    expect(qrTracker.outcome('shareQrContentVisible')).toBe('Failed');
    expect(qrTracker.outcome('shareQrDialogClosed')).toBe('Not reached');
});

test('comparison share QR close fails (fixture)', async ({ page }) => {
    await installComparisonReportShareQrFixtureShell(page, { closeFails: true });
    await page.goto(`${COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const comparisonTracker = new ComparisonReportViewStageTracker();
    await runComparisonReportViewFlow(
        page,
        { customerId: CUSTOMER_ID, appOrigin: COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN, sourceSingleReportAnalysisId: ANALYSIS_ID },
        comparisonTracker
    );
    const qrTracker = new ComparisonReportShareQrStageTracker();
    await expect(
        runComparisonReportShareQrOpenCloseFromComparisonPage(page, { customerId: CUSTOMER_ID }, qrTracker)
    ).rejects.toThrow();
    expect(qrTracker.outcome('shareQrDialogClosed')).toBe('Failed');
    expect(qrTracker.outcome('comparisonPairPreserved')).toBe('Not reached');
});

test('comparison pair changes after QR fails (fixture)', async ({ page }) => {
    await installComparisonReportShareQrFixtureShell(page, { pairChangesOnClose: true });
    await page.goto(`${COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const comparisonTracker = new ComparisonReportViewStageTracker();
    await runComparisonReportViewFlow(
        page,
        { customerId: CUSTOMER_ID, appOrigin: COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN, sourceSingleReportAnalysisId: ANALYSIS_ID },
        comparisonTracker
    );
    const qrTracker = new ComparisonReportShareQrStageTracker();
    let flowError: unknown;
    try {
        await runComparisonReportShareQrOpenCloseFromComparisonPage(page, { customerId: CUSTOMER_ID }, qrTracker);
    } catch (error) {
        flowError = error;
    }
    expect(flowError).toBeTruthy();
    expect(qrTracker.outcome('comparisonPairPreserved')).toBe('Failed');
    const partial =
        flowError instanceof ComparisonReportShareQrFlowError ? flowError.partialEvidence : undefined;
    expect(partial?.preQrLeftAnalysisId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccc0003');
    expect(partial?.postQrLeftAnalysisId).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
});