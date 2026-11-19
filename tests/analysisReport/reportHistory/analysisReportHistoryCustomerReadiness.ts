import type { Page } from '@playwright/test';
import { assertPostureAnalysisFullListRoute } from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { PostureAnalysisFlowError } from '../../CIRS/postureAnalysis/postureAnalysisErrors';
import {
    assertPostureAnalysisFullListItemCustomerIds,
    assertPostureAnalysisFullListReady,
    type PostureAnalysisFullListReadyPhase,
} from '../../CIRS/postureAnalysis/postureAnalysisFullListReadiness';
import { postureAnalysisFullListContainer } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';

const PHASE: PostureAnalysisFullListReadyPhase = 'analysis_full_list';

/** Customer-scoped history route and origin (no list terminal state). */
export async function assertCustomerReportHistoryRoute(
    page: Page,
    expectedCustomerId: string,
    appOrigin: string
): Promise<void> {
    await assertPostureAnalysisFullListRoute(page, expectedCustomerId, appOrigin);
}

/**
 * Terminal list state + row customer IDs on the current history route.
 * Empty history is a failure for the standalone round trip.
 */
export async function assertCustomerReportHistoryListReady(
    page: Page,
    expectedCustomerId: string
): Promise<'populated'> {
    const outcome = await assertPostureAnalysisFullListReady(page, PHASE);
    if (outcome === 'empty') {
        throw new PostureAnalysisFlowError(
            'Customer report history is empty; source report must be listed for this flow.'
        );
    }
    const historyList = postureAnalysisFullListContainer(page);
    await assertPostureAnalysisFullListItemCustomerIds(historyList, expectedCustomerId, PHASE);
    return 'populated';
}

/** Route + list readiness (fixtures and shortcuts). */
export async function assertCustomerReportHistoryReadyForRoundTrip(
    page: Page,
    expectedCustomerId: string,
    appOrigin: string
): Promise<'populated'> {
    await assertCustomerReportHistoryRoute(page, expectedCustomerId, appOrigin);
    return assertCustomerReportHistoryListReady(page, expectedCustomerId);
}
