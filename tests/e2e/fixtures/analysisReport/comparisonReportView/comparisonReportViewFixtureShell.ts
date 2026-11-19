import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN = 'https://comparison-report-view-fixture.test';
export const COMPARISON_REPORT_VIEW_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const COMPARISON_REPORT_VIEW_FIXTURE_ANALYSIS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';

export type ComparisonReportViewFixtureFlags = {
    singleOptionOnly?: boolean;
    missingSection?: boolean;
    /** After selecting another report, leave comparison loading visible and do not apply ids. */
    delayedSwitchLoading?: boolean;
    /** Option click does not update left column id (staleness trap for column-based switch assert). */
    delayedSwitchColumnOnly?: boolean;
};

function loadShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'comparisonReportViewShell.html'), 'utf8');
}

export async function installComparisonReportViewFixtureShell(
    page: Page,
    flags?: ComparisonReportViewFixtureFlags
): Promise<void> {
    await page.route(`${COMPARISON_REPORT_VIEW_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShellHtml() });
    });
    await page.addInitScript((cfg) => {
        const w = window as unknown as { __crvFlags?: Record<string, boolean> };
        w.__crvFlags = {
            singleOptionOnly: Boolean(cfg.singleOptionOnly),
            missingSection: Boolean(cfg.missingSection),
            delayedSwitchLoading: Boolean(cfg.delayedSwitchLoading),
            delayedSwitchColumnOnly: Boolean(cfg.delayedSwitchColumnOnly),
        };
    }, flags ?? {});
}