import type { Page } from '@playwright/test';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
    gotoAnalysisReportDetail,
} from '../reportView/analysisReportSingleReportLocators';
import { assertCustomerHistorySourceRowVisible } from '../reportHistory/analysisReportCustomerHistoryLocators';
import { assertCustomerReportHistoryListTerminal } from '../reportHistory/analysisReportHistoryListTerminal';
import { executeAnalysisReportHistoryCustomerStages } from '../reportHistory/analysisReportHistoryCustomerStages';
import { openAnalysisReportHistoryFromActionsMenu } from '../reportHistory/analysisReportHistoryMenuAction';
import type { AnalysisReportHistoryRunEvidence } from '../reportHistory/analysisReportHistoryReporting';
import {
    AnalysisReportHistoryStageTracker,
    markOpenStagesFailed,
} from '../reportHistory/analysisReportHistoryStageTracker';
import { captureAnalysisReportHistorySourceIdentity } from '../reportHistory/analysisReportHistorySourceIdentity';
import type { AnalysisReportFullRunContext } from './analysisReportFullRunContext';

export async function runAnalysisReportFullHistoryPhase(options: {
    page: Page;
    appOrigin: string;
    customerId: string;
    analysisId: string;
    runContext: AnalysisReportFullRunContext;
    browserProject: string;
    browserName: string;
    browserVersion: string;
}): Promise<{ evidence: AnalysisReportHistoryRunEvidence; primaryError: unknown }> {
    const tracker = new AnalysisReportHistoryStageTracker();
    const evidence: AnalysisReportHistoryRunEvidence = {
        runId: options.runContext.runId,
        runOutputRoot: options.runContext.runOutputRoot,
        browserProject: options.browserProject,
        browserName: options.browserName,
        browserVersion: options.browserVersion,
        customerId: options.customerId,
        analysisId: options.analysisId,
        sourceIdentity: null,
        stages: tracker.toRecord(),
        setup: {
            login: 'Skipped',
            sourceReportVerification: 'Not reached',
        },
        failureStep: null,
    };

    let primaryError: unknown = null;
    try {
        tracker.enter('sourceReportVerification');
        await gotoAnalysisReportDetail(
            options.page,
            options.appOrigin,
            options.customerId,
            options.analysisId
        );
        await assertAnalysisReportRouteIdentity(
            options.page,
            options.appOrigin,
            options.customerId,
            options.analysisId
        );
        await assertAnalysisReportReady(options.page, options.customerId, options.analysisId);
        evidence.sourceIdentity = await captureAnalysisReportHistorySourceIdentity(options.page);
        tracker.pass('sourceReportVerification');

        tracker.enter('ellipsisHistoryAction');
        await openAnalysisReportHistoryFromActionsMenu(options.page, options.customerId);
        tracker.pass('ellipsisHistoryAction');

        const customerStages = await executeAnalysisReportHistoryCustomerStages(
            options.page,
            tracker,
            options.customerId,
            options.appOrigin
        );
        if (customerStages.error) {
            throw customerStages.error;
        }

        tracker.enter('sourceRowVerification');
        await assertCustomerHistorySourceRowVisible(options.page, options.customerId, options.analysisId);
        tracker.pass('sourceRowVerification');

        tracker.enter('customerHistoryListTerminal');
        await assertCustomerReportHistoryListTerminal(
            options.page,
            options.customerId,
            options.appOrigin,
            options.analysisId
        );
        tracker.pass('customerHistoryListTerminal');
    } catch (error) {
        primaryError = error;
        markOpenStagesFailed(tracker);
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : 'history_phase_failed';
    }

    evidence.stages = tracker.toRecord();
    evidence.setup = {
        login: tracker.outcome('login'),
        sourceReportVerification: tracker.outcome('sourceReportVerification'),
    };
    return { evidence, primaryError };
}
