import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../../login/existingUserLoginFlow';
import { pdfGenerationSkipReason, playwrightPdfGenerationSupported } from '../../reportPDF/analysisReportPdfBrowserCapability';
import {
    finalizeComparisonReportPdfRun,
    runComparisonReportPdfStandalone,
} from './comparisonReportPdfRunOrchestrator';
import { attachComparisonReportPdfEvidence } from './comparisonReportPdfReporting';

/**
 * Standalone Comparison Report A4 PDF (login → comparison → ellipsis → 印刷 → Playwright PDF).
 *
 * Run (headed):
 * EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' npm run pw:ar:comparison-pdf -- --headed
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('comparisonReportPdfStandalone', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const skipReason = pdfGenerationSkipReason(browser);
    if (!playwrightPdfGenerationSupported(browser)) {
        const { evidence } = await runComparisonReportPdfStandalone({
            page,
            browser,
            testInfo,
            account: { email: '', password: '' },
            appOrigin: STG_APP_ORIGIN,
            skipPdfGenerationReason: skipReason,
        });
        await attachComparisonReportPdfEvidence(testInfo, evidence, null);
        test.skip(true, skipReason ?? 'PDF generation unsupported');
    }

    const account = resolvePart2LoginAccount();
    const { evidence, pdfPath, primaryError } = await runComparisonReportPdfStandalone({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
    });

    await finalizeComparisonReportPdfRun(testInfo, evidence, pdfPath, primaryError);

    expect(evidence.stages.comparisonSetup).toBe('Passed');
    expect(evidence.stages.applicationPrintMenuAction).toBe('Passed');
    expect(evidence.stages.a4PdfSave).toBe('Passed');
    expect(evidence.pdfValidation?.a4ValidationPassed).toBe(true);
    expect(evidence.stages.comparisonPairPreserved).toBe('Passed');
});