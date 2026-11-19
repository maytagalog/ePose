import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN = 'https://comparison-report-share-qr-fixture.test';
export const COMPARISON_REPORT_SHARE_QR_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const COMPARISON_REPORT_SHARE_QR_FIXTURE_ANALYSIS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';

export type ComparisonReportShareQrFixtureFlags = {
    missingQrContent?: boolean;
    closeFails?: boolean;
    pairChangesOnClose?: boolean;
};

function loadShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'comparisonReportShareQrShell.html'), 'utf8');
}

export async function installComparisonReportShareQrFixtureShell(
    page: Page,
    flags?: ComparisonReportShareQrFixtureFlags
): Promise<void> {
    await page.route(`${COMPARISON_REPORT_SHARE_QR_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShellHtml() });
    });
    await page.addInitScript((cfg) => {
        const w = window as unknown as { __crqFlags?: Record<string, boolean> };
        w.__crqFlags = {
            missingQrContent: Boolean(cfg.missingQrContent),
            closeFails: Boolean(cfg.closeFails),
            pairChangesOnClose: Boolean(cfg.pairChangesOnClose),
        };
    }, flags ?? {});
}