import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

/** Shared Analysis Report HTML fixture origin (tests/e2e/fixtures/analysisReport/reportView/analysisReportViewShell.html). */
export const ANALYSIS_REPORT_VIEW_FIXTURE_ORIGIN = 'https://analysis-report-view-fixture.test';

/** Hostname matches `shouldAwaitVerifiedFetchAnalysisReport` for pinned-navigation tests without staging. */
export const ANALYSIS_REPORT_STG_LIKE_FIXTURE_ORIGIN = 'https://app-stg.pin-nav-fixt.test';

export const ANALYSIS_REPORT_VIEW_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ANALYSIS_REPORT_VIEW_FIXTURE_ANALYSIS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

export function loadAnalysisReportViewShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'analysisReportViewShell.html'), 'utf8');
}

/**
 * Route all navigation under the fixture origin to the centralized shell HTML and apply window flags.
 */
export async function installAnalysisReportViewFixtureShell(
    page: Page,
    flags: Record<string, string | boolean>,
    options?: { origin?: string }
): Promise<void> {
    const origin = options?.origin ?? ANALYSIS_REPORT_VIEW_FIXTURE_ORIGIN;
    const body = loadAnalysisReportViewShellHtml();
    await page.route(`${origin}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body });
    });
    await page.addInitScript((cfg) => {
        Object.assign(window as unknown as Record<string, unknown>, cfg);
    }, flags);
}
