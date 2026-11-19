import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN = 'https://analysis-report-share-email-fixture.test';

export const ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT = 'fixture-recipient@example.com';

function loadShareEmailShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'analysisReportShareEmailShell.html'), 'utf8');
}

export type AnalysisReportShareEmailFixtureFlags = Record<string, string | boolean | null>;

export async function installAnalysisReportShareEmailFixtureShell(
    page: Page,
    flags: AnalysisReportShareEmailFixtureFlags
): Promise<void> {
    await page.route(`${ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShareEmailShellHtml() });
    });
    await page.addInitScript((cfg) => {
        Object.assign(window as unknown as Record<string, unknown>, cfg);
    }, flags);
}
