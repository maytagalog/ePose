import { expect, type Locator, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../analysisReportTestIds';

const ACTION_TIMEOUT_MS = 15000;

/**
 * Ant Design: data-testid marks ant-modal-root; visible modal is a descendant role="dialog".
 * The root may have no visible bounding box while the dialog is shown (trace 20261106-145005).
 */
export function analysisReportDisplaySettingsDialogRoot(page: Page): Locator {
    return page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsDialog);
}

/**
 * Assert exactly one descendant dialog and return it for toggle / Save / Cancel / visibility.
 */
export async function expectAnalysisReportDisplaySettingsModalDialog(page: Page): Promise<Locator> {
    const root = analysisReportDisplaySettingsDialogRoot(page);
    const dialogs = root.getByRole('dialog');
    await expect(dialogs).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    const inner = dialogs.first();
    await expect(inner).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return inner;
}
