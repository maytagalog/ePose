import { expect, type Locator, type Page } from '@playwright/test';
import {
    isPostureAnalysisFullListActivelyLoading,
    postureAnalysisFullListContainer,
} from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import { POSTURE_ANALYSIS_TEST_IDS } from '../../CIRS/postureAnalysis/postureAnalysisTestIds';
import { ANALYSIS_ID_ATTR, CUSTOMER_ID_ATTR } from '../analysisReportTestIds';
import {
    ANALYSIS_REPORT_DELETION_FIXTURE_LOAD_MORE_TEST_ID,
    ANALYSIS_REPORT_DELETION_FIXTURE_ROW_MEASURED_AT_ATTR,
} from './analysisReportDeletionFixtureContracts';
import { assertPostureAnalysisFullListReady } from '../../CIRS/postureAnalysis/postureAnalysisFullListReadiness';

const ACTION_TIMEOUT_MS = 15000;
const LOAD_MORE_MAX_CLICKS = 24;

export type FixtureCustomerHistoryRow = {
    customerId: string;
    analysisId: string;
    chronologyIso: string;
    rowIndex: number;
};

async function visibleHistoryItems(historyList: Locator): Promise<Locator> {
    return historyList.getByTestId(POSTURE_ANALYSIS_TEST_IDS.item).locator('visible=true');
}

async function waitForHistoryListQuiescent(historyList: Locator): Promise<void> {
    await expect
        .poll(async () => !(await isPostureAnalysisFullListActivelyLoading(historyList)), {
            timeout: ACTION_TIMEOUT_MS,
            message: 'customer history list not actively loading',
        })
        .toBe(true);
}

async function boundedFixtureLoadMore(historyList: Locator): Promise<void> {
    const loadMore = historyList
        .getByTestId(ANALYSIS_REPORT_DELETION_FIXTURE_LOAD_MORE_TEST_ID)
        .locator('visible=true');
    let clicks = 0;
    while ((await loadMore.count()) > 0 && clicks < LOAD_MORE_MAX_CLICKS) {
        clicks += 1;
        await loadMore.click({ timeout: ACTION_TIMEOUT_MS });
        await waitForHistoryListQuiescent(historyList);
    }
}

/** Fixture-only catalog; uses synthetic data-measured-at / load-more controls. */
export async function collectFixtureCustomerHistoryRows(
    page: Page,
    expectedCustomerId: string
): Promise<FixtureCustomerHistoryRow[]> {
    const historyList = postureAnalysisFullListContainer(page);
    const outcome = await assertPostureAnalysisFullListReady(page, 'analysis_full_list');
    if (outcome === 'empty') {
        throw new Error('Customer history is empty; no deletion target exists.');
    }
    await waitForHistoryListQuiescent(historyList);
    await boundedFixtureLoadMore(historyList);

    const items = await visibleHistoryItems(historyList);
    const count = await items.count();
    const rows: FixtureCustomerHistoryRow[] = [];
    for (let index = 0; index < count; index += 1) {
        const item = items.nth(index);
        const customerId = (await item.getAttribute(CUSTOMER_ID_ATTR))?.trim() ?? '';
        const analysisId = (await item.getAttribute(ANALYSIS_ID_ATTR))?.trim() ?? '';
        if (customerId !== expectedCustomerId || !analysisId) {
            throw new Error(`Fixture history row[${index}] identity invalid.`);
        }
        const chronologyIso =
            (await item.getAttribute(ANALYSIS_REPORT_DELETION_FIXTURE_ROW_MEASURED_AT_ATTR))?.trim() ?? '';
        if (!chronologyIso || Number.isNaN(Date.parse(chronologyIso))) {
            throw new Error(
                `Fixture row[${index}] missing synthetic ${ANALYSIS_REPORT_DELETION_FIXTURE_ROW_MEASURED_AT_ATTR}.`
            );
        }
        rows.push({ customerId, analysisId, chronologyIso, rowIndex: index });
    }
    return rows;
}
