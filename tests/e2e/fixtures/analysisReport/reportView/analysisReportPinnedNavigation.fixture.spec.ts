import { test, expect } from '@playwright/test';
import { VERIFIED_FETCH_ANALYSIS_REPORT_PATH } from '../../../../analysisReport/reportDeletion/analysisReportStagingContracts';
import {
    ANALYSIS_REPORT_NAVIGATION_TIMEOUT_MS,
    assertAnalysisReportReady,
    gotoAnalysisReportDetail,
    navigateToPinnedAnalysisReport,
} from '../../../../analysisReport/reportView/analysisReportSingleReportLocators';
import {
    ANALYSIS_REPORT_STG_LIKE_FIXTURE_ORIGIN,
    ANALYSIS_REPORT_VIEW_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_VIEW_FIXTURE_CUSTOMER_ID,
    installAnalysisReportViewFixtureShell,
} from './analysisReportViewFixtureShell';

const STG_LIKE = ANALYSIS_REPORT_STG_LIKE_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_VIEW_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_VIEW_FIXTURE_ANALYSIS_ID;

const fetchRoutePattern = `**/*${VERIFIED_FETCH_ANALYSIS_REPORT_PATH}**`;

async function installStgLikeShell(
    page: Parameters<typeof installAnalysisReportViewFixtureShell>[0],
    extraFlags: Record<string, string | boolean> = {}
): Promise<void> {
    await installAnalysisReportViewFixtureShell(
        page,
        { __arvMode: 'success', __arvEmitFetchAnalysisReportOnBoot: true, ...extraFlags },
        { origin: STG_LIKE }
    );
}

test('fetch waiter is registered before navigation issues fetch (immediate response)', async ({ page }) => {
    await installStgLikeShell(page);

    let fetchSatisfied = false;
    await page.route(fetchRoutePattern, async (route) => {
        fetchSatisfied = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const started = Date.now();
    await navigateToPinnedAnalysisReport(page, STG_LIKE, CUSTOMER_ID, ANALYSIS_ID);
    const elapsed = Date.now() - started;

    expect(fetchSatisfied).toBe(true);
    expect(elapsed).toBeLessThan(8000);
});

test('non-2xx fetch_analysis_report rejects before load-state poll', async ({ page }) => {
    await installStgLikeShell(page);
    await page.route(fetchRoutePattern, async (route) => {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":true}' });
    });

    await expect(
        gotoAnalysisReportDetail(page, STG_LIKE, CUSTOMER_ID, ANALYSIS_ID, { awaitVerifiedReportFetch: true })
    ).rejects.toThrow(/fetch_analysis_report HTTP 503/);
});

test('report never reaches ready after immediate fetch (bounded load-state)', async ({ page }) => {
    test.setTimeout(ANALYSIS_REPORT_NAVIGATION_TIMEOUT_MS + 20_000);
    await installStgLikeShell(page, { __arvFetchLeavesLoading: true });
    await page.route(fetchRoutePattern, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    const started = Date.now();
    await expect(
        navigateToPinnedAnalysisReport(page, STG_LIKE, CUSTOMER_ID, ANALYSIS_ID)
    ).rejects.toThrow(/remained loading through bounded wait/i);
    expect(Date.now() - started).toBeLessThan(ANALYSIS_REPORT_NAVIGATION_TIMEOUT_MS * 3 + 5_000);
});

test('navigation failure drains fetch waiter within navigation bound', async ({ page }) => {
    test.setTimeout(ANALYSIS_REPORT_NAVIGATION_TIMEOUT_MS + 20_000);
    await page.route(fetchRoutePattern, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route(`${STG_LIKE}/customers/**/reports/**`, (route) => route.abort('internetdisconnected'));

    const started = Date.now();
    await expect(
        gotoAnalysisReportDetail(page, STG_LIKE, CUSTOMER_ID, ANALYSIS_ID, { awaitVerifiedReportFetch: true })
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(ANALYSIS_REPORT_NAVIGATION_TIMEOUT_MS + 5_000);
});
