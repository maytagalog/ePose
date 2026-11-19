import { expect, type Locator, type Page } from '@playwright/test';
import { isActivelyLoadingOnLoadingHooks } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import { appNavigationMenuDialog } from '../../mypage/profile/myPageProfileFlow';
import {
    ANALYSIS_ID_ATTR,
    ANALYSIS_REPORT_ALL_LIST_TEST_IDS,
    ANALYSIS_REPORT_AUTOMATION_GAPS,
    ANALYSIS_REPORT_HISTORY_TEST_IDS,
    ANALYSIS_REPORT_ROW_TEST_ID,
    CUSTOMER_ID_ATTR,
} from '../analysisReportTestIds';
import { AnalysisReportViewFlowError } from './analysisReportViewErrors';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;
const LIST_READY_TIMEOUT_MS = 30000;
const ROW_FIND_SCROLL_ATTEMPTS = 12;
const LIST_LOAD_STATE_POLL_INTERVALS_MS = [50, 100, 200] as const;

type GlobalListTerminalPhase = 'loading' | 'empty' | 'populated' | 'invalid';

/** Verified navigation-menu label (trace 20261104-133702; no contracted menu test id). */
export const ANALYSIS_REPORT_GLOBAL_LIST_MENU_LABEL = '分析レポート一覧';

export function analysisReportAllListContainer(page: Page): Locator {
    return page.getByTestId(ANALYSIS_REPORT_ALL_LIST_TEST_IDS.list);
}

export function analysisReportCustomerHistoryList(page: Page): Locator {
    return page.getByTestId(ANALYSIS_REPORT_HISTORY_TEST_IDS.list);
}

/** Customer-scoped report history route (§14); not the global all-reports list. */
export function isCustomerReportHistoryRoute(pathname: string): boolean {
    return /\/customers\/[0-9a-f-]{36}\/posture-analysis-report(?:\/|$|\?)/i.test(pathname);
}

export async function openGlobalAnalysisReportListFromMainMenu(page: Page): Promise<void> {
    await page.getByRole('img', { name: 'Menu' }).click({ timeout: ACTION_TIMEOUT_MS });
    const dialog = appNavigationMenuDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const navItem = dialog.getByText(ANALYSIS_REPORT_GLOBAL_LIST_MENU_LABEL, { exact: true });
    await expect(
        navItem,
        ANALYSIS_REPORT_AUTOMATION_GAPS.mainMenuItem
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await navItem.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toBeHidden({ timeout: NAVIGATION_TIMEOUT_MS });
}

export async function assertGlobalAnalysisReportListRoute(page: Page): Promise<Locator> {
    const allList = analysisReportAllListContainer(page);
    await expect(allList, 'global cirs-analysis-list container').toBeVisible({
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    const pathname = new URL(page.url()).pathname;
    if (isCustomerReportHistoryRoute(pathname)) {
        throw new AnalysisReportViewFlowError(
            `Expected global all-reports list (cirs-analysis-list), not customer history route ${pathname}. ${ANALYSIS_REPORT_AUTOMATION_GAPS.globalListRoute}`
        );
    }
    return allList;
}

async function resolveGlobalAnalysisReportListTerminalPhase(
    list: Locator
): Promise<GlobalListTerminalPhase> {
    if (
        await isActivelyLoadingOnLoadingHooks(list, ANALYSIS_REPORT_ALL_LIST_TEST_IDS.loading)
    ) {
        return 'loading';
    }

    const items = list.getByTestId(ANALYSIS_REPORT_ROW_TEST_ID).locator('visible=true');
    const visibleItemCount = await items.count();
    const empty = list.getByTestId(ANALYSIS_REPORT_ALL_LIST_TEST_IDS.empty);
    const emptyVisible = await empty.isVisible().catch(() => false);

    if (emptyVisible && visibleItemCount === 0) {
        return 'empty';
    }
    if (visibleItemCount > 0 && !emptyVisible) {
        return 'populated';
    }
    if (visibleItemCount > 0 && emptyVisible) {
        return 'invalid';
    }
    return 'invalid';
}

/** Trace 20261104-134714: nested duplicate `cirs-analysis-loading` hooks; wrapper may persist after spin stops. */
export async function awaitGlobalAnalysisReportListReady(page: Page): Promise<'populated' | 'empty'> {
    const list = await assertGlobalAnalysisReportListRoute(page);
    let lastPhase: GlobalListTerminalPhase = 'loading';

    try {
        await expect
            .poll(
                async () => {
                    lastPhase = await resolveGlobalAnalysisReportListTerminalPhase(list);
                    return lastPhase === 'empty' || lastPhase === 'populated';
                },
                {
                    timeout: LIST_READY_TIMEOUT_MS,
                    intervals: [...LIST_LOAD_STATE_POLL_INTERVALS_MS],
                    message:
                        'global cirs-analysis-list terminal state ' +
                        '(active loading finished + visible cirs-analysis-empty with zero rows OR visible rows without empty)',
                }
            )
            .toBe(true);
    } catch {
        if (lastPhase === 'loading') {
            throw new AnalysisReportViewFlowError(
                'Global cirs-analysis-list remained actively loading through timeout.'
            );
        }
        throw new AnalysisReportViewFlowError(
            `Global cirs-analysis-list never reached a valid terminal state ` +
                `(need active loading finished AND (visible cirs-analysis-empty with zero cirs-analysis-item OR visible items without empty); ` +
                `lastPhase=${lastPhase}). ${ANALYSIS_REPORT_AUTOMATION_GAPS.globalListRoute}`
        );
    }

    const terminal = await resolveGlobalAnalysisReportListTerminalPhase(list);
    if (terminal === 'empty') {
        return 'empty';
    }
    if (terminal === 'populated') {
        const empty = list.getByTestId(ANALYSIS_REPORT_ALL_LIST_TEST_IDS.empty);
        if (await empty.isVisible().catch(() => false)) {
            throw new AnalysisReportViewFlowError(
                'Populated global analysis list must not show cirs-analysis-empty.'
            );
        }
        return 'populated';
    }
    throw new AnalysisReportViewFlowError(
        `Global cirs-analysis-list poll resolved unexpectedly to ${terminal}.`
    );
}

function analysisReportListRowLocator(
    list: Locator,
    customerId: string,
    analysisId: string
): Locator {
    return list.locator(
        `[data-testid="${ANALYSIS_REPORT_ROW_TEST_ID}"][${CUSTOMER_ID_ATTR}="${customerId}"][${ANALYSIS_ID_ATTR}="${analysisId}"]`
    );
}

export async function clickAnalysisReportListRowByIdentity(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<void> {
    const list = await assertGlobalAnalysisReportListRoute(page);
    const row = analysisReportListRowLocator(list, customerId, analysisId);
    if (await row.isVisible().catch(() => false)) {
        await row.click({ timeout: ACTION_TIMEOUT_MS });
        return;
    }

    for (let attempt = 0; attempt < ROW_FIND_SCROLL_ATTEMPTS; attempt += 1) {
        await list.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });
        if (await row.isVisible().catch(() => false)) {
            await row.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
            await row.click({ timeout: ACTION_TIMEOUT_MS });
            return;
        }
    }

    throw new AnalysisReportViewFlowError(
        `Could not find cirs-analysis-item with data-customer-id=${customerId} and data-analysis-id=${analysisId} on the global list after bounded scrolling.`
    );
}
