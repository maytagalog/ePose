import type { Page } from '@playwright/test';
import { captureAnalysisReportHistorySourceIdentity } from '../reportHistory/analysisReportHistorySourceIdentity';
import { assertAnalysisReportReady } from '../reportView/analysisReportSingleReportLocators';
import { clickCustomerHistoryReportRowByIdentity } from '../reportHistory/analysisReportCustomerHistoryLocators';
import { gotoCustomerReportHistoryList } from './analysisReportDeletionNavigation';
import {
    type CustomerHistoryCatalogResult,
    loadCustomerHistoryCatalogFromNetwork,
} from './analysisReportCustomerHistoryApiCatalog';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import { isDeletionFixtureOrigin } from './analysisReportDeletionFixtureMode';

export type MeasuredHistoryRow = {
    customerId: string;
    analysisId: string;
    listCreatedAtIso: string;
    measuredAtIso: string;
    measuredAtDisplay: string;
    rowIndex: number;
};

export async function enrichCustomerHistoryWithMeasuredAt(
    page: Page,
    appOrigin: string,
    customerId: string,
    catalog: CustomerHistoryCatalogResult
): Promise<{ rows: MeasuredHistoryRow[]; catalogComplete: boolean }> {
    if (!catalog.catalogComplete) {
        throw new AnalysisReportDeletionFlowError(
            'Measured-at enrichment blocked: history catalog completeness not established.'
        );
    }

    if (isDeletionFixtureOrigin(page.url())) {
        return {
            catalogComplete: true,
            rows: catalog.rows.map((row, rowIndex) => ({
                customerId: row.customerId,
                analysisId: row.analysisId,
                listCreatedAtIso: row.chronologyIso,
                measuredAtIso: row.chronologyIso,
                measuredAtDisplay: row.chronologyIso,
                rowIndex,
            })),
        };
    }

    const rows: MeasuredHistoryRow[] = [];
    for (const row of catalog.rows) {
        await clickCustomerHistoryReportRowByIdentity(page, customerId, row.analysisId);
        await assertAnalysisReportReady(page, customerId, row.analysisId);
        const identity = await captureAnalysisReportHistorySourceIdentity(page);
        rows.push({
            customerId: row.customerId,
            analysisId: row.analysisId,
            listCreatedAtIso: row.chronologyIso,
            measuredAtIso: identity.measuredAtIso,
            measuredAtDisplay: identity.measuredAtDisplayToken,
            rowIndex: row.rowIndex,
        });
        await gotoCustomerReportHistoryList(page, appOrigin, customerId);
    }

    if (rows.length !== catalog.rows.length) {
        throw new AnalysisReportDeletionFlowError('Measured-at enrichment row count mismatch.');
    }

    return { rows, catalogComplete: true };
}

export async function collectMeasuredCustomerHistory(
    page: Page,
    appOrigin: string,
    customerId: string,
    options?: { catalog?: CustomerHistoryCatalogResult; reloadCatalog?: boolean }
): Promise<{ rows: MeasuredHistoryRow[]; catalogComplete: boolean }> {
    const catalog =
        options?.catalog ??
        (await loadCustomerHistoryCatalogFromNetwork(page, appOrigin, customerId, {
            reload: options?.reloadCatalog ?? true,
        }));
    return enrichCustomerHistoryWithMeasuredAt(page, appOrigin, customerId, catalog);
}
