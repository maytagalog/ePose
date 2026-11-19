import type { Page } from '@playwright/test';
import {
    type CustomerHistoryCatalogResult,
    loadCustomerHistoryCatalogFromNetwork,
} from '../reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { assertAnalysisReportDeletionTargetNotProtected } from '../reportDeletion/analysisReportDeletionProtectedTargets';
import {
    AnalysisReportDeletionFlowError,
    AnalysisReportDeletionPlanError,
} from '../reportDeletion/analysisReportDeletionErrors';
import type { AnalysisReportDeletionPlan } from '../reportDeletion/analysisReportDeletionPlanLedger';
import type { OldestReportSelection } from '../reportDeletion/analysisReportDeletionOldestSelection';
import { VERIFIED_CUSTOMER_HISTORY_NEWEST_FIRST_SORT_TYPES } from '../reportDeletion/analysisReportStagingContracts';
import { AnalysisReportFullSmokeConfigError } from './analysisReportFullSmokeConfig';

export type HistoryOrderNewestFirstPin = {
    customerId: string;
    analysisId: string;
    listCreatedAtIso: string;
    accountId: string;
    rowCount: number;
    catalogComplete: boolean;
    firstPageSortType: string;
    chronologyBasis: 'history-order-newest-first';
    selectionIndex: 0;
};

function assertCreatedAtIso(value: string, context: string): void {
    if (!value.trim() || Number.isNaN(Date.parse(value))) {
        throw new AnalysisReportDeletionFlowError(`${context}: invalid list createdAt "${value}".`);
    }
}

export function assertCustomerHistoryNewestFirstContract(
    catalog: CustomerHistoryCatalogResult & { accountId?: string }
): void {
    if (!catalog.catalogComplete) {
        throw new AnalysisReportDeletionFlowError(
            'History-order selection blocked: customer history catalog completeness not established.'
        );
    }
    if (catalog.rows.length === 0) {
        throw new AnalysisReportDeletionFlowError('Customer history is empty; no history-order pin exists.');
    }

    const sortType = catalog.firstPageSortType?.trim();
    if (!sortType) {
        throw new AnalysisReportDeletionFlowError(
            'History-order contract unverified: first-page fetch_customer_report sortType was not captured from network.'
        );
    }
  const allowed = VERIFIED_CUSTOMER_HISTORY_NEWEST_FIRST_SORT_TYPES as readonly string[];
    if (!allowed.includes(sortType)) {
        throw new AnalysisReportDeletionFlowError(
            `History-order contract rejected sortType=${sortType}; expected one of ${allowed.join(', ')} (newest-first API order).`
        );
    }

    for (let index = 0; index < catalog.rows.length; index += 1) {
        assertCreatedAtIso(catalog.rows[index]!.chronologyIso, `catalog row ${index}`);
    }

    for (let index = 1; index < catalog.rows.length; index += 1) {
        const prev = Date.parse(catalog.rows[index - 1]!.chronologyIso);
        const current = Date.parse(catalog.rows[index]!.chronologyIso);
        if (current > prev) {
            throw new AnalysisReportDeletionFlowError(
                'History-order contract violated: catalog rows are not non-increasing by api.createdAt (newest-first).'
            );
        }
    }

    catalog.historyOrderVerified = true;
}

export function selectHistoryOrderNewestFirstPin(
    catalog: CustomerHistoryCatalogResult & { accountId: string }
): HistoryOrderNewestFirstPin {
    assertCustomerHistoryNewestFirstContract(catalog);
    const first = catalog.rows[0]!;
    assertAnalysisReportDeletionTargetNotProtected(first.analysisId);
    return {
        customerId: first.customerId,
        analysisId: first.analysisId,
        listCreatedAtIso: first.chronologyIso,
        accountId: catalog.accountId,
        rowCount: catalog.rows.length,
        catalogComplete: catalog.catalogComplete,
        firstPageSortType: catalog.firstPageSortType!.trim(),
        chronologyBasis: 'history-order-newest-first',
        selectionIndex: 0,
    };
}

export function historyOrderPinToDeletionSelection(
    pin: HistoryOrderNewestFirstPin
): OldestReportSelection {
    return {
        customerId: pin.customerId,
        analysisId: pin.analysisId,
        measuredAtIso: pin.listCreatedAtIso,
        measuredAtDisplay: pin.listCreatedAtIso,
        listCreatedAtIso: pin.listCreatedAtIso,
        accountId: pin.accountId,
        deleteRequestId: pin.analysisId,
        rowCount: pin.rowCount,
        tiedAnalysisIds: [pin.analysisId],
        catalogComplete: pin.catalogComplete,
        chronologyBasis: 'history-order-newest-first',
    };
}

export function assertExplicitSourceMatchesHistoryOrderPin(
    explicitSourceAnalysisId: string | null,
    pin: HistoryOrderNewestFirstPin
): void {
    if (explicitSourceAnalysisId && explicitSourceAnalysisId !== pin.analysisId) {
        throw new AnalysisReportFullSmokeConfigError(
            `ANALYSIS_REPORT_VIEW_ANALYSIS_ID=${explicitSourceAnalysisId} conflicts with history-order newest pin ${pin.analysisId}; stop without silently overriding.`
        );
    }
}

export async function revalidateCombinedPinnedDeletionPlanOnHistory(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan
): Promise<void> {
    const catalog = await loadCustomerHistoryCatalogFromNetwork(page, appOrigin, plan.customerId, {
        reload: true,
    });
    if (!catalog.accountId) {
        throw new AnalysisReportDeletionPlanError('Pinned plan revalidation blocked: accountId missing from catalog.');
    }
    const pin = selectHistoryOrderNewestFirstPin({
        ...catalog,
        accountId: catalog.accountId,
    });

    const stillPresent = catalog.rows.some((row) => row.analysisId === plan.analysisId);
    if (!stillPresent) {
        throw new AnalysisReportDeletionPlanError(
            `Pinned analysisId ${plan.analysisId} is absent from customer history; stop without substituting another target.`
        );
    }
    if (pin.analysisId !== plan.analysisId) {
        throw new AnalysisReportDeletionPlanError(
            `Pinned analysisId ${plan.analysisId} is no longer history-order newest (${pin.analysisId}); stop without substitution.`
        );
    }
    if (pin.listCreatedAtIso !== plan.listCreatedAtIso && pin.listCreatedAtIso !== plan.measuredAtIso) {
        throw new AnalysisReportDeletionPlanError(
            `Pinned list createdAt changed for ${plan.analysisId}; stop for review.`
        );
    }
}
