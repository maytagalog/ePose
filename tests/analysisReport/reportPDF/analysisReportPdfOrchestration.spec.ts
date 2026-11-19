import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS } from '../analysisReportTestIds';
import { executeAnalysisReportPrintMenuAction } from './analysisReportPrintMenuAction';
import { AnalysisReportPdfStageTracker } from './analysisReportPdfStageTracker';
import { analyzeAnalysisReportPdfFile, validateAnalysisReportPdfFile } from './analysisReportPdfValidation';
import { buildMixedPageSizePdfBytes } from '../../e2e/fixtures/analysisReport/reportPDF/analysisReportPdfFixturePdfs';
import {
    installAnalysisReportPdfFixtureShell,
    ANALYSIS_REPORT_PDF_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_PDF_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_PDF_FIXTURE_ORIGIN,
} from '../../e2e/fixtures/analysisReport/reportPDF/analysisReportPdfFixtureShell';

const ORIGIN = ANALYSIS_REPORT_PDF_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_PDF_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_PDF_FIXTURE_ANALYSIS_ID;

test('orchestration: wrong print title marks menu stage Failed with partial evidence', async ({ page }) => {
    await installAnalysisReportPdfFixtureShell(page, { wrongPrintTitle: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const tracker = new AnalysisReportPdfStageTracker();
    tracker.enter('applicationPrintMenuAction');
    const result = await executeAnalysisReportPrintMenuAction(page, ORIGIN, CUSTOMER_ID, ANALYSIS_ID);
    if (result.error) {
        tracker.fail('applicationPrintMenuAction');
    } else {
        tracker.pass('applicationPrintMenuAction');
    }

    expect(result.error).toBeTruthy();
    expect(result.evidence.printInvocationCount).toBe(1);
    expect(tracker.outcome('applicationPrintMenuAction')).toBe('Failed');
    expect(tracker.outcome('a4PdfGeneration')).toBe('Not reached');
    expect(result.evidence.failureStep).toBeTruthy();
});

test('orchestration: mixed-page PDF fails A4 via production validator with dimensions retained', async (
    {},
    testInfo
) => {
    const pdfPath = testInfo.outputPath('mixed-page-sizes.pdf');
    const bytes = await buildMixedPageSizePdfBytes();
    await writeFile(pdfPath, bytes);

    const expectation = {
        customerDisplayName: 'Fixture Customer',
        measuredAtDisplayToken: '2026/01/15',
        measuredAtIso: '2026-01-15T08:00:00.000Z',
        scoreToken: '77',
        sectionMarkers: [...ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS],
    };

    const analysis = await analyzeAnalysisReportPdfFile(pdfPath, expectation);
    expect(analysis.pageDimensions).toHaveLength(2);
    expect(analysis.a4ValidationPassed).toBe(false);
    expect(analysis.nonA4PageNumbers).toContain(2);
    expect(analysis.pageDimensions[1].effectiveWidthPt).toBeCloseTo(500, 0);

    await expect(validateAnalysisReportPdfFile(pdfPath, expectation)).rejects.toThrow(/not A4/i);
});
