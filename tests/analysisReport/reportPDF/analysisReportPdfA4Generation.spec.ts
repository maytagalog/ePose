import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    attachAnalysisReportPdfEvidence,
} from './analysisReportPdfReporting';
import { pdfGenerationSkipReason, playwrightPdfGenerationSupported } from './analysisReportPdfBrowserCapability';
import { resolveAnalysisReportPdfSmokeTarget } from './analysisReportPdfSmokeConfig';
import {
    buildSkipEvidence,
    runAnalysisReportPdfA4GenerationRun,
} from './analysisReportPdfRunOrchestrator';

/**
 * B. A4 PDF generation and saved-file validation (Chromium / browserName only).
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportPdfA4Generation', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const skipReason = pdfGenerationSkipReason(browser);
    const target = resolveAnalysisReportPdfSmokeTarget();

    if (!playwrightPdfGenerationSupported(browser)) {
        const skipEvidence = buildSkipEvidence({
            page,
            browser,
            testInfo,
            account: { email: '', password: '' },
            appOrigin: STG_APP_ORIGIN,
            target,
            skipPdfGenerationReason: skipReason,
        });
        await attachAnalysisReportPdfEvidence(testInfo, skipEvidence, null);
        test.skip(true, skipReason ?? 'PDF generation unsupported');
    }

    const account = resolvePart2LoginAccount();

    const { evidence, pdfPath, primaryError } = await runAnalysisReportPdfA4GenerationRun({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        target,
        skipPdfGenerationReason: null,
    });

    let attachError: unknown = null;
    try {
        await attachAnalysisReportPdfEvidence(testInfo, evidence, pdfPath);
    } catch (error) {
        attachError = error;
        console.warn('Failed to attach A4 PDF evidence:', error);
    }

    if (primaryError) {
        throw primaryError;
    }
    if (attachError) {
        throw attachError;
    }

    expect(evidence.stages.applicationPrintMenuAction).toBe('Passed');
    expect(evidence.stages.a4PdfGeneration).toBe('Passed');
    expect(evidence.pdfValidation?.a4ValidationPassed).toBe(true);
});
