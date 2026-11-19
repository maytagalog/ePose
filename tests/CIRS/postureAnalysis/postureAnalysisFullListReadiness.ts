import { expect, type Locator, type Page } from '@playwright/test';
import { PostureAnalysisFlowError } from './postureAnalysisErrors';
import {
    isPostureAnalysisFullListActivelyLoading,
    postureAnalysisFullListContainer,
} from './postureAnalysisFullListLocators';
import {
    ANALYSIS_ID_ATTR,
    CUSTOMER_ID_ATTR,
    POSTURE_ANALYSIS_AUTOMATION_GAPS,
    POSTURE_ANALYSIS_TEST_IDS,
} from './postureAnalysisTestIds';

export const POSTURE_ANALYSIS_LIST_READY_TIMEOUT_MS = 15000;

export type PostureAnalysisFullListReadyPhase = 'analysis_full_list';

export type PostureAnalysisListLoadOutcome = 'populated' | 'empty';

type FullListTerminalPhase = 'loading' | 'empty' | 'populated' | 'invalid';

const LOAD_STATE_POLL_INTERVALS_MS = [50, 100, 200] as const;

/**
 * Section 6 `cirs-analysis-empty` on the full list. Trace 20261102-074838 did not exercise empty;
 * do not invent `analysis-report-history-empty`.
 */
function postureAnalysisFullListEmptyMarker(page: Page): Locator {
    return page.getByTestId(POSTURE_ANALYSIS_TEST_IDS.empty);
}

async function resolveFullListTerminalPhase(
    page: Page,
    historyList: Locator
): Promise<FullListTerminalPhase> {
    if (await isPostureAnalysisFullListActivelyLoading(historyList)) {
        return 'loading';
    }

    const items = historyList.getByTestId(POSTURE_ANALYSIS_TEST_IDS.item).locator('visible=true');
    const visibleItemCount = await items.count();
    const emptyVisible = await postureAnalysisFullListEmptyMarker(page).isVisible().catch(() => false);

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

export async function assertPostureAnalysisFullListItemCustomerIds(
    historyList: Locator,
    expectedCustomerId: string,
    phase: string
): Promise<void> {
    const items = historyList.getByTestId(POSTURE_ANALYSIS_TEST_IDS.item).locator('visible=true');
    const count = await items.count();
    for (let index = 0; index < count; index += 1) {
        const item = items.nth(index);
        const itemCustomerId = await item.getAttribute(CUSTOMER_ID_ATTR);
        if (itemCustomerId !== expectedCustomerId) {
            throw new PostureAnalysisFlowError(
                `Full-list cirs-analysis-item[${index}] data-customer-id (${itemCustomerId ?? 'none'}) != ` +
                    `expected ${expectedCustomerId} (phase=${phase}).`
            );
        }
        const analysisId = (await item.getAttribute(ANALYSIS_ID_ATTR))?.trim();
        if (!analysisId) {
            throw new PostureAnalysisFlowError(
                `Full-list cirs-analysis-item[${index}] missing data-analysis-id (phase=${phase}).`
            );
        }
    }
}

export async function assertPostureAnalysisFullListReady(
    page: Page,
    phase: PostureAnalysisFullListReadyPhase
): Promise<PostureAnalysisListLoadOutcome> {
    const historyList = postureAnalysisFullListContainer(page);
    await expect(historyList, `analysis-report-history-list visible (phase=${phase})`).toBeVisible({
        timeout: POSTURE_ANALYSIS_LIST_READY_TIMEOUT_MS,
    });

    let lastPhase: FullListTerminalPhase = 'loading';

    try {
        await expect
            .poll(
                async () => {
                    lastPhase = await resolveFullListTerminalPhase(page, historyList);
                    return lastPhase === 'empty' || lastPhase === 'populated';
                },
                {
                    timeout: POSTURE_ANALYSIS_LIST_READY_TIMEOUT_MS,
                    intervals: [...LOAD_STATE_POLL_INTERVALS_MS],
                    message:
                        'analysis-report-history-list terminal state ' +
                        '(active history loading finished + contract empty marker with zero rows OR visible rows; phase=' +
                        `${phase})`,
                }
            )
            .toBe(true);
    } catch {
        if (lastPhase === 'loading') {
            throw new PostureAnalysisFlowError(
                `analysis-report-history-list remained actively loading through timeout (phase=${phase}).`
            );
        }
        throw new PostureAnalysisFlowError(
            `analysis-report-history-list never reached a valid terminal state ` +
                `(need active loading finished AND (visible cirs-analysis-empty with zero cirs-analysis-item OR visible items without empty); ` +
                `lastPhase=${lastPhase}; phase=${phase}). ${POSTURE_ANALYSIS_AUTOMATION_GAPS.fullListEmptyStateHook}`
        );
    }

    const terminal = await resolveFullListTerminalPhase(page, historyList);
    if (terminal === 'empty') {
        return 'empty';
    }
    if (terminal === 'populated') {
        if (await postureAnalysisFullListEmptyMarker(page).isVisible().catch(() => false)) {
            throw new PostureAnalysisFlowError(
                `Populated full list must not show cirs-analysis-empty (phase=${phase}).`
            );
        }
        return 'populated';
    }
    throw new PostureAnalysisFlowError(
        `analysis-report-history-list poll resolved unexpectedly to ${terminal} (phase=${phase}).`
    );
}
