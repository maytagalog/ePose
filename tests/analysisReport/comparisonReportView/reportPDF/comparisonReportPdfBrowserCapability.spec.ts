import { test, expect } from '@playwright/test';
import { ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON } from '../../analysisReportTestIds';
import { pdfGenerationSkipReason, playwrightPdfGenerationSupported } from '../../reportPDF/analysisReportPdfBrowserCapability';
import { runComparisonReportPdfStandalone } from './comparisonReportPdfRunOrchestrator';
import { attachComparisonReportPdfEvidence } from './comparisonReportPdfReporting';

test('non-Chromium browsers skip comparison PDF before setup', async ({ browser }, testInfo) => {
    if (playwrightPdfGenerationSupported(browser)) {
        test.skip();
    }
    const skipReason = pdfGenerationSkipReason(browser);
    expect(skipReason).toBe(ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON);

    const page = await browser.newPage();
    try {
        const { evidence } = await runComparisonReportPdfStandalone({
            page,
            browser,
            testInfo,
            account: { email: '', password: '' },
            appOrigin: 'https://fixture.example',
            skipPdfGenerationReason: skipReason,
        });

        expect(evidence.pdfGenerationSkipReason).toBe(skipReason);
        expect(evidence.stages.login).toBe('Not reached');
        expect(evidence.stages.a4PdfSave).toBe('Skipped');
        await attachComparisonReportPdfEvidence(testInfo, evidence, null);
    } finally {
        await page.close();
    }
});