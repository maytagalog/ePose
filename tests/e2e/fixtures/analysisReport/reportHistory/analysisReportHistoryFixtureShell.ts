import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const ANALYSIS_REPORT_HISTORY_FIXTURE_ORIGIN = 'https://analysis-report-history-fixture.test';

export const ANALYSIS_REPORT_HISTORY_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ANALYSIS_REPORT_HISTORY_FIXTURE_ANALYSIS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

export type AnalysisReportHistoryFixtureFlags = {
    historyEmpty?: boolean;
    omitSourceRow?: boolean;
    wrongHistoryCustomer?: boolean;
    wrongAnalysisOnRow?: boolean;
    historyLoading?: boolean;
};

function loadHistoryShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'analysisReportHistoryShell.html'), 'utf8');
}

export async function installAnalysisReportHistoryFixtureShell(
    page: Page,
    flags?: AnalysisReportHistoryFixtureFlags
): Promise<void> {
    await page.route(`${ANALYSIS_REPORT_HISTORY_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadHistoryShellHtml() });
    });
    await page.addInitScript((cfg) => {
        const w = window as unknown as Record<string, unknown>;
        w.__arhHistoryEmpty = Boolean(cfg.historyEmpty);
        w.__arhOmitSourceRow = Boolean(cfg.omitSourceRow);
        w.__arhWrongHistoryCustomer = Boolean(cfg.wrongHistoryCustomer);
        w.__arhWrongAnalysisOnRow = Boolean(cfg.wrongAnalysisOnRow);
        w.__arhHistoryLoading = Boolean(cfg.historyLoading);
    }, flags ?? {});
}
