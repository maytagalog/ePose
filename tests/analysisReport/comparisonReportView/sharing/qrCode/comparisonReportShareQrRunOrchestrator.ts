import type { Browser, Page, TestInfo } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../../../login/existingUserLoginFlow';
import {
    failEnteredComparisonFlowStages,
    ComparisonReportViewStageTracker,
} from '../../comparisonReportViewStageTracker';
import { ComparisonReportViewFlowError } from '../../comparisonReportViewErrors';
import { runComparisonReportViewFlow } from '../../comparisonReportViewFlow';
import {
    loginAndReachCustomersForComparisonView,
    openFirstPostureAnalysisCardOnCustomer,
    openPinnedFirstCustomerFromList,
} from '../../comparisonReportViewCustomerNavigation';
import { resolveComparisonReportViewSmokeTarget } from '../../comparisonReportViewSmokeConfig';
import { ComparisonReportShareQrFlowError } from './comparisonReportShareQrErrors';
import { runComparisonReportShareQrOpenCloseFromComparisonPage } from './comparisonReportShareQrFlow';
import {
    attachComparisonReportShareQrEvidence,
    comparisonReportShareQrEvidenceBody,
    logComparisonReportShareQrFailed,
    logComparisonReportShareQrVerified,
    type ComparisonReportShareQrRunEvidence,
} from './comparisonReportShareQrReporting';
import { resolveComparisonReportShareQrRunContext } from './comparisonReportShareQrRunContext';
import { ComparisonReportShareQrStageTracker } from './comparisonReportShareQrStageTracker';

export type RunComparisonReportShareQrStandaloneOptions = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account?: { email: string; password: string };
    appOrigin?: string;
};

function buildEvidenceShell(
    options: RunComparisonReportShareQrStandaloneOptions,
    runContext: ReturnType<typeof resolveComparisonReportShareQrRunContext>
): ComparisonReportShareQrRunEvidence {
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
        preQrLeftAnalysisId: null,
        preQrRightAnalysisId: null,
        postQrLeftAnalysisId: null,
        postQrRightAnalysisId: null,
        qrMenuOpened: false,
        qrDialogVisible: false,
        qrContentVisible: false,
        qrDialogClosed: false,
        comparisonPairPreserved: false,
        shareQrStages: new ComparisonReportShareQrStageTracker().toRecord(),
        failureStep: null,
    };
}

export async function runComparisonReportShareQrStandalone(
    options: RunComparisonReportShareQrStandaloneOptions
): Promise<{ evidence: ComparisonReportShareQrRunEvidence; primaryError: unknown }> {
    const account = options.account ?? resolvePart2LoginAccount();
    const appOrigin = options.appOrigin ?? STG_APP_ORIGIN;
    const target = resolveComparisonReportViewSmokeTarget();
    const comparisonTracker = new ComparisonReportViewStageTracker();
    const qrTracker = new ComparisonReportShareQrStageTracker();
    const runContext = resolveComparisonReportShareQrRunContext(options.testInfo);
    const evidence = buildEvidenceShell(options, runContext);
    let primaryError: unknown = null;

    try {
        comparisonTracker.enter('login');
        await loginAndReachCustomersForComparisonView(options.page, account);
        comparisonTracker.pass('login');

        comparisonTracker.enter('customerNavigation');
        await openPinnedFirstCustomerFromList(
            options.page,
            target.expectedFirstCustomerId,
            target.expectedFirstCustomerName
        );
        comparisonTracker.pass('customerNavigation');

        comparisonTracker.enter('singleReportEntry');
        const sourceSingleReportAnalysisId = await openFirstPostureAnalysisCardOnCustomer(
            options.page,
            target.customerId,
            appOrigin
        );
        evidence.sourceSingleReportAnalysisId = sourceSingleReportAnalysisId;
        evidence.initialAnalysisId = sourceSingleReportAnalysisId;
        comparisonTracker.pass('singleReportEntry');

        const flow = await runComparisonReportViewFlow(
            options.page,
            {
                customerId: target.customerId,
                appOrigin,
                sourceSingleReportAnalysisId,
            },
            comparisonTracker
        );
        Object.assign(evidence, flow.evidence);
        evidence.stages = comparisonTracker.toRecord();

        const qrPartial = await runComparisonReportShareQrOpenCloseFromComparisonPage(
            options.page,
            { customerId: target.customerId },
            qrTracker
        );
        Object.assign(evidence, qrPartial);
        evidence.shareQrStages = qrTracker.toRecord();
    } catch (error) {
        primaryError = error;
        evidence.failureStep = error instanceof Error ? error.message : String(error);
        if (error instanceof ComparisonReportViewFlowError && error.partialEvidence) {
            Object.assign(evidence, error.partialEvidence);
        }
        if (error instanceof ComparisonReportShareQrFlowError && error.partialEvidence) {
            Object.assign(evidence, error.partialEvidence);
        }
        failEnteredComparisonFlowStages(comparisonTracker);
        const setupStages = ['login', 'customerNavigation', 'singleReportEntry'] as const;
        for (const stage of setupStages) {
            if (comparisonTracker.outcome(stage) === 'Entered') {
                comparisonTracker.fail(stage);
            }
        }
        evidence.stages = comparisonTracker.toRecord();
        evidence.shareQrStages = qrTracker.toRecord();
    }

    return { evidence, primaryError };
}

export async function finalizeComparisonReportShareQrRun(
    testInfo: TestInfo,
    evidence: ComparisonReportShareQrRunEvidence,
    primaryError: unknown
): Promise<void> {
    if (primaryError) {
        logComparisonReportShareQrFailed(evidence);
    } else {
        logComparisonReportShareQrVerified(evidence);
    }
    await attachComparisonReportShareQrEvidence(testInfo, evidence);
    if (primaryError) {
        throw primaryError;
    }
}

export { comparisonReportShareQrEvidenceBody };