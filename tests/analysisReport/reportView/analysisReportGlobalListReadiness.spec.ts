import { test, expect } from '@playwright/test';
import {
    ANALYSIS_ID_ATTR,
    ANALYSIS_REPORT_ALL_LIST_TEST_IDS,
    ANALYSIS_REPORT_ROW_TEST_ID,
    CUSTOMER_ID_ATTR,
} from '../analysisReportTestIds';
import {
    awaitGlobalAnalysisReportListReady,
    analysisReportAllListContainer,
} from './analysisReportAllListLocators';
import { isActivelyLoadingOnLoadingHooks } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';

const FIXTURE_ORIGIN = 'https://analysis-report-global-list-readiness.test';
const FIXTURE_LIST_URL = `${FIXTURE_ORIGIN}/analysis-report-list`;

async function gotoGlobalListTestPage(page: import('@playwright/test').Page): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: '<!DOCTYPE html><html><body></body></html>',
        });
    });
    await page.goto(FIXTURE_LIST_URL, { waitUntil: 'domcontentloaded' });
}

function nestedGlobalLoadingMarkup(options: { spinning: boolean; rows?: string; emptyHidden?: boolean }): string {
    const spinClass = options.spinning ? 'ant-spin ant-spin-spinning' : 'ant-spin';
    const emptyHidden = options.emptyHidden !== false;
    return `
      <div data-testid="${ANALYSIS_REPORT_ALL_LIST_TEST_IDS.list}" style="min-height: 8px">
        <div class="ant-spin-nested-loading" data-testid="${ANALYSIS_REPORT_ALL_LIST_TEST_IDS.loading}">
          <div
            class="${spinClass}"
            data-testid="${ANALYSIS_REPORT_ALL_LIST_TEST_IDS.loading}"
            aria-busy="${options.spinning ? 'true' : 'false'}"
            style="min-height: 12px; min-width: 12px"
          ></div>
        </div>
        ${options.rows ?? ''}
        <p data-testid="${ANALYSIS_REPORT_ALL_LIST_TEST_IDS.empty}" ${emptyHidden ? 'hidden' : ''}>empty</p>
      </div>
    `;
}

test('persistent cirs-analysis-loading wrapper without active spin is not treated as loading', async ({ page }) => {
    await gotoGlobalListTestPage(page);
    await page.setContent(nestedGlobalLoadingMarkup({ spinning: false }));

    const list = analysisReportAllListContainer(page);
    await expect(
        isActivelyLoadingOnLoadingHooks(list, ANALYSIS_REPORT_ALL_LIST_TEST_IDS.loading)
    ).resolves.toBe(false);
    await expect(awaitGlobalAnalysisReportListReady(page)).rejects.toThrow(/never reached a valid terminal state/i);
});

test('active ant-spin-spinning on cirs-analysis-loading blocks terminal state until cleared', async ({ page }) => {
    await gotoGlobalListTestPage(page);
    await page.setContent(
        nestedGlobalLoadingMarkup({
            spinning: true,
            rows: `<button type="button" data-testid="${ANALYSIS_REPORT_ROW_TEST_ID}" ${CUSTOMER_ID_ATTR}="c1" ${ANALYSIS_ID_ATTR}="a1">row</button>`,
        })
    );

    const list = analysisReportAllListContainer(page);
    await expect(
        isActivelyLoadingOnLoadingHooks(list, ANALYSIS_REPORT_ALL_LIST_TEST_IDS.loading)
    ).resolves.toBe(true);
    await expect(awaitGlobalAnalysisReportListReady(page)).rejects.toThrow(/remained actively loading/i);
});

test('populated terminal when nested loading wrapper persists and active spin stops', async ({ page }) => {
    await gotoGlobalListTestPage(page);
    await page.setContent(
        nestedGlobalLoadingMarkup({
            spinning: false,
            rows: `<button type="button" data-testid="${ANALYSIS_REPORT_ROW_TEST_ID}" ${CUSTOMER_ID_ATTR}="c1" ${ANALYSIS_ID_ATTR}="a1">row</button>`,
        })
    );

    await expect(awaitGlobalAnalysisReportListReady(page)).resolves.toBe('populated');
});

test('empty terminal when spin stops with visible cirs-analysis-empty and zero rows', async ({ page }) => {
    await gotoGlobalListTestPage(page);
    await page.setContent(nestedGlobalLoadingMarkup({ spinning: false, emptyHidden: false }));

    await expect(awaitGlobalAnalysisReportListReady(page)).resolves.toBe('empty');
});

test('delayed rows after spin stops resolve to populated', async ({ page }) => {
    await gotoGlobalListTestPage(page);
    await page.setContent(nestedGlobalLoadingMarkup({ spinning: true }));

    const ready = awaitGlobalAnalysisReportListReady(page);
    await page.evaluate(
        ({ rowTestId, customerAttr, analysisAttr }) => {
            window.setTimeout(() => {
                const list = document.querySelector('[data-testid="cirs-analysis-list"]');
                const spinNodes = list?.querySelectorAll('[data-testid="cirs-analysis-loading"]');
                spinNodes?.forEach((node) => {
                    if (node.classList.contains('ant-spin-spinning')) {
                        node.classList.remove('ant-spin-spinning');
                        node.removeAttribute('aria-busy');
                    }
                });
                const row = document.createElement('button');
                row.type = 'button';
                row.setAttribute('data-testid', rowTestId);
                row.setAttribute(customerAttr, 'c1');
                row.setAttribute(analysisAttr, 'a1');
                row.textContent = 'row';
                list?.appendChild(row);
            }, 200);
        },
        {
            rowTestId: ANALYSIS_REPORT_ROW_TEST_ID,
            customerAttr: CUSTOMER_ID_ATTR,
            analysisAttr: ANALYSIS_ID_ATTR,
        }
    );

    await expect(ready).resolves.toBe('populated');
});
