import type { Browser, Page, TestInfo } from '@playwright/test';
import { loginExistingUserForPart2 } from '../../login/existingUserLoginFlow';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
    gotoAnalysisReportDetail,
} from '../reportView/analysisReportSingleReportLocators';
import { assertCustomerHistorySourceRowVisible } from './analysisReportCustomerHistoryLocators';
import { assertCustomerReportHistoryListTerminal } from './analysisReportHistoryListTerminal';
import { executeAnalysisReportHistoryCustomerStages } from './analysisReportHistoryCustomerStages';
import { openAnalysisReportHistoryFromActionsMenu } from './analysisReportHistoryMenuAction';
import {
    type AnalysisReportHistoryRunEvidence,
    attachAnalysisReportHistoryEvidence,
} from './analysisReportHistoryReporting';
import { resolveAnalysisReportHistoryRunContext } from './analysisReportHistoryRunContext';
import { captureAnalysisReportHistorySourceIdentity } from './analysisReportHistorySourceIdentity';
import {
    AnalysisReportHistoryStageTracker,
    markOpenStagesFailed,
    type AnalysisReportHistorySetupStage,
} from './analysisReportHistoryStageTracker';
import type { AnalysisReportHistorySmokeTarget } from './analysisReportHistorySmokeConfig';

export type RunAnalysisReportHistoryOptions = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account: { email: string; password: string };
    appOrigin: string;
    target: AnalysisReportHistorySmokeTarget;
};

function buildEvidence(
    options: RunAnalysisReportHistoryOptions,
    tracker: AnalysisReportHistoryStageTracker,
    runContext: ReturnType<typeof resolveAnalysisReportHistoryRunContext>
): AnalysisReportHistoryRunEvidence {
    const setup = {
        login: tracker.outcome('login'),
        sourceReportVerification: tracker.outcome('sourceReportVerification'),
    } satisfies Record<AnalysisReportHistorySetupStage, ReturnType<AnalysisReportHistoryStageTracker['outcome']>>;
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        customerId: options.target.customerId,
        analysisId: options.target.analysisId,
        sourceIdentity: null,
        stages: tracker.toRecord(),
        setup,
        failureStep: null,
    };
}

export async function runAnalysisReportHistoryStandalone(
    options: RunAnalysisReportHistoryOptions
): Promise<{ evidence: AnalysisReportHistoryRunEvidence; primaryError: unknown }> {
    const tracker = new AnalysisReportHistoryStageTracker();
    const runContext = resolveAnalysisReportHistoryRunContext(options.testInfo);
    const evidence = buildEvidence(options, tracker, runContext);
    let primaryError: unknown = null;

    try {
        tracker.enter('login');
        await loginExistingUserForPart2(options.page, options.account);
        tracker.pass('login');

        tracker.enter('sourceReportVerification');
        await gotoAnalysisReportDetail(
            options.page,
            options.appOrigin,
            options.target.customerId,
            options.target.analysisId
        );
        await assertAnalysisReportRouteIdentity(
            options.page,
            options.appOrigin,
            options.target.customerId,
            options.target.analysisId
        );
        await assertAnalysisReportReady(options.page, options.target.customerId, options.target.analysisId);
        evidence.sourceIdentity = await captureAnalysisReportHistorySourceIdentity(options.page);
        tracker.pass('sourceReportVerification');

        tracker.enter('ellipsisHistoryAction');
        await openAnalysisReportHistoryFromActionsMenu(options.page, options.target.customerId);
        tracker.pass('ellipsisHistoryAction');

        const customerStages = await executeAnalysisReportHistoryCustomerStages(
            options.page,
            tracker,
            options.target.customerId,
            options.appOrigin
        );
        if (customerStages.error) {
            throw customerStages.error;
        }

        tracker.enter('sourceRowVerification');
        await assertCustomerHistorySourceRowVisible(
            options.page,
            options.target.customerId,
            options.target.analysisId
        );
        tracker.pass('sourceRowVerification');

        tracker.enter('customerHistoryListTerminal');
        await assertCustomerReportHistoryListTerminal(
            options.page,
            options.target.customerId,
            options.appOrigin,
            options.target.analysisId
        );
        tracker.pass('customerHistoryListTerminal');
    } catch (error) {
        primaryError = error;
        markOpenStagesFailed(tracker);
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : 'history_run_failed';
    }

    evidence.stages = tracker.toRecord();
    evidence.setup = {
        login: tracker.outcome('login'),
        sourceReportVerification: tracker.outcome('sourceReportVerification'),
    };

    return { evidence, primaryError };
}

export async function finalizeAnalysisReportHistoryRun(
    testInfo: TestInfo,
    evidence: AnalysisReportHistoryRunEvidence,
    primaryError: unknown
): Promise<void> {
    let attachError: unknown = null;
    try {
        await attachAnalysisReportHistoryEvidence(testInfo, evidence);
    } catch (error) {
        attachError = error;
        console.warn('Failed to attach analysis-report-history evidence:', error);
    }
    if (primaryError) {
        throw primaryError;
    }
    if (attachError) {
        throw attachError;
    }
}
