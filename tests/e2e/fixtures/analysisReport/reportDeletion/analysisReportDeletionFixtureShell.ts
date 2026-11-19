import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page, Route } from '@playwright/test';
import { ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_API_URL } from '../../../../analysisReport/reportDeletion/analysisReportDeletionFixtureContracts';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN = 'https://analysis-report-deletion-fixture.test';
export const ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Oldest target in default multi-row catalog. */
export const ANALYSIS_REPORT_DELETION_FIXTURE_OLDEST_ANALYSIS_ID =
    '11111111-1111-4111-8111-111111111111';
export const ANALYSIS_REPORT_DELETION_FIXTURE_PROTECTED_ANALYSIS_ID =
    'a871ea8f-c5e8-4fbd-b933-75fe8e2a144f';

export type AnalysisReportDeletionFixtureFlags = {
    historyEmpty?: boolean;
    omitMeasuredAt?: boolean;
    tiedOldest?: boolean;
    protectedOldest?: boolean;
    incompletePagination?: boolean;
    failDeleteApi?: boolean;
    surviveAfterDelete?: boolean;
    deleteUncertain?: boolean;
    stallDeleteResponse?: boolean;
    /** After delete confirm, app navigates to /customers with visible customer list (staging delete success). */
    deleteLandsOnCustomerPage?: boolean;
    wrongDeleteLandingCustomerId?: string | null;
};

function loadShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'analysisReportDeletionShell.html'), 'utf8');
}

export async function installAnalysisReportDeletionFixtureShell(
    page: Page,
    flags?: AnalysisReportDeletionFixtureFlags
): Promise<void> {
    await page.unroute(`${ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN}/**`);
    await page.unroute(ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_API_URL);
    await page.route(`${ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShellHtml() });
    });
    await page.route(ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_API_URL, async (route: Route) => {
        const failApi = await page.evaluate(() =>
            Boolean((window as unknown as Record<string, unknown>).__ardFailDeleteApi)
        );
        const uncertain = await page.evaluate(() =>
            Boolean((window as unknown as Record<string, unknown>).__ardDeleteUncertain)
        );
        if (failApi) {
            await route.fulfill({ status: 500, body: '{"error":"fixture_delete_failed"}' });
            return;
        }
        if (uncertain) {
            await route.abort('failed');
            return;
        }
        const stall = await page.evaluate(() =>
            Boolean((window as unknown as Record<string, unknown>).__ardStallDeleteResponse)
        );
        if (stall) {
            return;
        }
        await route.fulfill({ status: 200, body: '{"data":{"deleted":true}}' });
    });
    await page.addInitScript((cfg) => {
        const w = window as unknown as Record<string, unknown>;
        w.__ardHistoryEmpty = Boolean(cfg.historyEmpty);
        w.__ardOmitMeasuredAt = Boolean(cfg.omitMeasuredAt);
        w.__ardTiedOldest = Boolean(cfg.tiedOldest);
        w.__ardProtectedOldest = Boolean(cfg.protectedOldest);
        w.__ardIncompletePagination = Boolean(cfg.incompletePagination);
        w.__ardFailDeleteApi = Boolean(cfg.failDeleteApi);
        w.__ardSurviveAfterDelete = Boolean(cfg.surviveAfterDelete);
        w.__ardDeleteUncertain = Boolean(cfg.deleteUncertain);
        w.__ardStallDeleteResponse = Boolean(cfg.stallDeleteResponse);
        w.__ardDeleteLandsOnCustomerPage = Boolean(cfg.deleteLandsOnCustomerPage);
        w.__ardWrongDeleteLandingCustomerId = cfg.wrongDeleteLandingCustomerId?.trim() || null;
        try {
            const raw = sessionStorage.getItem('ardDeletedIds');
            w.__ardDeletedIds = raw ? JSON.parse(raw) : [];
        } catch {
            w.__ardDeletedIds = w.__ardDeletedIds ?? [];
        }
    }, flags ?? {});
}
