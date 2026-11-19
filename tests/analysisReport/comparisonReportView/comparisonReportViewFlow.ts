import type { Page } from '@playwright/test';
import {
    assertComparisonLeftReportSwitchApplied,
    assertComparisonReportViewReady,
    clickComparisonOpenFromSingleReport,
    readComparisonSlotAnalysisIds,
    readSingleReportAnalysisId,
    scrollComparisonViewAndAssertSectionsVisible,
    selectDifferentComparisonReportOption,
} from './comparisonReportViewLocators';
import { attachComparisonFlowErrorEvidence } from './comparisonReportViewErrors';
import {
    ComparisonReportViewStageTracker,
    failEnteredComparisonFlowStages,
} from './comparisonReportViewStageTracker';
import {
    logComparisonReportViewVerified,
    type ComparisonReportViewFlowEvidencePartial,
    type ComparisonReportViewRunEvidence,
} from './comparisonReportViewReporting';

export type RunComparisonReportViewFlowInput = {
    customerId: string;
    appOrigin?: string;
    /** Single-report id on the route before Compare; captured automatically when omitted. */
    sourceSingleReportAnalysisId?: string | null;
};

export type RunComparisonReportViewFlowResult = {
    evidence: ComparisonReportViewFlowEvidencePartial;
    tracker: ComparisonReportViewStageTracker;
};

/**
 * Reusable comparison flow: caller must already be on single Analysis Report for customerId.
 * Does not open ellipsis actions or exit comparison.
 */
export async function runComparisonReportViewFlow(
    page: Page,
    input: RunComparisonReportViewFlowInput,
    tracker: ComparisonReportViewStageTracker
): Promise<RunComparisonReportViewFlowResult> {
    const partial: ComparisonReportViewFlowEvidencePartial = {
        customerId: input.customerId,
        sourceSingleReportAnalysisId: input.sourceSingleReportAnalysisId ?? null,
        initialAnalysisId: input.sourceSingleReportAnalysisId ?? null,
        initialComparisonLeftId: null,
        initialComparisonRightId: null,
        selectedComparisonAnalysisId: null,
        sectionVisibilityFirstPass: null,
        sectionVisibilitySecondPass: null,
        failureStep: null,
    };

    try {
        if (!partial.sourceSingleReportAnalysisId) {
            partial.sourceSingleReportAnalysisId = await readSingleReportAnalysisId(page);
            partial.initialAnalysisId = partial.sourceSingleReportAnalysisId;
        }

        tracker.enter('comparisonOpen');
        await clickComparisonOpenFromSingleReport(page);
        await assertComparisonReportViewReady(page, input.customerId);
        const ids = await readComparisonSlotAnalysisIds(page);
        partial.initialComparisonLeftId = ids.leftAnalysisId;
        partial.initialComparisonRightId = ids.rightAnalysisId;
        tracker.pass('comparisonOpen');

        tracker.enter('initialScrollSections');
        partial.sectionVisibilityFirstPass = await scrollComparisonViewAndAssertSectionsVisible(page);
        tracker.pass('initialScrollSections');

        tracker.enter('reportSelectionSwitch');
        const chosenAnalysisId = await selectDifferentComparisonReportOption(page, ids);
        partial.selectedComparisonAnalysisId = chosenAnalysisId;
        await assertComparisonLeftReportSwitchApplied(
            page,
            input.customerId,
            chosenAnalysisId,
            ids.rightAnalysisId
        );
        tracker.pass('reportSelectionSwitch');

        tracker.enter('postSwitchScrollSections');
        partial.sectionVisibilitySecondPass = await scrollComparisonViewAndAssertSectionsVisible(page);
        tracker.pass('postSwitchScrollSections');

        tracker.enter('terminalComparisonView');
        await assertComparisonReportViewReady(page, input.customerId);
        tracker.pass('terminalComparisonView');
    } catch (error) {
        partial.failureStep = error instanceof Error ? error.message : String(error);
        failEnteredComparisonFlowStages(tracker);
        throw attachComparisonFlowErrorEvidence(error, partial);
    }

    return { evidence: partial, tracker };
}

export function emitComparisonReportViewVerified(
    evidence: ComparisonReportViewRunEvidence
): void {
    logComparisonReportViewVerified(evidence);
}