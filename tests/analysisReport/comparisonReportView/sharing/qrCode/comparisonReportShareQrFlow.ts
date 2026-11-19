import { expect, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../analysisReportTestIds';
import {
    assertComparisonReportViewReady,
    readComparisonSlotAnalysisIds,
    type ComparisonSlotAnalysisIds,
} from '../../comparisonReportViewLocators';
import {
    attachComparisonShareQrFlowErrorEvidence,
    ComparisonReportShareQrFlowError,
} from './comparisonReportShareQrErrors';
import { openComparisonReportShareQrFromActionsMenu } from './comparisonReportShareQrMenuAction';
import {
    closeAnalysisReportShareQrModalDialog,
    expectAnalysisReportShareQrCodeVisible,
    expectComparisonReportShareQrModalDialog,
} from './comparisonReportShareQrModal';
import type { ComparisonReportShareQrFlowEvidencePartial } from './comparisonReportShareQrReporting';
import {
    ComparisonReportShareQrStageTracker,
    failEnteredComparisonShareQrStages,
} from './comparisonReportShareQrStageTracker';

const ACTION_TIMEOUT_MS = 15000;

export type RunComparisonReportShareQrFromComparisonPageInput = {
    customerId: string;
};

/**
 * Reusable QR open/close on the Comparison Report View page (caller already completed comparison flow).
 */
export async function runComparisonReportShareQrOpenCloseFromComparisonPage(
    page: Page,
    input: RunComparisonReportShareQrFromComparisonPageInput,
    tracker: ComparisonReportShareQrStageTracker
): Promise<ComparisonReportShareQrFlowEvidencePartial> {
    const partial: ComparisonReportShareQrFlowEvidencePartial = {
        preQrLeftAnalysisId: null,
        preQrRightAnalysisId: null,
        postQrLeftAnalysisId: null,
        postQrRightAnalysisId: null,
        qrMenuOpened: false,
        qrDialogVisible: false,
        qrContentVisible: false,
        qrDialogClosed: false,
        comparisonPairPreserved: false,
        shareQrStages: tracker.toRecord(),
        failureStep: null,
    };

    try {
        const pairBefore = await readComparisonSlotAnalysisIds(page);
        partial.preQrLeftAnalysisId = pairBefore.leftAnalysisId;
        partial.preQrRightAnalysisId = pairBefore.rightAnalysisId;

        tracker.enter('ellipsisMenuOpen');
        await openComparisonReportShareQrFromActionsMenu(page);
        partial.qrMenuOpened = true;
        tracker.pass('ellipsisMenuOpen');

        tracker.enter('shareQrDialogVisible');
        const innerDialog = await expectComparisonReportShareQrModalDialog(page, pairBefore);
        partial.qrDialogVisible = true;
        tracker.pass('shareQrDialogVisible');

        tracker.enter('shareQrContentVisible');
        await expectAnalysisReportShareQrCodeVisible(page);
        partial.qrContentVisible = true;
        tracker.pass('shareQrContentVisible');

        tracker.enter('shareQrDialogClosed');
        await closeAnalysisReportShareQrModalDialog(innerDialog);
        const root = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareQrDialog);
        await expect(root.getByRole('dialog').locator('visible=true')).toHaveCount(0, {
            timeout: ACTION_TIMEOUT_MS,
        });
        partial.qrDialogClosed = true;
        tracker.pass('shareQrDialogClosed');

        tracker.enter('comparisonPairPreserved');
        await assertComparisonReportViewReady(page, input.customerId);
        const pairAfter = await readComparisonSlotAnalysisIds(page);
        partial.postQrLeftAnalysisId = pairAfter.leftAnalysisId;
        partial.postQrRightAnalysisId = pairAfter.rightAnalysisId;
        assertPairUnchanged(pairBefore, pairAfter);
        partial.comparisonPairPreserved = true;
        tracker.pass('comparisonPairPreserved');
    } catch (error) {
        partial.failureStep = error instanceof Error ? error.message : String(error);
        partial.shareQrStages = tracker.toRecord();
        failEnteredComparisonShareQrStages(tracker);
        partial.shareQrStages = tracker.toRecord();
        throw attachComparisonShareQrFlowErrorEvidence(error, partial);
    }

    partial.shareQrStages = tracker.toRecord();
    return partial;
}

function assertPairUnchanged(before: ComparisonSlotAnalysisIds, after: ComparisonSlotAnalysisIds): void {
    if (
        after.leftAnalysisId !== before.leftAnalysisId ||
        after.rightAnalysisId !== before.rightAnalysisId
    ) {
        throw new ComparisonReportShareQrFlowError(
            `Comparison pair changed after QR close (before ${before.leftAnalysisId}/${before.rightAnalysisId}, after ${after.leftAnalysisId}/${after.rightAnalysisId}).`
        );
    }
}