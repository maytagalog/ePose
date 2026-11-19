import { type Page } from '@playwright/test';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    assertGlobalAnalysisReportListRoute,
    awaitGlobalAnalysisReportListReady,
    clickAnalysisReportListRowByIdentity,
    openGlobalAnalysisReportListFromMainMenu,
} from './analysisReportAllListLocators';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
    assertPosturePhotosAndMetrics,
    assertPostureTypeLegsBalance,
    resolveExercisesStretchesStep,
    exerciseExercisesStretchesSectionHelpCycleIfVisible,
    exerciseHelpDialogCycle,
    exerciseMuscleConditionHelpCycle,
    exerciseMuscleConditionControls,
    gotoAnalysisReportDetail,
    singleReportBottomHistoryControl,
} from './analysisReportSingleReportLocators';
import {
    assertCustomerReportHistoryReady,
    assertHistoryContainsReportRow,
    clickHistoryBackToCustomerPage,
} from './analysisReportHistoryNavigation';
import { AnalysisReportViewFlowError } from './analysisReportViewErrors';
import {
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
    ANALYSIS_REPORT_AUTOMATION_GAPS,
    ANALYSIS_REPORT_TOP_HELP_DIALOG_TITLE,
} from '../analysisReportTestIds';
import {
    AnalysisReportViewRunTracker,
    type AnalysisReportViewRunEvidence,
} from './analysisReportViewReporting';

export type { AnalysisReportViewRunEvidence } from './analysisReportViewReporting';

export type AnalysisReportViewInput = {
    customerId: string;
    analysisId: string;
    customerName?: string | null;
    customerFurigana?: string | null;
};

export type RunAnalysisReportViewOptions = {
    accountEmail?: string | null;
    appOrigin?: string;
    onEvidence?: (evidence: AnalysisReportViewRunEvidence) => void;
};

export function analysisReportViewEvidenceAttachmentBody(
    payload: AnalysisReportViewRunEvidence | Record<string, unknown>
): string {
    return JSON.stringify(payload, null, 2);
}

export function resolveAnalysisReportViewFromEnv(): AnalysisReportViewInput {
    const customerId = process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID?.trim();
    const analysisId = process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID?.trim();
    if (!customerId || !analysisId) {
        throw new Error(
            'Set ANALYSIS_REPORT_VIEW_CUSTOMER_ID and ANALYSIS_REPORT_VIEW_ANALYSIS_ID for standalone Analysis Report viewing.'
        );
    }
    return {
        customerId,
        analysisId,
        customerName: process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_NAME?.trim() || null,
        customerFurigana: process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_FURIGANA?.trim() || null,
    };
}

