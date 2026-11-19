import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginCustomerHistoryNetworkCapture } from '../../../analysisReport/reportDeletion/analysisReportCustomerHistoryNetworkCapture';
import { loadCustomerHistoryCatalogFromNetwork } from '../../../analysisReport/reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { runAnalysisReportFullPreflight } from '../../../analysisReport/smoke/analysisReportFullPreflight';
import { postureAnalysisFullListPathname } from '../../../CIRS/postureAnalysis/postureAnalysisLocators';
import { VERIFIED_FETCH_CUSTOMER_REPORT_URL } from '../../../analysisReport/reportDeletion/analysisReportStagingContracts';
import type { AnalysisReportFullSmokeConfig } from '../../../analysisReport/smoke/analysisReportFullSmokeConfig';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://part2-handoff-history.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT_ID = 'part2-handoff-account';

function listShellHtml(): string {
    return fs.readFileSync(
        path.join(fixturesDir, '../analysisReport/reportDeletion/analysisReportHistoryNetworkCollectorShell.html'),
        'utf8'
    );
}

function reportShellHtml(): string {
    return fs.readFileSync(
        path.join(fixturesDir, '../analysisReport/reportView/analysisReportViewShell.html'),
        'utf8'
    );
}

function navigationQuery(scenario: string): string {
    return `?scenario=${scenario}&customerId=${CUSTOMER_ID}&accountId=${ACCOUNT_ID}&apiUrl=${encodeURIComponent(VERIFIED_FETCH_CUSTOMER_REPORT_URL)}`;
}

async function installHandoffHarness(page: import('@playwright/test').Page): Promise<void> {
    await page.route(`${ORIGIN}/**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/posture-analysis-report')) {
            await route.fulfill({ contentType: 'text/html', body: listShellHtml() });
            return;
        }
        if (/\/customers\/[^/]+\/reports\/[^/]+$/.test(url.pathname)) {
            await route.fulfill({ contentType: 'text/html', body: reportShellHtml() });
            return;
        }
        await route.abort();
    });
}

function handoffConfig(): AnalysisReportFullSmokeConfig {
    return {
        appOrigin: ORIGIN,
        source: {
            customerId: CUSTOMER_ID,
            analysisId: '',
            customerName: null,
            customerFurigana: null,
        },
        explicitSourceAnalysisId: null,
        sourceLatestTieBreakAnalysisId: null,
        shareEmailRecipient: 'fixture-recipient@test.local',
        shareEmailValidationMode: 'ui-send-confirmation',
        deletionMode: 'off',
        deletionCustomerId: CUSTOMER_ID,
        deletionPlanId: null,
        deletionTieBreakAnalysisId: null,
        deletionApiUrl: null,
        embeddedDeletionPlan: false,
    };
}

test('CIRS handoff capture on list navigation then preflight reuses catalog (no second fetch)', async ({ page }) => {
    let fetchCount = 0;
    await installHandoffHarness(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        fetchCount += 1;
        const pinnedAnalysisId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const rows = [
            {
                id: '10000000-0000-4000-8000-000000000003',
                analysisId: pinnedAnalysisId,
                customerId: CUSTOMER_ID,
                createdAt: '2025-01-03T08:00:00.000Z',
            },
            {
                id: '10000000-0000-4000-8000-000000000002',
                analysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                customerId: CUSTOMER_ID,
                createdAt: '2025-01-02T08:00:00.000Z',
            },
            {
                id: '10000000-0000-4000-8000-000000000001',
                analysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
                customerId: CUSTOMER_ID,
                createdAt: '2025-01-01T08:00:00.000Z',
            },
        ];
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(rows),
        });
    });

    const session = beginCustomerHistoryNetworkCapture(page, CUSTOMER_ID);
    await page.goto(`${ORIGIN}${postureAnalysisFullListPathname(CUSTOMER_ID)}${navigationQuery('part2Handoff')}`, {
        waitUntil: 'domcontentloaded',
    });
    const catalog = await session.completeAfterHistoryLoad();
    expect(fetchCount).toBe(1);
    expect(catalog.catalogComplete).toBe(true);

    const priorViewId = process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID;
    const priorHandoffFlag = process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST;
    process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID = CUSTOMER_ID;
    process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST = '1';
    try {
        const evidence = await runAnalysisReportFullPreflight(page, handoffConfig(), {
            preloadedCatalog: catalog,
        });
        expect(fetchCount).toBe(1);
        expect(evidence.historyOrderVerified).toBe(true);
        expect(evidence.sourceAnalysisId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    } finally {
        if (priorViewId === undefined) {
            delete process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID;
        } else {
            process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID = priorViewId;
        }
        if (priorHandoffFlag === undefined) {
            delete process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST;
        } else {
            process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST = priorHandoffFlag;
        }
    }
});

test.beforeEach(() => {
    process.env.ANALYSIS_REPORT_CUSTOMER_HISTORY_FIRST_PAGE_WAIT_MS = '3000';
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_CUSTOMER_HISTORY_FIRST_PAGE_WAIT_MS;
});

test('handoff without preloaded catalog fails when list already loaded', async ({ page }) => {
    let fetchCount = 0;
    await installHandoffHarness(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        fetchCount += 1;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: '1',
                    analysisId: '20000000-0000-4000-8000-000000000001',
                    customerId: CUSTOMER_ID,
                    createdAt: '2025-01-01T08:00:00.000Z',
                },
            ]),
        });
    });
    const session = beginCustomerHistoryNetworkCapture(page, CUSTOMER_ID);
    await page.goto(`${ORIGIN}${postureAnalysisFullListPathname(CUSTOMER_ID)}${navigationQuery('part2HandoffMissing')}`);
    await session.completeAfterHistoryLoad();
    expect(fetchCount).toBe(1);

    process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST = '1';
    await expect(
        loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, { reload: false })
    ).rejects.toThrow(/no matching fetch_customer_report request observed/);
    expect(fetchCount).toBe(1);
    delete process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST;
});
