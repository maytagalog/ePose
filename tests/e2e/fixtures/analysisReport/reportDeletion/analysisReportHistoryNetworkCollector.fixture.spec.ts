import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    beginCustomerHistoryNetworkCapture,
    abortCaptureOnFailure,
} from '../../../../analysisReport/reportDeletion/analysisReportCustomerHistoryNetworkCapture';
import {
    loadCustomerHistoryCatalogFromNetwork,
} from '../../../../analysisReport/reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { postureAnalysisFullListPathname } from '../../../../CIRS/postureAnalysis/postureAnalysisLocators';
import { VERIFIED_FETCH_CUSTOMER_REPORT_URL } from '../../../../analysisReport/reportDeletion/analysisReportStagingContracts';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://analysis-report-history-network.test';
const CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
const ACCOUNT_ID = 'network-fixture-account';

function shellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'analysisReportHistoryNetworkCollectorShell.html'), 'utf8');
}

function navigationQuery(scenario: string): string {
    return `?scenario=${scenario}&customerId=${CUSTOMER_ID}&accountId=${ACCOUNT_ID}&apiUrl=${encodeURIComponent(VERIFIED_FETCH_CUSTOMER_REPORT_URL)}`;
}

test.beforeEach(() => {
    process.env.ANALYSIS_REPORT_CUSTOMER_HISTORY_FIRST_PAGE_WAIT_MS = '8000';
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_CUSTOMER_HISTORY_FIRST_PAGE_WAIT_MS;
});

async function installHarnessRoutes(page: import('@playwright/test').Page): Promise<void> {
    await page.route(`${ORIGIN}/**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/posture-analysis-report')) {
            await route.fulfill({ contentType: 'text/html', body: shellHtml() });
            return;
        }
        await route.abort();
    });
}

test('captures first response before list readiness completes', async ({ page }) => {
    let requestCount = 0;
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        requestCount += 1;
        const body = JSON.parse(route.request().postData() || '{}');
        expect(body.isFirstPage).toBe(true);
        expect(body.customerId).toBe(CUSTOMER_ID);
        expect(body.accountId).toBe(ACCOUNT_ID);
        const rows = Array.from({ length: 17 }, (_, i) => ({
            id: `90000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
            analysisId: `80000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
            customerId: CUSTOMER_ID,
            createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });

    const session = beginCustomerHistoryNetworkCapture(page, CUSTOMER_ID);
    await page.goto(`${ORIGIN}${postureAnalysisFullListPathname(CUSTOMER_ID)}${navigationQuery('earlyResponse')}`, {
        waitUntil: 'domcontentloaded',
    });
    const capture = await session.completeAfterHistoryLoad();
    expect(capture.pagesFetched).toBe(1);
    expect(capture.rows.length).toBe(17);
    expect(capture.accountId).toBe(ACCOUNT_ID);
    expect(requestCount).toBe(1);
});

test('17-item first page completes without another request', async ({ page }) => {
    let requestCount = 0;
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        requestCount += 1;
        const rows = Array.from({ length: 17 }, (_, i) => ({
            id: `a0000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
            analysisId: `b0000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
            customerId: CUSTOMER_ID,
            createdAt: `2023-06-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    const capture = await loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
        reload: true,
        navigationQuery: navigationQuery('short17'),
    });
    expect(capture.pagesFetched).toBe(1);
    expect(requestCount).toBe(1);
});

