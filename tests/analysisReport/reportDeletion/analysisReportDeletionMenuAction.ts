import { expect, type Page } from '@playwright/test';
import { openAnalysisReportActionsMenu } from '../displaySettings/analysisReportDisplayItemSettingsFlow';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../analysisReportTestIds';
import {
    VERIFIED_DELETE_DIALOG_TITLE_JA,
    VERIFIED_DELETE_DIALOG_WARNING_LINES_JA,
} from './analysisReportStagingContracts';
import { isDeletionFixtureOrigin } from './analysisReportDeletionFixtureMode';

const ACTION_TIMEOUT_MS = 15000;

export async function openAnalysisReportDeleteFromActionsMenu(page: Page): Promise<void> {
    await openAnalysisReportActionsMenu(page);
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(menu).toHaveAttribute('data-report-view', 'single');
    const deleteAction = menu
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.deleteOpen)
        .locator('visible=true');
    await expect(deleteAction, 'visible Delete action in actions menu').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await deleteAction.click({ timeout: ACTION_TIMEOUT_MS });
}

export async function assertAnalysisReportDeleteDialogVisible(
    page: Page,
    analysisId: string
): Promise<import('@playwright/test').Locator> {
    const wrapper = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.deleteDialog);
    await expect(wrapper, 'exactly one analysis-report-delete-dialog wrapper').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(wrapper).toHaveAttribute('data-analysis-id', analysisId);
    const dialog = wrapper.getByRole('dialog').locator('visible=true');
    await expect(dialog, 'exactly one visible delete dialog').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(dialog).toContainText(VERIFIED_DELETE_DIALOG_TITLE_JA);
    for (const line of VERIFIED_DELETE_DIALOG_WARNING_LINES_JA) {
        await expect(dialog).toContainText(line);
    }

    if (!isDeletionFixtureOrigin(page.url())) {
        await expect(wrapper).not.toHaveAttribute('data-customer-id', /.+/);
    }

    const cancel = dialog
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.deleteCancel)
        .locator('visible=true');
    const confirm = dialog
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.deleteConfirm)
        .locator('visible=true');
    await expect(cancel).toHaveCount(1);
    await expect(confirm).toHaveCount(1);
    return dialog;
}
