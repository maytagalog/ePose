import type { Page } from '@playwright/test';
import { assertAnalysisReportDeletionTargetNotProtected } from './analysisReportDeletionProtectedTargets';
import {
    collectMeasuredCustomerHistory,
    enrichCustomerHistoryWithMeasuredAt,
    type MeasuredHistoryRow,
} from './analysisReportDeletionMeasuredAtCatalog';
import type { CustomerHistoryCatalogResult } from './analysisReportCustomerHistoryApiCatalog';
import {
    selectEarliestFromMeasuredRows,
    type MeasuredAtReportSelection,
} from './analysisReportMeasuredAtSelection';

export type OldestReportSelection = MeasuredAtReportSelection;

function selectOldestMeasuredRow(
    rows: MeasuredHistoryRow[],
    accountId: string,
    tieBreakAnalysisId: string | null,
    catalogComplete: boolean
): OldestReportSelection {
    const selection = selectEarliestFromMeasuredRows(rows, accountId, tieBreakAnalysisId, catalogComplete);
    assertAnalysisReportDeletionTargetNotProtected(selection.analysisId);
    return selection;
}

export async function selectOldestCustomerHistoryReport(
    page: Page,
    appOrigin: string,
    customerId: string,
    accountId: string,
    tieBreakAnalysisId: string | null,
    options?: { catalog: CustomerHistoryCatalogResult }
): Promise<OldestReportSelection> {
    const measured = options?.catalog
        ? await enrichCustomerHistoryWithMeasuredAt(page, appOrigin, customerId, options.catalog)
        : await collectMeasuredCustomerHistory(page, appOrigin, customerId, { reloadCatalog: true });
    return selectOldestMeasuredRow(measured.rows, accountId, tieBreakAnalysisId, measured.catalogComplete);
}

export function selectOldestFromMeasuredRows(
    rows: MeasuredHistoryRow[],
    accountId: string,
    tieBreakAnalysisId: string | null,
    catalogComplete: boolean
): OldestReportSelection {
    return selectOldestMeasuredRow(rows, accountId, tieBreakAnalysisId, catalogComplete);
}
