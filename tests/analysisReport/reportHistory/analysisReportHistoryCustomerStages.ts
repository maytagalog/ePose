import type { Page } from '@playwright/test';
import {
    assertCustomerReportHistoryListReady,
    assertCustomerReportHistoryRoute,
} from './analysisReportHistoryCustomerReadiness';
import {
    AnalysisReportHistoryStageTracker,
    markOpenStagesFailed,
} from './analysisReportHistoryStageTracker';

/** Customer history route + list readiness with the same throw/markOpenStagesFailed path as the standalone orchestrator. */
export async function executeAnalysisReportHistoryCustomerStages(
    page: Page,
    tracker: AnalysisReportHistoryStageTracker,
    customerId: string,
    appOrigin: string
): Promise<{ error: unknown | null }> {
    try {
        tracker.enter('historyRouteCustomerVerification');
        await assertCustomerReportHistoryRoute(page, customerId, appOrigin);
        tracker.pass('historyRouteCustomerVerification');

        tracker.enter('historyReadiness');
        await assertCustomerReportHistoryListReady(page, customerId);
        tracker.pass('historyReadiness');
        return { error: null };
    } catch (error) {
        markOpenStagesFailed(tracker);
        return { error };
    }
}
