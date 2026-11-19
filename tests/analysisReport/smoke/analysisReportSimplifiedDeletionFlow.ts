import { expect, type Page } from '@playwright/test';
import { clickCustomerHistoryReportRowByIdentity } from '../reportHistory/analysisReportCustomerHistoryLocators';
import {
    assertAnalysisReportDeleteDialogVisible,
    openAnalysisReportDeleteFromActionsMenu,
} from '../reportDeletion/analysisReportDeletionMenuAction';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../analysisReportTestIds';
import type { AnalysisReportDeletionPlan } from '../reportDeletion/analysisReportDeletionPlanLedger';
import { assertAnalysisReportRouteIdentity } from '../reportView/analysisReportSingleReportLocators';
import { AnalysisReportDeletionFlowError } from '../reportDeletion/analysisReportDeletionErrors';
import {
    VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH,
    VERIFIED_DELETE_TOAST_SUCCESS_JA,
} from '../reportDeletion/analysisReportStagingContracts';
import { assertHistoryOrderNewestRowMatchesPin } from '../reportHistory/analysisReportHistoryNewestFirstPin';
import type { AnalysisReportDeletionFlowStage } from '../reportDeletion/analysisReportDeletionStageTracker';
import { assertCustomerListReadyForCirs } from '../../CIRS/cirsRecord/cirsRecordFlow';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

export const COMBINED_SIMPLIFIED_DELETION_COVERAGE =
    'ui-confirmation-and-customer-list-redirect' as const;

export type AnalysisReportSimplifiedDeletionHooks = {
    onBeforeDestructiveSubmit?: () => void;
    onStageEnter?: (stage: AnalysisReportDeletionFlowStage) => void;
    onStagePass?: (stage: AnalysisReportDeletionFlowStage) => void;
};

async function clickDeleteCancel(dialog: import('@playwright/test').Locator): Promise<void> {
    const cancel = dialog
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.deleteCancel)
        .locator('visible=true');
    await cancel.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}

/**
 * Staging delete success: toast, exact /customers pathname, customer list ready (no selected-customer detail).
 */
export async function assertDeleteSuccessCustomerListRedirect(page: Page, appOrigin: string): Promise<void> {
    await expect(page.getByText(VERIFIED_DELETE_TOAST_SUCCESS_JA, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });

    const origin = new URL(page.url()).origin;
    if (origin !== appOrigin) {
        throw new AnalysisReportDeletionFlowError(`After delete confirm, origin ${origin} != ${appOrigin}.`);
    }
    const pathname = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
    if (pathname !== VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH) {
        throw new AnalysisReportDeletionFlowError(
            `After delete confirm, expected pathname ${VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH}, got ${pathname}.`
        );
    }
    await expect(page).toHaveURL(new RegExp(`${VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH}/?$`), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await assertCustomerListReadyForCirs(page);
}

/** @deprecated Use assertDeleteSuccessCustomerListRedirect */
export const assertDeleteSuccessCustomerDetailsPage = assertDeleteSuccessCustomerListRedirect;

/** Re-open history newest row; fail closed if not the pinned analysis id. */
export async function openPinnedHistoryOrderNewestReport(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan,
    hooks?: Pick<AnalysisReportSimplifiedDeletionHooks, 'onStageEnter' | 'onStagePass'>
): Promise<void> {
    hooks?.onStageEnter?.('pinnedPlanValidation');
    await assertHistoryOrderNewestRowMatchesPin(page, plan.customerId, plan.analysisId);
    await clickCustomerHistoryReportRowByIdentity(page, plan.customerId, plan.analysisId);
    await assertAnalysisReportRouteIdentity(page, appOrigin, plan.customerId, plan.analysisId);
    hooks?.onStagePass?.('pinnedPlanValidation');
}

export async function executeAnalysisReportSimplifiedDeletionCancelFlow(
    page: Page,
    plan: AnalysisReportDeletionPlan,
    hooks?: AnalysisReportSimplifiedDeletionHooks
): Promise<void> {
    hooks?.onStageEnter?.('deleteConfirmationDialog');
    await openAnalysisReportDeleteFromActionsMenu(page);
    const dialog = await assertAnalysisReportDeleteDialogVisible(page, plan.analysisId);
    hooks?.onStagePass?.('deleteConfirmationDialog');

    hooks?.onStageEnter?.('cancellationVerification');
    await clickDeleteCancel(dialog);
    hooks?.onStagePass?.('cancellationVerification');
}

export async function executeAnalysisReportSimplifiedDeletionOnceFlow(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan,
    hooks?: AnalysisReportSimplifiedDeletionHooks
): Promise<void> {
    hooks?.onStageEnter?.('deleteConfirmationDialog');
    await openAnalysisReportDeleteFromActionsMenu(page);
    const dialog = await assertAnalysisReportDeleteDialogVisible(page, plan.analysisId);
    hooks?.onStagePass?.('deleteConfirmationDialog');

    hooks?.onStageEnter?.('deletionSubmission');
    hooks?.onBeforeDestructiveSubmit?.();
    const confirm = dialog
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.deleteConfirm)
        .locator('visible=true');
    await confirm.click({ timeout: ACTION_TIMEOUT_MS });
    hooks?.onStagePass?.('deletionSubmission');

    hooks?.onStageEnter?.('successUiNavigation');
    await assertDeleteSuccessCustomerListRedirect(page, appOrigin);
    hooks?.onStagePass?.('successUiNavigation');
}
