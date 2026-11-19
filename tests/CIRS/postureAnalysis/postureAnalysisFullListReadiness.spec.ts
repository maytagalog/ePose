import { test, expect } from '@playwright/test';
import { assertPostureAnalysisFullListReady } from './postureAnalysisFullListReadiness';
import {
    isPostureAnalysisFullListActivelyLoading,
    POSTURE_ANALYSIS_FULL_LIST_TEST_IDS,
} from './postureAnalysisFullListLocators';
import { POSTURE_ANALYSIS_TEST_IDS } from './postureAnalysisTestIds';

function nestedHistoryLoadingMarkup(options: {
    spinning: boolean;
    rows?: string;
    includeHiddenStaleHook?: boolean;
    dualHooks?: boolean;
}): string {
    const spinClass = options.spinning ? 'ant-spin ant-spin-spinning' : 'ant-spin';
    const hiddenStale =
        options.includeHiddenStaleHook === true
            ? `<div class="ant-spin ant-spin-spinning" data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading}" hidden></div>`
            : '';
    const innerHook = options.dualHooks !== false
        ? `<div class="ant-spin-nested-loading" data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading}">
             <div class="${spinClass}" data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading}" style="min-height:12px;min-width:12px"></div>
           </div>`
        : `<div class="${spinClass}" data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading}" style="min-height:12px;min-width:12px"></div>`;
    return `
      <div data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList}" style="min-height: 8px">
        ${hiddenStale}
        ${innerHook}
        ${options.rows ?? ''}
      </div>
    `;
}

test('persistent history-loading wrapper without active spin is not treated as loading', async ({ page }) => {
    await page.setContent(`
      <div data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList}" style="min-height: 8px">
        <div class="ant-spin-nested-loading" data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading}">
          <div class="ant-spin-container"></div>
        </div>
      </div>
    `);

    const historyList = page.getByTestId(POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList);
    await expect(isPostureAnalysisFullListActivelyLoading(historyList)).resolves.toBe(false);
    await expect(assertPostureAnalysisFullListReady(page, 'analysis_full_list')).rejects.toThrow(
        /never reached a valid terminal state/i
    );
});

test('hidden stale analysis-report-history-loading with spin class is not actively loading', async ({ page }) => {
    await page.setContent(
        nestedHistoryLoadingMarkup({
            spinning: false,
            includeHiddenStaleHook: true,
            rows: `<div data-testid="${POSTURE_ANALYSIS_TEST_IDS.item}" data-analysis-id="a1" data-customer-id="c1">row</div>`,
        })
    );

    const historyList = page.getByTestId(POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList);
    await expect(isPostureAnalysisFullListActivelyLoading(historyList)).resolves.toBe(false);
    await expect(assertPostureAnalysisFullListReady(page, 'analysis_full_list')).resolves.toBe('populated');
});

test('active ant-spin-spinning blocks terminal state until cleared', async ({ page }) => {
    await page.setContent(
        nestedHistoryLoadingMarkup({
            spinning: true,
            rows: `<div data-testid="${POSTURE_ANALYSIS_TEST_IDS.item}" data-analysis-id="a1" data-customer-id="c1">row</div>`,
        })
    );

    const historyList = page.getByTestId(POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList);
    await expect(isPostureAnalysisFullListActivelyLoading(historyList)).resolves.toBe(true);

    await expect(assertPostureAnalysisFullListReady(page, 'analysis_full_list')).rejects.toThrow(
        /remained actively loading/i
    );
});

test('populated terminal when wrapper persists and active spin stops', async ({ page }) => {
    await page.setContent(
        nestedHistoryLoadingMarkup({
            spinning: false,
            rows: `<div data-testid="${POSTURE_ANALYSIS_TEST_IDS.item}" data-analysis-id="a1" data-customer-id="c1">row</div>`,
        })
    );

    await expect(assertPostureAnalysisFullListReady(page, 'analysis_full_list')).resolves.toBe('populated');
});

test('loading hooks removed during polling resolve to populated without nth stall', async ({ page }) => {
    await page.setContent(
        nestedHistoryLoadingMarkup({
            spinning: true,
            dualHooks: true,
        })
    );

    const ready = assertPostureAnalysisFullListReady(page, 'analysis_full_list');
    await page.evaluate(
        ({ listTestId, itemTestId, loadingTestId }) => {
            const list = document.querySelector(`[data-testid="${listTestId}"]`);
            list?.querySelectorAll(`[data-testid="${loadingTestId}"]`).forEach((node) => node.remove());
            const row = document.createElement('div');
            row.setAttribute('data-testid', itemTestId);
            row.setAttribute('data-analysis-id', 'a1');
            row.setAttribute('data-customer-id', 'c1');
            row.textContent = 'row';
            list?.appendChild(row);
        },
        {
            listTestId: POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList,
            itemTestId: POSTURE_ANALYSIS_TEST_IDS.item,
            loadingTestId: POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading,
        }
    );

    await expect(ready).resolves.toBe('populated');
});

test('one duplicate hook removed while spinner stops on the other', async ({ page }) => {
    await page.setContent(
        nestedHistoryLoadingMarkup({
            spinning: true,
            dualHooks: true,
        })
    );

    const ready = assertPostureAnalysisFullListReady(page, 'analysis_full_list');
    await page.evaluate(
        ({ loadingTestId, itemTestId }) => {
            const spinNodes = document.querySelectorAll(`[data-testid="${loadingTestId}"]`);
            spinNodes.forEach((node, index) => {
                if (index === 0) {
                    node.remove();
                    return;
                }
                node.querySelectorAll('.ant-spin-spinning').forEach((spin) => {
                    spin.classList.remove('ant-spin-spinning');
                });
            });
            const row = document.createElement('div');
            row.setAttribute('data-testid', itemTestId);
            row.setAttribute('data-analysis-id', 'a1');
            row.setAttribute('data-customer-id', 'c1');
            row.textContent = 'row';
            document
                .querySelector('[data-testid="analysis-report-history-list"]')
                ?.appendChild(row);
        },
        { loadingTestId: POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading, itemTestId: POSTURE_ANALYSIS_TEST_IDS.item }
    );

    await expect(ready).resolves.toBe('populated');
});
