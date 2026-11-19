import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import { ANALYSIS_REPORT_COMPARISON_REPORT_TITLE } from '../../../../../analysisReport/analysisReportTestIds';
import { ComparisonReportViewStageTracker } from '../../../../../analysisReport/comparisonReportView/comparisonReportViewStageTracker';
import { runComparisonReportViewFlow } from '../../../../../analysisReport/comparisonReportView/comparisonReportViewFlow';
import {
    assertExpectedComparisonPair,
    collectComparisonReportPdfContentExpectations,
} from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfContentExpectations';
import { executeComparisonReportPrintMenuAction } from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfPrintMenuAction';
import {
    analyzeComparisonReportPdfFile,
    validateComparisonReportPdfFile,
} from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfValidation';
import { ComparisonReportPdfStageTracker } from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfStageTracker';
import {
    runComparisonReportPdfFlowOnPage,
    runComparisonReportPdfFromComparisonPage,
} from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfFlow';
import type { ComparisonReportPdfRunEvidence } from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfReporting';
import { navigateToAuthenticatedComparisonPair } from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfSession';
import { readComparisonSlotAnalysisIds } from '../../../../../analysisReport/comparisonReportView/comparisonReportViewLocators';
import { comparisonReportCustomerNameValueInHeader } from '../../../../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfLocators';
import { playwrightPdfGenerationSupported } from '../../../../../analysisReport/reportPDF/analysisReportPdfBrowserCapability';
import {
    installAnalysisReportPrintIntercept,
    readAnalysisReportPrintIntercept,
    restoreAnalysisReportPrintIntercept,
} from '../../../../../analysisReport/reportPDF/analysisReportPrintIntercept';
import { restoreAnalysisReportScreenMedia } from '../../../../../analysisReport/reportPDF/analysisReportPdfReadiness';
import { buildMixedPageSizePdfBytes } from '../../reportPDF/analysisReportPdfFixturePdfs';
import { writeFile } from 'node:fs/promises';
import {
    installComparisonReportPdfFixtureShell,
    COMPARISON_REPORT_PDF_FIXTURE_ANALYSIS_ID,
    COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_ID,
    COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME,
    COMPARISON_REPORT_PDF_FIXTURE_LEFT_ID,
    COMPARISON_REPORT_PDF_FIXTURE_ORIGIN,
    COMPARISON_REPORT_PDF_FIXTURE_RIGHT_ID,
} from './comparisonReportPdfFixtureShell';

const CUSTOMER_ID = COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = COMPARISON_REPORT_PDF_FIXTURE_ANALYSIS_ID;

test.describe.configure({ mode: 'serial', retries: 0 });

function emptyEvidence(): ComparisonReportPdfRunEvidence {
    return {
        runId: 'fixture',
        runOutputRoot: 'fixture',
        browserProject: 'chromium',
        browserName: 'chromium',
        browserVersion: null,
        customerId: CUSTOMER_ID,
        leftAnalysisId: null,
        rightAnalysisId: null,
        menuAction: null,
        pdfGeneration: null,
        pdfValidation: null,
        pdfGenerationSkipReason: null,
        coverageLabel: 'A4 comparison PDF save and validation',
        stages: new ComparisonReportPdfStageTracker().toRecord(),
        failureStep: null,
    };
}

