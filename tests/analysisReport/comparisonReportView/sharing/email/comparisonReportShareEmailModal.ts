import { expect, type Locator, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_DIALOG_TITLE,
    ANALYSIS_REPORT_SHARE_EMAIL_SUCCESS_TOAST,
    ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../../../analysisReportTestIds';
import type { ComparisonSlotAnalysisIds } from '../../comparisonReportViewLocators';
import {
    analysisReportShareEmailDialogRoot,
    assertShareEmailModalDisplaysRecipient,
    analysisReportShareEmailSubmitButton,
} from '../../../sharing/email/analysisReportShareEmailModal';

const ACTION_TIMEOUT_MS = 15000;

export async function expectComparisonReportShareEmailModalDialog(
    page: Page,
    expectedPair: ComparisonSlotAnalysisIds
): Promise<Locator> {
    const root = analysisReportShareEmailDialogRoot(page);
    const dialogs = root.getByRole('dialog');
    await expect(dialogs).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    const inner = dialogs.first();
    await expect(inner).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(root).toHaveAttribute(
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.reportView,
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.reportViewComparison,
        { timeout: ACTION_TIMEOUT_MS }
    );
    await expect(root).toHaveAttribute(
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.leftAnalysisId,
        expectedPair.leftAnalysisId,
        { timeout: ACTION_TIMEOUT_MS }
    );
    await expect(root).toHaveAttribute(
        ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS.rightAnalysisId,
        expectedPair.rightAnalysisId,
        { timeout: ACTION_TIMEOUT_MS }
    );
    await expect(
        inner.getByText(ANALYSIS_REPORT_SHARE_EMAIL_DIALOG_TITLE, { exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return inner;
}

export async function assertComparisonShareEmailRecipient(
    innerDialog: Locator,
    recipientEmail: string
): Promise<void> {
    await assertShareEmailModalDisplaysRecipient(innerDialog, recipientEmail);
}

export function comparisonShareEmailSubmitButton(innerDialog: Locator): Locator {
    return analysisReportShareEmailSubmitButton(innerDialog);
}

export async function assertComparisonShareEmailSuccessToast(page: Page): Promise<void> {
    const success = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailSuccess);
    await expect(success).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(success).toContainText(ANALYSIS_REPORT_SHARE_EMAIL_SUCCESS_TOAST);
}