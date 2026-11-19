import type { Locator, Page } from '@playwright/test';

/**
 * Staging full-list hooks (trace 20261102-074838). Section 6 `cirs-analysis-list` is absent on staging.
 */
export const POSTURE_ANALYSIS_FULL_LIST_TEST_IDS = {
    historyList: 'analysis-report-history-list',
    historyLoading: 'analysis-report-history-loading',
} as const;

/** Trace 20261102-074838: active load = `analysis-report-history-loading` node with ant-spin-spinning (wrapper may persist). */
export const POSTURE_ANALYSIS_FULL_LIST_ACTIVE_SPIN_CLASS = 'ant-spin-spinning';

export function postureAnalysisFullListContainer(page: Page): Locator {
    return page.getByTestId(POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList).locator('visible=true');
}

export function postureAnalysisFullListHistoryLoadingNodes(scope: Locator): Locator {
    return scope.getByTestId(POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading);
}

type LoadingHookEvaluateArgs = {
    loadingTestId: string;
    activeSpinClass: string;
};

/**
 * Active load on any matching loading hook or descendant `.ant-spin-spinning` (wrapper may persist).
 * Uses one in-DOM scan so removed duplicate hooks do not stall on stale Playwright nth() waits (trace 20261113-122508).
 */
export async function isActivelyLoadingOnLoadingHooks(
    scope: Locator,
    loadingTestId: string
): Promise<boolean> {
    const args: LoadingHookEvaluateArgs = {
        loadingTestId,
        activeSpinClass: POSTURE_ANALYSIS_FULL_LIST_ACTIVE_SPIN_CLASS,
    };
    return scope
        .evaluate((root, evaluateArgs) => {
            const nodeList = root.querySelectorAll(`[data-testid="${evaluateArgs.loadingTestId}"]`);
            const activeSpinClass = evaluateArgs.activeSpinClass;
            for (let index = 0; index < nodeList.length; index += 1) {
                const node = nodeList.item(index);
                if (!node || !(node instanceof HTMLElement) || node.hidden) {
                    continue;
                }
                const nodeStyle = window.getComputedStyle(node);
                if (nodeStyle.display === 'none' || nodeStyle.visibility === 'hidden') {
                    continue;
                }
                const spinTarget = node.classList.contains(activeSpinClass)
                    ? node
                    : node.querySelector(`.${activeSpinClass}`);
                if (!spinTarget || !(spinTarget instanceof HTMLElement) || spinTarget.hidden) {
                    continue;
                }
                if (!spinTarget.classList.contains(activeSpinClass)) {
                    continue;
                }
                const spinStyle = window.getComputedStyle(spinTarget);
                if (spinStyle.display !== 'none' && spinStyle.visibility !== 'hidden') {
                    return true;
                }
            }
            return false;
        }, args)
        .catch(() => false);
}

export async function isPostureAnalysisFullListActivelyLoading(historyList: Locator): Promise<boolean> {
    return isActivelyLoadingOnLoadingHooks(
        historyList,
        POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading
    );
}
