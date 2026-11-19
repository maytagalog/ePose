import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)));

export const ANALYSIS_REPORT_SHARE_QR_FIXTURE_ORIGIN = 'https://analysis-report-share-qr-fixture.test';

export const ANALYSIS_REPORT_SHARE_QR_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ANALYSIS_REPORT_SHARE_QR_FIXTURE_ANALYSIS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function loadShareQrShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'analysisReportShareQrShell.html'), 'utf8');
}

export async function installAnalysisReportShareQrFixtureShell(
    page: Page,
    flags: Record<string, string | boolean>
): Promise<void> {
    await page.route(`${ANALYSIS_REPORT_SHARE_QR_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShareQrShellHtml() });
    });
    await page.addInitScript((cfg) => {
        Object.assign(window as unknown as Record<string, unknown>, cfg);
    }, flags);
}
