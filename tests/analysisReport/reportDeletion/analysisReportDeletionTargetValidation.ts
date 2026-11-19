import type { Page } from '@playwright/test';
import type { AnalysisReportDeletionPlan } from './analysisReportDeletionPlanLedger';
import {
    collectMeasuredCustomerHistory,
    enrichCustomerHistoryWithMeasuredAt,
} from './analysisReportDeletionMeasuredAtCatalog';
import {
    loadCustomerHistoryCatalogFromNetwork,
    type CustomerHistoryCatalogResult,
} from './analysisReportCustomerHistoryApiCatalog';
import { selectOldestFromMeasuredRows } from './analysisReportDeletionOldestSelection';
import { AnalysisReportDeletionPlanError, AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import {
    assertAnalysisReportRouteIdentity,
    assertAnalysisReportReady,
} from '../reportView/analysisReportSingleReportLocators';
import { captureAnalysisReportHistorySourceIdentity } from '../reportHistory/analysisReportHistorySourceIdentity';
import { assertHistoryRowAbsent } from './analysisReportDeletionHistoryCatalog';

export async function revalidatePinnedDeletionPlanOnHistory(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan,
    tieBreakAnalysisId: string | null
): Promise<void> {
    const catalog = await loadCustomerHistoryCatalogFromNetwork(page, appOrigin, plan.customerId, {
        reload: true,
    });
    const measured = await enrichCustomerHistoryWithMeasuredAt(page, appOrigin, plan.customerId, catalog);
    if (!measured.catalogComplete) {
        throw new AnalysisReportDeletionPlanError(
            'Pinned plan revalidation blocked: customer history catalog completeness unknown/incomplete.'
        );
    }
    const stillPresent = measured.rows.some((row) => row.analysisId === plan.analysisId);
    if (!stillPresent) {
        throw new AnalysisReportDeletionPlanError(
            `Pinned analysisId ${plan.analysisId} is absent from customer history; stop for review.`
        );
    }
    const oldest = selectOldestFromMeasuredRows(
        measured.rows,
        plan.accountId,
        tieBreakAnalysisId,
        measured.catalogComplete
    );
    if (oldest.analysisId !== plan.analysisId) {
        throw new AnalysisReportDeletionPlanError(
            `Pinned analysisId ${plan.analysisId} is no longer the verified earliest measured (${oldest.analysisId}); stop for review.`
        );
    }
    if (oldest.measuredAtIso !== plan.measuredAtIso) {
        throw new AnalysisReportDeletionPlanError(
            `Pinned measuredAt changed for ${plan.analysisId}; stop for review.`
        );
    }
}

export async function assertDeletionReportIdentity(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan
): Promise<void> {
    void appOrigin;
    await assertAnalysisReportRouteIdentity(page, plan.appOrigin, plan.customerId, plan.analysisId);
    await assertAnalysisReportReady(page, plan.customerId, plan.analysisId);
    const identity = await captureAnalysisReportHistorySourceIdentity(page);
    if (identity.measuredAtIso !== plan.measuredAtIso) {
        throw new AnalysisReportDeletionFlowError(
            `Opened report header measuredAt ${identity.measuredAtIso} != plan measuredAt ${plan.measuredAtIso}.`
        );
    }
}

export async function assertDeletedReportAbsentFromFreshHistory(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan
): Promise<void> {
    const catalog = await loadCustomerHistoryCatalogFromNetwork(page, appOrigin, plan.customerId, {
        reload: true,
    });
    if (!catalog.catalogComplete) {
        throw new AnalysisReportDeletionFlowError(
            'Post-delete absence check blocked: history catalog completeness not established.'
        );
    }
    await assertHistoryRowAbsent(page, plan.customerId, plan.analysisId);
}

export async function finalizeDeletionAbsenceCheck(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan
): Promise<void> {
    await assertDeletedReportAbsentFromFreshHistory(page, appOrigin, plan);
}
