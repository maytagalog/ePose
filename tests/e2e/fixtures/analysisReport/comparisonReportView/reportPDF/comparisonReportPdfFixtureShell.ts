import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const COMPARISON_REPORT_PDF_FIXTURE_ORIGIN = 'https://comparison-report-pdf-fixture.test';
export const COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_ID =
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const COMPARISON_REPORT_PDF_FIXTURE_ANALYSIS_ID =
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
export const COMPARISON_REPORT_PDF_FIXTURE_LEFT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0003';
export const COMPARISON_REPORT_PDF_FIXTURE_RIGHT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
export const COMPARISON_REPORT_PDF_FIXTURE_CUSTOMER_NAME = 'Nikolas Fixture';

export type ComparisonReportPdfFixtureFlags = {
    pairSwapsOnPrint?: boolean;
    fastPrint?: boolean;
};

function loadShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'comparisonReportPdfShell.html'), 'utf8');
}

export async function installComparisonReportPdfFixtureShell(
    page: Page,
    flags?: ComparisonReportPdfFixtureFlags
): Promise<void> {
    await page.route(`${COMPARISON_REPORT_PDF_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShellHtml() });
    });
    await page.addInitScript((cfg) => {
        const w = window as unknown as { __crpFlags?: Record<string, boolean> };
        w.__crpFlags = {
            pairSwapsOnPrint: Boolean(cfg.pairSwapsOnPrint),
            fastPrint: Boolean(cfg.fastPrint),
        };
    }, flags ?? {});
}