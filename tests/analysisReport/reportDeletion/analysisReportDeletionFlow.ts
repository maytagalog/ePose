import { expect, type Page } from '@playwright/test';
import { clickCustomerHistoryReportRowByIdentity } from '../reportHistory/analysisReportCustomerHistoryLocators';
import { gotoCustomerReportHistoryList } from './analysisReportDeletionNavigation';
import {
    assertAnalysisReportDeleteDialogVisible,
    openAnalysisReportDeleteFromActionsMenu,
} from './analysisReportDeletionMenuAction';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../analysisReportTestIds';
import type { AnalysisReportDeletionPlan } from './analysisReportDeletionPlanLedger';
import { assertDeletionReportIdentity } from './analysisReportDeletionTargetValidation';
import { assertHistoryRowPresent } from './analysisReportDeletionHistoryCatalog';
import {
    assertDeleteResponseSuccess,
    beginAnalysisReportDeleteRequestGuard,
    beginAnalysisReportDeleteResponseCapture,
    type DeleteRequestGuardInstallDiagnostics,
    resolveLiveDeletionRequestUrl,
} from './analysisReportDeletionRequest';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import {
    VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH,
    VERIFIED_DELETE_TOAST_SUCCESS_JA,
} from './analysisReportStagingContracts';
import { isDeletionFixtureOrigin } from './analysisReportDeletionFixtureMode';
import {
    ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_API_URL,
    ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_SUCCESS_TEST_ID,
} from './analysisReportDeletionFixtureContracts';
import type { AnalysisReportDeletionFlowStage } from './analysisReportDeletionStageTracker';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

export type AnalysisReportDeletionCancelHooks = {
    onStageEnter?: (stage: AnalysisReportDeletionFlowStage) => void;
    onStagePass?: (stage: AnalysisReportDeletionFlowStage) => void;
};

export type AnalysisReportDeletionOnceHooks = {
    onBeforeDestructiveSubmit?: () => void;
    onDeleteRequestGuardInstalled?: (diagnostics: DeleteRequestGuardInstallDiagnostics) => void;
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

export async function executeAnalysisReportDeletionCancelFlow(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan,
    deleteApiUrl: string | null,
    hooks?: AnalysisReportDeletionCancelHooks
): Promise<void> {
    const requestUrl = isDeletionFixtureOrigin(page.url())
        ? ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_API_URL
        : resolveLiveDeletionRequestUrl(deleteApiUrl);
    let deleteSeen = false;
    const onRequest = (request: import('@playwright/test').Request) => {
        if (request.method() === 'POST' && request.url().includes(requestUrl)) {
            deleteSeen = true;
        }
    };
    page.on('request', onRequest);

    hooks?.onStageEnter?.('reportIdentity');
    await clickCustomerHistoryReportRowByIdentity(page, plan.customerId, plan.analysisId);
    await assertDeletionReportIdentity(page, appOrigin, plan);
    hooks?.onStagePass?.('reportIdentity');
    hooks?.onStageEnter?.('deleteConfirmationDialog');
    await openAnalysisReportDeleteFromActionsMenu(page);
    const dialog = await assertAnalysisReportDeleteDialogVisible(page, plan.analysisId);
    hooks?.onStagePass?.('deleteConfirmationDialog');
    hooks?.onStageEnter?.('cancellationVerification');
    await clickDeleteCancel(dialog);
    await assertDeletionReportIdentity(page, appOrigin, plan);
    hooks?.onStagePass?.('cancellationVerification');

    page.off('request', onRequest);
    if (deleteSeen) {
        throw new AnalysisReportDeletionFlowError('Cancel flow observed a delete API request.');
    }

    await gotoCustomerReportHistoryList(page, appOrigin, plan.customerId);
    await assertHistoryRowPresent(page, plan.customerId, plan.analysisId);
}

export async function executeAnalysisReportDeletionOnce(
    page: Page,
    appOrigin: string,
    plan: AnalysisReportDeletionPlan,
    deleteApiUrl: string | null,
    hooks?: AnalysisReportDeletionOnceHooks
): Promise<void> {
    const requestUrl = isDeletionFixtureOrigin(page.url())
        ? ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_API_URL
        : resolveLiveDeletionRequestUrl(deleteApiUrl);
    const deleteRequestGuard = await beginAnalysisReportDeleteRequestGuard(page, plan, requestUrl);
    hooks?.onDeleteRequestGuardInstalled?.(deleteRequestGuard.installDiagnostics());

    hooks?.onStageEnter?.('reportIdentity');
    await clickCustomerHistoryReportRowByIdentity(page, plan.customerId, plan.analysisId);
    await assertDeletionReportIdentity(page, appOrigin, plan);
    hooks?.onStagePass?.('reportIdentity');

    hooks?.onStageEnter?.('deleteConfirmationDialog');
    await openAnalysisReportDeleteFromActionsMenu(page);
    const dialog = await assertAnalysisReportDeleteDialogVisible(page, plan.analysisId);
    hooks?.onStagePass?.('deleteConfirmationDialog');

    const responsePromise = beginAnalysisReportDeleteResponseCapture(page, plan, requestUrl);
    hooks?.onBeforeDestructiveSubmit?.();
    hooks?.onStageEnter?.('deletionSubmission');
    const confirm = dialog
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.deleteConfirm)
        .locator('visible=true');
    try {
        await confirm.click({ timeout: ACTION_TIMEOUT_MS });
        await deleteRequestGuard.awaitFirstAllowedDeleteRequest();
        hooks?.onStagePass?.('deletionSubmission');

        const response = await responsePromise;
        hooks?.onStageEnter?.('apiResult');
        await assertDeleteResponseSuccess(response);
        hooks?.onStagePass?.('apiResult');

        const guardViolation = deleteRequestGuard.consumeViolation();
        if (guardViolation) {
            throw guardViolation;
        }
    } finally {
        await deleteRequestGuard.dispose();
    }

    const guardViolationAfterDispose = deleteRequestGuard.consumeViolation();
    if (guardViolationAfterDispose) {
        throw guardViolationAfterDispose;
    }

    hooks?.onStageEnter?.('successUiNavigation');
    if (isDeletionFixtureOrigin(page.url())) {
        await expect(
            page.getByTestId(ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_SUCCESS_TEST_ID).locator('visible=true')
        ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await gotoCustomerReportHistoryList(page, appOrigin, plan.customerId);
    } else {
        await expect(page.getByText(VERIFIED_DELETE_TOAST_SUCCESS_JA, { exact: true })).toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(page).toHaveURL(new RegExp(`${VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH}/?$`), {
            timeout: NAVIGATION_TIMEOUT_MS,
        });
        await gotoCustomerReportHistoryList(page, appOrigin, plan.customerId);
    }
    hooks?.onStagePass?.('successUiNavigation');
}
