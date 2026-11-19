import { test, expect } from '@playwright/test';
import {
    ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON,
    ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS,
} from '../../../../analysisReport/analysisReportTestIds';
import {
    installAnalysisReportPrintIntercept,
    readAnalysisReportPrintIntercept,
    restoreAnalysisReportPrintIntercept,
} from '../../../../analysisReport/reportPDF/analysisReportPrintIntercept';
import { runAnalysisReportPrintMenuActionFlow } from '../../../../analysisReport/reportPDF/analysisReportPrintMenuAction';
import { generateAnalysisReportA4Pdf } from '../../../../analysisReport/reportPDF/analysisReportPdfGeneration';
import { playwrightPdfGenerationSupported } from '../../../../analysisReport/reportPDF/analysisReportPdfBrowserCapability';
import {
    analyzeAnalysisReportPdfFile,
    validateAnalysisReportPdfFile,
} from '../../../../analysisReport/reportPDF/analysisReportPdfValidation';
import {
    installAnalysisReportPdfFixtureShell,
    ANALYSIS_REPORT_PDF_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_PDF_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_PDF_FIXTURE_ORIGIN,
} from './analysisReportPdfFixtureShell';

const ORIGIN = ANALYSIS_REPORT_PDF_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_PDF_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_PDF_FIXTURE_ANALYSIS_ID;

const FIXTURE_PDF_EXPECTATION = {
    customerDisplayName: 'Fixture Customer',
    measuredAtDisplayToken: '2026/01/15',
    measuredAtIso: '2026-01-15T08:00:00.000Z',
    scoreToken: '77',
    sectionMarkers: [...ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS],
};

test('report PDF fixture: print menu invokes intercepted print once', async ({ page }) => {
    await installAnalysisReportPdfFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const evidence = await runAnalysisReportPrintMenuActionFlow(
        page,
        ORIGIN,
        CUSTOMER_ID,
        ANALYSIS_ID
    );
    expect(evidence.printInvocationCount).toBe(1);
    expect(evidence.titleAtPrintInvocation).toBe('姿勢分析レポート');
    expect(evidence.titleRestored).toBe(true);
});

test('report PDF fixture: wrong print title fails menu action', async ({ page }) => {
    await installAnalysisReportPdfFixtureShell(page, { wrongPrintTitle: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportPrintMenuActionFlow(page, ORIGIN, CUSTOMER_ID, ANALYSIS_ID)
    ).rejects.toThrow(/title|PrintTitle|invocation/i);

    const nativePrint = await page.evaluate(() => typeof window.print === 'function');
    expect(nativePrint).toBe(true);
});

test('report PDF fixture: hidden duplicate print control is not the visible menu target', async ({
    page,
}) => {
    await installAnalysisReportPdfFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const menu = page.getByTestId('analysis-report-actions-menu');
    await page.getByTestId('analysis-report-actions-toggle').click();
    await expect(menu).toBeVisible();

    const visiblePrint = menu.getByTestId('analysis-report-print').locator('visible=true');
    await expect(visiblePrint).toHaveCount(1);
    await expect(visiblePrint).toHaveText('印刷');
});

test('report PDF fixture: missing print invocation when menu not used', async ({ page }) => {
    await installAnalysisReportPdfFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await installAnalysisReportPrintIntercept(page);
    try {
        const intercept = await readAnalysisReportPrintIntercept(page);
        expect(intercept.invocationCount).toBe(0);
    } finally {
        await restoreAnalysisReportPrintIntercept(page);
    }
});

test('report PDF fixture: restore original window.print after intercept', async ({ page }) => {
    await installAnalysisReportPdfFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await installAnalysisReportPrintIntercept(page);
    await restoreAnalysisReportPrintIntercept(page);
    const hasNative = await page.evaluate(() => typeof window.print === 'function');
    expect(hasNative).toBe(true);
});

test('report PDF validation: empty file fails', async ({}, testInfo) => {
    const emptyPath = testInfo.outputPath('empty.pdf');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(emptyPath, '');
    await expect(validateAnalysisReportPdfFile(emptyPath, FIXTURE_PDF_EXPECTATION)).rejects.toThrow(
        /empty/i
    );
});

test('report PDF validation: corrupt bytes fail parser', async ({}, testInfo) => {
    const corruptPath = testInfo.outputPath('corrupt.pdf');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(corruptPath, '%PDF-not-valid');
    await expect(validateAnalysisReportPdfFile(corruptPath, FIXTURE_PDF_EXPECTATION)).rejects.toThrow(
        /parser|PDF/i
    );
});

test('report PDF: chromium generates and validates A4 PDF bytes', async ({ page, browser }, testInfo) => {
    test.skip(!playwrightPdfGenerationSupported(browser), ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON);
    await installAnalysisReportPdfFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const pdfPath = testInfo.outputPath('fixture-report-a4.pdf');
    await generateAnalysisReportA4Pdf(page, {
        outputPath: pdfPath,
        readiness: { requirePosturePhotos: false },
    });
    const validation = await validateAnalysisReportPdfFile(pdfPath, FIXTURE_PDF_EXPECTATION);
    expect(validation.contentVerificationPassed).toBe(true);
});

test('report PDF validation: wrong report content fails on valid PDF', async ({ page, browser }, testInfo) => {
    test.skip(!playwrightPdfGenerationSupported(browser), ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON);
    await installAnalysisReportPdfFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const pdfPath = testInfo.outputPath('fixture-wrong-content.pdf');
    await generateAnalysisReportA4Pdf(page, {
        outputPath: pdfPath,
        readiness: { requirePosturePhotos: false },
    });

    const analysis = await analyzeAnalysisReportPdfFile(pdfPath, {
        ...FIXTURE_PDF_EXPECTATION,
        customerDisplayName: 'Wrong Customer Name',
        measuredAtDisplayToken: '2099/12/31',
    });
    expect(analysis.contentVerificationPassed).toBe(false);
    await expect(
        validateAnalysisReportPdfFile(pdfPath, {
            ...FIXTURE_PDF_EXPECTATION,
            customerDisplayName: 'Wrong Customer Name',
        })
    ).rejects.toThrow(/content verification failed/i);
});

test('report PDF capability: browserName drives PDF generation support', async ({ browser }) => {
    const name = browser.browserType().name();
    expect(playwrightPdfGenerationSupported(browser)).toBe(name === 'chromium');
});
