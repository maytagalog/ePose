import type { Browser } from '@playwright/test';
import { ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON } from '../analysisReportTestIds';

export function playwrightPdfGenerationSupported(browser: Browser): boolean {
    return browser.browserType().name() === 'chromium';
}

export function pdfGenerationSkipReason(browser: Browser): string | null {
    if (playwrightPdfGenerationSupported(browser)) {
        return null;
    }
    return ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON;
}