test('full page followed by terminal short page', async ({ page }) => {
    const seen: number[] = [];
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        const pageNo = body.isFirstPage ? 1 : 2;
        seen.push(pageNo);
        const rows =
            pageNo === 1
                ? Array.from({ length: 25 }, (_, i) => ({
                      id: `c0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
                      analysisId: `d0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
                      customerId: CUSTOMER_ID,
                      createdAt: `2022-01-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
                  }))
                : [
                      {
                          id: 'e0000000-0000-4000-8000-000000000001',
                          analysisId: 'f0000000-0000-4000-8000-000000000001',
                          customerId: CUSTOMER_ID,
                          createdAt: '2021-01-01T08:00:00.000Z',
                      },
                  ];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    const capture = await loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
        reload: true,
        navigationQuery: navigationQuery('full25_then_3'),
    });
    expect(capture.pagesFetched).toBe(2);
    expect(seen).toEqual([1, 2]);
    expect(capture.rows.length).toBe(26);
});

test('malformed payload fails instead of proving completeness', async ({ page }) => {
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ analysisId: 'only-one-field', customerId: CUSTOMER_ID }]),
        });
    });
    await expect(
        loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
            reload: true,
            navigationQuery: navigationQuery('malformed'),
        })
    ).rejects.toThrow(/missing required fields/i);
});

test('wrong-customer response cannot populate the catalog', async ({ page }) => {
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: '10000000-0000-4000-8000-000000000001',
                    analysisId: '20000000-0000-4000-8000-000000000001',
                    customerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    createdAt: '2020-01-01T08:00:00.000Z',
                },
            ]),
        });
    });
    await expect(
        loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
            reload: true,
            navigationQuery: navigationQuery('wrongCustomer'),
        })
    ).rejects.toThrow(/customerId/);
});

test('capture failure cleans up observers without unhandled rejections', async ({ page }) => {
    const session = beginCustomerHistoryNetworkCapture(page, CUSTOMER_ID);
    await page.goto('about:blank');
    await expect(session.completeAfterHistoryLoad()).rejects.toThrow(/no matching fetch_customer_report request/);
});

test('delayed first request after navigation while UI still loading', async ({ page }) => {
    let requestCount = 0;
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        requestCount += 1;
        const rows = Array.from({ length: 5 }, (_, i) => ({
            id: `70000000-0000-4000-8000-00000000000${i + 1}`,
            analysisId: `60000000-0000-4000-8000-00000000000${i + 1}`,
            customerId: CUSTOMER_ID,
            createdAt: `2024-02-0${i + 1}T08:00:00.000Z`,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    const session = beginCustomerHistoryNetworkCapture(page, CUSTOMER_ID);
    await page.goto(
        `${ORIGIN}${postureAnalysisFullListPathname(CUSTOMER_ID)}${navigationQuery('delayedFirstRequest')}`,
        { waitUntil: 'domcontentloaded' }
    );
    const capture = await session.completeAfterHistoryLoad();
    expect(capture.pagesFetched).toBe(1);
    expect(requestCount).toBe(1);
});

test('delayed response completes after request was observed', async ({ page }) => {
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const rows = Array.from({ length: 4 }, (_, i) => ({
            id: `50000000-0000-4000-8000-00000000000${i + 1}`,
            analysisId: `40000000-0000-4000-8000-00000000000${i + 1}`,
            customerId: CUSTOMER_ID,
            createdAt: `2024-03-0${i + 1}T08:00:00.000Z`,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    const capture = await loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
        reload: true,
        navigationQuery: navigationQuery('short17'),
    });
    expect(capture.rows.length).toBe(4);
});

test('completion waits until first response is fully validated', async ({ page }) => {
    let fulfillStarted = false;
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        fulfillStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 600));
        const rows = [
            {
                id: '30000000-0000-4000-8000-000000000001',
                analysisId: '20000000-0000-4000-8000-000000000001',
                customerId: CUSTOMER_ID,
                createdAt: '2024-04-01T08:00:00.000Z',
            },
        ];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    const session = beginCustomerHistoryNetworkCapture(page, CUSTOMER_ID);
    const navigation = page.goto(
        `${ORIGIN}${postureAnalysisFullListPathname(CUSTOMER_ID)}${navigationQuery('short17')}`,
        { waitUntil: 'domcontentloaded' }
    );
    const completion = session.completeAfterHistoryLoad();
    await navigation;
    expect(fulfillStarted).toBe(true);
    const capture = await completion;
    expect(capture.pagesFetched).toBe(1);
});

test('no fetch produces bounded diagnostic failure', async ({ page }) => {
    await installHarnessRoutes(page);
    await expect(
        loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
            reload: true,
            navigationQuery: navigationQuery('noFetch'),
        })
    ).rejects.toThrow(/no matching fetch_customer_report request observed/);
});

test('invalid first response fails promptly and disposes capture', async ({ page }) => {
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{"not":"an-array"}',
        });
    });
    const session = beginCustomerHistoryNetworkCapture(page, CUSTOMER_ID);
    await page.goto(
        `${ORIGIN}${postureAnalysisFullListPathname(CUSTOMER_ID)}${navigationQuery('short17')}`,
        { waitUntil: 'domcontentloaded' }
    );
    const started = Date.now();
    await expect(session.completeAfterHistoryLoad()).rejects.toThrow(/response received but invalid/i);
    expect(Date.now() - started).toBeLessThan(5000);
});

test('explicit reload performs another capture cycle', async ({ page }) => {
    let requestCount = 0;
    await installHarnessRoutes(page);
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        requestCount += 1;
        const rows = Array.from({ length: 3 }, (_, i) => ({
            id: `10000000-0000-4000-8000-00000000000${i + 1}`,
            analysisId: `20000000-0000-4000-8000-00000000000${i + 1}`,
            customerId: CUSTOMER_ID,
            createdAt: `2019-01-0${i + 1}T08:00:00.000Z`,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    await loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
        reload: true,
        navigationQuery: navigationQuery('short17'),
    });
    await loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, {
        reload: true,
        navigationQuery: navigationQuery('short17'),
    });
    expect(requestCount).toBe(2);
});
