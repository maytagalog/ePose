import type { Page } from '@playwright/test';
import {
    assertPostureAnalysisFullListRoute,
    postureAnalysisFullListPathname,
} from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { assertCustomerReportHistoryListReady } from '../reportHistory/analysisReportHistoryCustomerReadiness';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import { isDeletionFixtureOrigin } from './analysisReportDeletionFixtureMode';
import { collectFixtureCustomerHistoryRows } from './analysisReportDeletionHistoryCatalog.fixture';
import { ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID } from './analysisReportDeletionFixtureContracts';
import {
    beginCustomerHistoryNetworkCapture,
    type CustomerHistoryCatalogCapture,
    type CustomerHistoryNetworkCaptureSession,
    abortCaptureOnFailure,
} from './analysisReportCustomerHistoryNetworkCapture';

export type CustomerHistoryCatalogRow = {
    customerId: string;
    analysisId: string;
    chronologyIso: string;
    chronologySource: 'api.createdAt' | 'fixture.data-measured-at';
    rowIndex: number;
};

export type CustomerHistoryCatalogResult = {
    rows: CustomerHistoryCatalogRow[];
    catalogComplete: boolean;
    pagesFetched: number;
    /** First-page fetch_customer_report sortType when captured from network (combined history-order contract). */
    firstPageSortType?: string | null;
    historyOrderVerified?: boolean;
};

export type CustomerHistoryCatalogLoadResult = CustomerHistoryCatalogCapture;

/**
 * Start capture, navigate (or reload) customer history, await readiness, then finish catalog capture.
 * Must be used for every fresh staging read (initial, post-cancel refresh, post-delete, reconcile).
 */
export type CustomerHistoryCatalogLoadOptions = {
    reload?: boolean;
    navigationQuery?: string;
    /** When false, return validated API capture without route/list UI assertions (reconciliation). */
    postCaptureUiVerification?: boolean;
    /** When true, an empty first page is returned instead of throwing (reconciliation). */
    allowEmptyHistory?: boolean;
};

export async function loadCustomerHistoryCatalogFromNetwork(
    page: Page,
    appOrigin: string,
    expectedCustomerId: string,
    options?: CustomerHistoryCatalogLoadOptions
): Promise<CustomerHistoryCatalogLoadResult> {
    if (isDeletionFixtureOrigin(page.url()) || isDeletionFixtureOrigin(appOrigin)) {
        return loadFixtureCustomerHistoryCatalog(page, expectedCustomerId);
    }

    let session: CustomerHistoryNetworkCaptureSession | null = beginCustomerHistoryNetworkCapture(
        page,
        expectedCustomerId
    );
    const NAVIGATION_TIMEOUT_MS = 30000;
    try {
        if (options?.reload !== false) {
            await page.goto(
                `${appOrigin}${postureAnalysisFullListPathname(expectedCustomerId)}${options?.navigationQuery ?? ''}`,
                {
                    waitUntil: 'domcontentloaded',
                    timeout: NAVIGATION_TIMEOUT_MS,
                }
            );
        }
        const capture = await session.completeAfterHistoryLoad();
        session = null;
        const verifyUi = options?.postCaptureUiVerification !== false;
        if (verifyUi) {
            await assertPostureAnalysisFullListRoute(page, expectedCustomerId, appOrigin);
            await assertCustomerReportHistoryListReady(page, expectedCustomerId);
        }
        if (capture.emptyHistory && !options?.allowEmptyHistory) {
            throw new AnalysisReportDeletionFlowError(
                'Customer history is empty; no deletion target exists.'
            );
        }
        return capture;
    } catch (error) {
        abortCaptureOnFailure(session, error);
        throw error;
    }
}

async function loadFixtureCustomerHistoryCatalog(
    page: Page,
    expectedCustomerId: string
): Promise<CustomerHistoryCatalogLoadResult> {
    const fixtureRows = await collectFixtureCustomerHistoryRows(page, expectedCustomerId);
    return {
        rows: fixtureRows.map((row) => ({
            customerId: row.customerId,
            analysisId: row.analysisId,
            chronologyIso: row.chronologyIso,
            chronologySource: 'fixture.data-measured-at' as const,
            rowIndex: row.rowIndex,
        })),
        catalogComplete: true,
        pagesFetched: 1,
        accountId: ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
        emptyHistory: fixtureRows.length === 0,
        firstPageSortType: 'DESC',
        historyOrderVerified: false,
    };
}

/** @deprecated Use loadCustomerHistoryCatalogFromNetwork or pass a preloaded catalog forward. */
export async function collectCompleteCustomerHistoryRows(
    page: Page,
    expectedCustomerId: string
): Promise<CustomerHistoryCatalogResult> {
    if (isDeletionFixtureOrigin(page.url())) {
        const fixtureRows = await collectFixtureCustomerHistoryRows(page, expectedCustomerId);
        return {
            rows: fixtureRows.map((row) => ({
                customerId: row.customerId,
                analysisId: row.analysisId,
                chronologyIso: row.chronologyIso,
                chronologySource: 'fixture.data-measured-at' as const,
                rowIndex: row.rowIndex,
            })),
            catalogComplete: true,
            pagesFetched: 1,
        };
    }
    throw new AnalysisReportDeletionFlowError(
        'collectCompleteCustomerHistoryRows without pre-navigation capture is not supported on staging; call loadCustomerHistoryCatalogFromNetwork.'
    );
}
