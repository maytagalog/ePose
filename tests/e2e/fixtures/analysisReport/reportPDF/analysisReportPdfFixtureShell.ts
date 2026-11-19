import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)));

export const ANALYSIS_REPORT_PDF_FIXTURE_ORIGIN = 'https://analysis-report-pdf-fixture.test';

export const ANALYSIS_REPORT_PDF_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ANALYSIS_REPORT_PDF_FIXTURE_ANALYSIS_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function loadPdfShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'analysisReportPdfShell.html'), 'utf8');
}

export type AnalysisReportPdfFixtureOptions = {
    /** When true, print handler sets a wrong document.title before window.print (negative test). */
    wrongPrintTitle?: boolean;
};

export async function installAnalysisReportPdfFixtureShell(
    page: Page,
    options?: AnalysisReportPdfFixtureOptions
): Promise<void> {
    await page.route(`${ANALYSIS_REPORT_PDF_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadPdfShellHtml() });
    });
    if (options?.wrongPrintTitle) {
        await page.addInitScript(() => {
            (window as unknown as Record<string, unknown>).__eposePdfFixtureWrongPrintTitle = true;
        });
    }
}
