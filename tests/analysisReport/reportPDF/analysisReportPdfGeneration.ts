import type { Page } from '@playwright/test';
import {
    assertAnalysisReportPdfReadiness,
    restoreAnalysisReportScreenMedia,
    type AnalysisReportPdfReadinessEvidence,
    type AnalysisReportPdfReadinessOptions,
} from './analysisReportPdfReadiness';

export type AnalysisReportPdfGenerationOptions = {
    outputPath: string;
    readiness?: AnalysisReportPdfReadinessOptions;
    /** When set, replaces default single-report readiness (comparison PDF save, etc.). */
    prepareReadiness?: (page: Page) => Promise<AnalysisReportPdfReadinessEvidence>;
};

export type AnalysisReportPdfGenerationEvidence = {
    method: 'playwright-page-pdf';
    format: 'A4';
    printBackground: boolean;
    marginMm: { top: number; right: number; bottom: number; left: number };
    mediaEmulation: 'print';
    outputPath: string;
    note: string;
    readiness: AnalysisReportPdfReadinessEvidence | null;
};

/** Test-controlled PDF from the loaded report page (not an application PDF download). */
export async function generateAnalysisReportA4Pdf(
    page: Page,
    options: AnalysisReportPdfGenerationOptions
): Promise<AnalysisReportPdfGenerationEvidence> {
    const evidence: AnalysisReportPdfGenerationEvidence = {
        method: 'playwright-page-pdf',
        format: 'A4',
        printBackground: true,
        marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
        mediaEmulation: 'print',
        outputPath: options.outputPath,
        note:
            'Automation uses Playwright page.pdf with format A4, printBackground: true (preserve report colors/backgrounds in headless PDF), and zero margins so content is not clipped by an extra margin layer — this is a test harness choice, not verified parity with a manual browser Save/Print dialog. No @page size rule found in this repository. Native print preview was not automated.',
        readiness: null,
    };

    try {
        evidence.readiness = options.prepareReadiness
            ? await options.prepareReadiness(page)
            : await assertAnalysisReportPdfReadiness(page, options.readiness);
        await page.pdf({
            path: options.outputPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
        return evidence;
    } finally {
        await restoreAnalysisReportScreenMedia(page);
    }
}