async function reachComparison(page: import('@playwright/test').Page): Promise<void> {
    await installComparisonReportPdfFixtureShell(page);
    await page.goto(`${COMPARISON_REPORT_PDF_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const comparisonTracker = new ComparisonReportViewStageTracker();
    await runComparisonReportViewFlow(
        page,
        {
            customerId: CUSTOMER_ID,
            appOrigin: COMPARISON_REPORT_PDF_FIXTURE_ORIGIN,
            sourceSingleReportAnalysisId: ANALYSIS_ID,
        },
        comparisonTracker
    );
    expect(comparisonTracker.outcome('terminalComparisonView')).toBe('Passed');
}

test('comparison PDF: print menu invokes intercepted print once', async ({ page }) => {
    await reachComparison(page);
    const pair = await readComparisonSlotAnalysisIds(page);
    const { evidence, error } = await executeComparisonReportPrintMenuAction(page, CUSTOMER_ID, pair);
    expect(error).toBeNull();
    expect(evidence.printInvocationCount).toBe(1);
    expect(evidence.pairUnchanged).toBe(true);
});

test('comparison PDF: chromium generates and validates A4', async ({ page, browser }, testInfo) => {
    test.skip(!playwrightPdfGenerationSupported(browser), 'Chromium PDF only');
    await reachComparison(page);
    const tracker = new ComparisonReportPdfStageTracker();
    const evidence = emptyEvidence();
    const pdfPath = testInfo.outputPath('comparison-a4.pdf');
    await runComparisonReportPdfFlowOnPage(
        page,
        {
            customerId: CUSTOMER_ID,
            customerDisplayNameHint: COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME,
            pdfPath,
        },
        tracker,
        evidence
    );
    expect(evidence.pdfValidation?.contentVerificationPassed).toBe(true);
    expect(tracker.outcome('comparisonPairPreserved')).toBe('Passed');
});

test('comparison PDF: wrong pair rejected before generation', async ({ page, browser }, testInfo) => {
    test.skip(!playwrightPdfGenerationSupported(browser), 'Chromium PDF only');
    await reachComparison(page);
    const pair = await readComparisonSlotAnalysisIds(page);
    await expect(async () =>
        assertExpectedComparisonPair(pair, {
            leftAnalysisId: 'deadbeef-dead-beef-dead-beefdeadbeef',
            rightAnalysisId: COMPARISON_REPORT_PDF_FIXTURE_RIGHT_ID,
        })
    ).rejects.toThrow(/pair mismatch/i);

    const tracker = new ComparisonReportPdfStageTracker();
    await expect(
        runComparisonReportPdfFromComparisonPage(
            page,
            {
                customerId: CUSTOMER_ID,
                customerDisplayNameHint: COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME,
                pdfPath: testInfo.outputPath('unused.pdf'),
                expectedPair: {
                    leftAnalysisId: 'deadbeef-dead-beef-dead-beefdeadbeef',
                    rightAnalysisId: COMPARISON_REPORT_PDF_FIXTURE_RIGHT_ID,
                },
            },
            tracker,
            emptyEvidence()
        )
    ).rejects.toThrow();
    expect(tracker.outcome('a4PdfSave')).toBe('Not reached');
});

test('comparison PDF: non-A4 fixture bytes rejected', async ({}, testInfo) => {
    const bytes = await buildMixedPageSizePdfBytes();
    const pdfPath = testInfo.outputPath('mixed.pdf');
    await writeFile(pdfPath, bytes);
    const expectation = await (async () => ({
        comparisonTitle: ANALYSIS_REPORT_COMPARISON_REPORT_TITLE,
        customerDisplayName: COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME,
        pairSourceVerification: {
            leftAnalysisId: COMPARISON_REPORT_PDF_FIXTURE_LEFT_ID,
            rightAnalysisId: COMPARISON_REPORT_PDF_FIXTURE_RIGHT_ID,
        },
        leftMeasuredAtDisplayToken: '2026/02/01',
        rightMeasuredAtDisplayToken: '2026/01/15',
    }))();
    await expect(validateComparisonReportPdfFile(pdfPath, expectation)).rejects.toThrow(/A4/i);
    const analysis = await analyzeComparisonReportPdfFile(pdfPath, expectation);
    expect(analysis.a4ValidationPassed).toBe(false);
});

test('comparison PDF: restores screen media after print emulation', async ({ page, browser }) => {
    test.skip(!playwrightPdfGenerationSupported(browser), 'Chromium PDF only');
    await reachComparison(page);
    await page.emulateMedia({ media: 'print' });
    await restoreAnalysisReportScreenMedia(page);
    const media = await page.evaluate(() => (window.matchMedia('print').matches ? 'print' : 'screen'));
    expect(media).toBe('screen');
});

test('comparison PDF: intercept cleanup after failure', async ({ page }) => {
    await reachComparison(page);
    await installAnalysisReportPrintIntercept(page);
    const before = await readAnalysisReportPrintIntercept(page);
    expect(before.invocationCount).toBe(0);
    const cleanup = await restoreAnalysisReportPrintIntercept(page);
    expect(cleanup.error).toBeNull();
});

test('comparison PDF: auxiliary navigation loads exact pair and closes context', async ({ page, browser }) => {
    test.skip(!playwrightPdfGenerationSupported(browser), 'Chromium PDF only');
    await reachComparison(page);
    const pair = await readComparisonSlotAnalysisIds(page);
    const storageState = await page.context().storageState();
    const auxBrowser = await chromium.launch({ headless: true });
    try {
        const ctx = await auxBrowser.newContext({ storageState, viewport: { width: 1404, height: 856 } });
        const auxPage = await ctx.newPage();
        await installComparisonReportPdfFixtureShell(auxPage);
        await navigateToAuthenticatedComparisonPair(
            auxPage,
            COMPARISON_REPORT_PDF_FIXTURE_ORIGIN,
            CUSTOMER_ID,
            pair
        );
        await ctx.close();
    } finally {
        await auxBrowser.close();
    }
    const primaryPair = await readComparisonSlotAnalysisIds(page);
    expect(primaryPair).toEqual(pair);
});

test('comparison PDF capability: non-chromium unsupported', async ({ browser }) => {
    const name = browser.browserType().name();
    expect(playwrightPdfGenerationSupported(browser)).toBe(name === 'chromium');
});

test('comparison PDF content: duplicate banner name does not satisfy 氏名 row read', async ({ page }) => {
    await reachComparison(page);
    const expectations = await collectComparisonReportPdfContentExpectations(
        page,
        CUSTOMER_ID,
        COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME
    );
    expect(expectations.customerDisplayName).toBe(COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME);
    const banner = page.locator('#fixture-app-banner-name');
    const nameCell = comparisonReportCustomerNameValueInHeader(page);
    await expect(banner).toHaveText(COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME);
    await expect(nameCell).toHaveText(COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME);
    const bannerMatches = await page
        .getByText(COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME, { exact: true })
        .locator('visible=true')
        .count();
    expect(bannerMatches).toBeGreaterThanOrEqual(2);
});

test('comparison PDF content: wrong 氏名 value fails hint check', async ({ page }) => {
    await installComparisonReportPdfFixtureShell(page);
    await page.goto(`${COMPARISON_REPORT_PDF_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await page.evaluate(() => {
        const nameCell = document.getElementById('comparison-header-customer-name');
        if (nameCell) {
            nameCell.textContent = 'Wrong Customer In Header Row';
        }
        const single = document.getElementById('single-view');
        const comparison = document.getElementById('comparison-view');
        if (single && comparison) {
            single.hidden = true;
            comparison.hidden = false;
        }
    });
    await expect(
        collectComparisonReportPdfContentExpectations(
            page,
            CUSTOMER_ID,
            COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME
        )
    ).rejects.toThrow(/does not match hint/i);
});