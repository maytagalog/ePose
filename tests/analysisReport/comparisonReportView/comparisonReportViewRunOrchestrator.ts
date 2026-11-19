import type { Browser, Page, TestInfo } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    attachComparisonReportViewEvidence,
    comparisonReportViewEvidenceBody,
    logComparisonReportViewFailed,
    logComparisonReportViewVerified,
    type ComparisonReportViewRunEvidence,
} from './comparisonReportViewReporting';
import { resolveComparisonReportViewRunContext } from './comparisonReportViewRunContext';
import {
    loginAndReachCustomersForComparisonView,
    openFirstPostureAnalysisCardOnCustomer,
    openPinnedFirstCustomerFromList,
} from './comparisonReportViewCustomerNavigation';
import {
    ComparisonReportViewStageTracker,
    failEnteredComparisonFlowStages,
} from './comparisonReportViewStageTracker';
import { ComparisonReportViewFlowError } from './comparisonReportViewErrors';
import { runComparisonReportViewFlow } from './comparisonReportViewFlow';
import { resolveComparisonReportViewSmokeTarget } from './comparisonReportViewSmokeConfig';

export type RunComparisonReportViewStandaloneOptions = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account?: { email: string; password: string };
    appOrigin?: string;
};

function buildEvidenceShell(
    options: RunComparisonReportViewStandaloneOptions,
    runContext: ReturnType<typeof resolveComparisonReportViewRunContext>
): ComparisonReportViewRunEvidence {
    const target = resolveComparisonReportViewSmokeTarget();
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        customerId: target.customerId,
        sourceSingleReportAnalysisId: null,
        initialAnalysisId: null,
        initialComparisonLeftId: null,
        initialComparisonRightId: null,
        selectedComparisonAnalysisId: null,
        sectionVisibilityFirstPass: null,
        sectionVisibilitySecondPass: null,
        stages: new ComparisonReportViewStageTracker().toRecord(),
        failureStep: null,
    };
}

export async function runComparisonReportViewStandalone(
    options: RunComparisonReportViewStandaloneOptions
): Promise<{ evidence: ComparisonReportViewRunEvidence; primaryError: unknown }> {
    const account = options.account ?? resolvePart2LoginAccount();
    const appOrigin = options.appOrigin ?? STG_APP_ORIGIN;
    const target = resolveComparisonReportViewSmokeTarget();
    const tracker = new ComparisonReportViewStageTracker();
    const runContext = resolveComparisonReportViewRunContext(options.testInfo);
    const evidence = buildEvidenceShell(options, runContext);
    let primaryError: unknown = null;

    try {
        tracker.enter('login');
        await loginAndReachCustomersForComparisonView(options.page, account);
        tracker.pass('login');

        tracker.enter('customerNavigation');
        await openPinnedFirstCustomerFromList(
            options.page,
            target.expectedFirstCustomerId,
            target.expectedFirstCustomerName
        );
        tracker.pass('customerNavigation');

        tracker.enter('singleReportEntry');
        const sourceSingleReportAnalysisId = await openFirstPostureAnalysisCardOnCustomer(
            options.page,
            target.customerId,
            appOrigin
        );
        evidence.sourceSingleReportAnalysisId = sourceSingleReportAnalysisId;
        evidence.initialAnalysisId = sourceSingleReportAnalysisId;
        tracker.pass('singleReportEntry');

        const flow = await runComparisonReportViewFlow(
            options.page,
            {
                customerId: target.customerId,
                appOrigin,
                sourceSingleReportAnalysisId,
            },
            tracker
        );
        Object.assign(evidence, flow.evidence);
        evidence.stages = tracker.toRecord();
    } catch (error) {
        primaryError = error;
        evidence.failureStep = error instanceof Error ? error.message : String(error);
        if (error instanceof ComparisonReportViewFlowError && error.partialEvidence) {
            Object.assign(evidence, error.partialEvidence);
        }
        failEnteredComparisonFlowStages(tracker);
        const setupStages = ['login', 'customerNavigation', 'singleReportEntry'] as const;
        for (const stage of setupStages) {
            if (tracker.outcome(stage) === 'Entered') {
                tracker.fail(stage);
            }
        }
        evidence.stages = tracker.toRecord();
    }

    return { evidence, primaryError };
}

export async function finalizeComparisonReportViewRun(
    testInfo: TestInfo,
    evidence: ComparisonReportViewRunEvidence,
    primaryError: unknown
): Promise<void> {
    if (primaryError) {
        logComparisonReportViewFailed(evidence);
    } else {
        logComparisonReportViewVerified(evidence);
    }
    await attachComparisonReportViewEvidence(testInfo, evidence);
    if (primaryError) {
        throw primaryError;
    }
}

export { comparisonReportViewEvidenceBody };