export async function runAnalysisReportViewFlow(
    page: Page,
    input: AnalysisReportViewInput,
    options?: RunAnalysisReportViewOptions
): Promise<AnalysisReportViewRunEvidence> {
    const appOrigin = options?.appOrigin ?? STG_APP_ORIGIN;
    const tracker = new AnalysisReportViewRunTracker({ accountEmail: options?.accountEmail ?? null });
    const publish = (): void => {
        options?.onEvidence?.(tracker.toEvidence(new URL(page.url()).pathname));
    };

    tracker.logStarted(new URL(page.url()).pathname, input.customerId, input.analysisId);
    publish();

    try {
        tracker.stepStarted('starting report identity');
        await gotoAnalysisReportDetail(page, appOrigin, input.customerId, input.analysisId);
        await assertAnalysisReportRouteIdentity(page, appOrigin, input.customerId, input.analysisId);
        await assertAnalysisReportReady(page, input.customerId, input.analysisId);
        tracker.stepPassed('starting report identity');
        publish();

        tracker.stepStarted('main menu analysis report list');
        await openGlobalAnalysisReportListFromMainMenu(page);
        await assertGlobalAnalysisReportListRoute(page);
        const listOutcome = await awaitGlobalAnalysisReportListReady(page);
        if (listOutcome === 'empty') {
            throw new Error('Global analysis report list is empty; cannot select target report.');
        }
        tracker.stepPassed('main menu analysis report list');
        publish();

        tracker.stepStarted('select report from all list');
        await clickAnalysisReportListRowByIdentity(page, input.customerId, input.analysisId);
        await assertAnalysisReportRouteIdentity(page, appOrigin, input.customerId, input.analysisId);
        tracker.stepPassed('select report from all list');
        publish();

        tracker.stepStarted('single report readiness');
        const report = await assertAnalysisReportReady(page, input.customerId, input.analysisId);
        tracker.stepPassed('single report readiness');
        publish();

        tracker.stepStarted('help dialogs');
        await exerciseHelpDialogCycle(
            page,
            report,
            ANALYSIS_REPORT_SINGLE_TEST_IDS.generationRatingHelp,
            ANALYSIS_REPORT_TOP_HELP_DIALOG_TITLE.generationRating
        );
        tracker.helpDialogOutcome('generationRatingHelp', 'Passed');
        await exerciseHelpDialogCycle(
            page,
            report,
            ANALYSIS_REPORT_SINGLE_TEST_IDS.resultsHelp,
            ANALYSIS_REPORT_TOP_HELP_DIALOG_TITLE.results
        );
        tracker.helpDialogOutcome('resultsHelp', 'Passed');
        tracker.stepPassed('help dialogs');
        publish();

        tracker.stepStarted('report content sections');
        await assertPosturePhotosAndMetrics(report);
        await assertPostureTypeLegsBalance(page, report);
        tracker.helpDialogOutcome('postureTypeHelp', 'Passed');
        tracker.helpDialogOutcome('legAlignmentHelp', 'Passed');
        tracker.stepPassed('report content sections');
        publish();

        tracker.stepStarted('muscle condition controls');
        await exerciseMuscleConditionHelpCycle(page, report);
        tracker.helpDialogOutcome('muscleConditionHelp', 'Passed');
        const exercisesHelpOpened = await exerciseExercisesStretchesSectionHelpCycleIfVisible(page, report);
        if (exercisesHelpOpened) {
            tracker.helpDialogOutcome('exercisesStretchesHelp', 'Passed');
        }
        await exerciseMuscleConditionControls(report);
        tracker.stepPassed('muscle condition controls');
        publish();

        tracker.stepStarted('exercises and stretches');
        const exercisesOutcome = await resolveExercisesStretchesStep(page, report);
        if (exercisesOutcome.status === 'verified') {
            tracker.stepPassed('exercises and stretches');
        } else {
            tracker.stepSkipped('exercises and stretches', exercisesOutcome.reason);
            if (exercisesOutcome.status === 'skipped') {
                tracker.helpDialogOutcomeIfUnset('exercisesStretchesHelp', 'Skipped');
            }
        }
        publish();

        tracker.stepStarted('customer history via bottom link');
        const bottomLink = await singleReportBottomHistoryControl(page, report);
        await bottomLink.scrollIntoViewIfNeeded();
        await bottomLink.click();
        await assertCustomerReportHistoryReady(page, input.customerId);
        await assertHistoryContainsReportRow(page, input.customerId, input.analysisId);
        tracker.stepPassed('customer history via bottom link');
        publish();

        tracker.stepStarted('history back navigation');
        await clickHistoryBackToCustomerPage(
            page,
            appOrigin,
            input.customerId,
            input.customerName,
            input.customerFurigana
        );
        tracker.stepPassed('history back navigation');
        publish();

        tracker.logCompleted(new URL(page.url()).pathname);
        return tracker.toEvidence(new URL(page.url()).pathname);
    } catch (error) {
        if (tracker.lastStartedStep) {
            tracker.stepFailed(tracker.lastStartedStep);
        }
        tracker.logFailed(error, new URL(page.url()).pathname);
        publish();
        throw error;
    }
}

export const ANALYSIS_REPORT_VIEW_EVIDENCE_GAPS = ANALYSIS_REPORT_AUTOMATION_GAPS;
