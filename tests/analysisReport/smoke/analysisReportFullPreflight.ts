import type { Page } from '@playwright/test';
import { assertPostureAnalysisFullListRoute } from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { navigateToPinnedAnalysisReport } from '../reportView/analysisReportSingleReportLocators';
import {
    loadCustomerHistoryCatalogFromNetwork,
    type CustomerHistoryCatalogLoadResult,
} from '../reportDeletion/analysisReportCustomerHistoryApiCatalog';
import type { AnalysisReportFullPreflightEvidence } from './analysisReportFullReporting';
import type { AnalysisReportFullSmokeConfig } from './analysisReportFullSmokeConfig';
import { persistCombinedDeletionTargetPlan } from './analysisReportFullDeletionPhase';
import {
    assertExplicitSourceMatchesHistoryOrderPin,
    historyOrderPinToDeletionSelection,
    selectHistoryOrderNewestFirstPin,
} from './analysisReportCombinedHistoryOrderSelection';
import { AnalysisReportDeletionFlowError } from '../reportDeletion/analysisReportDeletionErrors';

export type AnalysisReportFullPreflightOptions = {
    /** CIRS Part 2 handoff: catalog captured while opening the analysis report list (same session). */
    preloadedCatalog?: CustomerHistoryCatalogLoadResult | null;
};

export async function runAnalysisReportFullPreflight(
    page: Page,
    config: AnalysisReportFullSmokeConfig,
    preflightOptions?: AnalysisReportFullPreflightOptions
): Promise<AnalysisReportFullPreflightEvidence> {
    const customerId = config.source.customerId;
    const startOnCirsList =
        process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST === '1' ||
        process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST === 'true';
    if (startOnCirsList) {
        await assertPostureAnalysisFullListRoute(page, customerId, config.appOrigin);
    }
    let catalog: CustomerHistoryCatalogLoadResult;
    if (startOnCirsList && preflightOptions?.preloadedCatalog) {
        catalog = preflightOptions.preloadedCatalog;
    } else {
        catalog = await loadCustomerHistoryCatalogFromNetwork(page, config.appOrigin, customerId, {
            reload: !startOnCirsList,
        });
    }
    if (!catalog.catalogComplete || !catalog.accountId) {
        throw new AnalysisReportDeletionFlowError('Preflight history catalog did not reach completeness.');
    }

    const pin = selectHistoryOrderNewestFirstPin({
        ...catalog,
        accountId: catalog.accountId,
    });
    assertExplicitSourceMatchesHistoryOrderPin(config.explicitSourceAnalysisId, pin);

    let deletionPlanId: string | null = null;
    if (config.deletionMode !== 'off') {
        const selection = historyOrderPinToDeletionSelection(pin);
        if (config.embeddedDeletionPlan) {
            const plan = await persistCombinedDeletionTargetPlan(config.appOrigin, selection);
            deletionPlanId = plan.planId;
        }
    }

    await navigateToPinnedAnalysisReport(page, config.appOrigin, customerId, pin.analysisId);

    return {
        sourceCustomerId: customerId,
        sourceAnalysisId: pin.analysisId,
        listCreatedAtIso: pin.listCreatedAtIso,
        explicitSourceAnalysisId: config.explicitSourceAnalysisId,
        historyOrderPin: {
            analysisId: pin.analysisId,
            listCreatedAtIso: pin.listCreatedAtIso,
            firstPageSortType: pin.firstPageSortType,
            selectionIndex: pin.selectionIndex,
            rowCount: pin.rowCount,
        },
        deletionTargetAnalysisId: config.deletionMode !== 'off' ? pin.analysisId : null,
        deletionTargetListCreatedAtIso: config.deletionMode !== 'off' ? pin.listCreatedAtIso : null,
        deletionPlanId,
        accountId: catalog.accountId,
        catalogComplete: catalog.catalogComplete,
        rowCount: catalog.rows.length,
        chronologyBasis: pin.chronologyBasis,
        historyOrderVerified: true,
    };
}
