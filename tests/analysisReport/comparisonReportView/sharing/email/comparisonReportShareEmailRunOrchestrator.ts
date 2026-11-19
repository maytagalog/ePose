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
import { validateComparisonReportShareEmailEnvironment } from './comparisonReportShareEmailConfig';
import { ComparisonReportShareEmailFlowError } from './comparisonReportShareEmailErrors';
import {
    runComparisonReportShareEmailFromComparisonPage,
    type RunComparisonReportShareEmailFromComparisonPageInput,
} from './comparisonReportShareEmailFlow';
import {
    attachComparisonReportShareEmailEvidence,
    comparisonReportShareEmailEvidenceBody,
    logComparisonReportShareEmailFailed,
    logComparisonReportShareEmailVerified,
    type ComparisonReportShareEmailRunEvidence,
} from './comparisonReportShareEmailReporting';
import { resolveComparisonReportShareEmailRunContext } from './comparisonReportShareEmailRunContext';
import { ComparisonReportShareEmailStageTracker } from './comparisonReportShareEmailStageTracker';

export type RunComparisonReportShareEmailStandaloneOptions = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account?: { email: string; password: string };
    appOrigin?: string;
    skipGmailPreflight?: boolean;
    recipientEmail?: string;
    prepareGuestContext?: RunComparisonReportShareEmailFromComparisonPageInput['prepareGuestContext'];
};

function buildEvidenceShell(
    options: RunComparisonReportShareEmailStandaloneOptions,
    runContext: ReturnType<typeof resolveComparisonReportShareEmailRunContext>
): ComparisonReportShareEmailRunEvidence {
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
        preEmailLeftAnalysisId: null,
        preEmailRightAnalysisId: null,
        postEmailLeftAnalysisId: null,
        postEmailRightAnalysisId: null,
        modalRecipientVerified: false,
        sendAttemptedOnce: false,
        sendSuccessToastVerified: false,
        gmailMessageId: null,
        sharedComparisonUrlRedacted: null,
        guestComparisonVerified: false,
        guestSectionVisibility: null,
        comparisonPairPreserved: false,
        shareEmailStages: new ComparisonReportShareEmailStageTracker().toRecord(),
        failureStep: null,
    };
}

export async function runComparisonReportShareEmailStandalone(
    options: RunComparisonReportShareEmailStandaloneOptions
): Promise<{ evidence: ComparisonReportShareEmailRunEvidence; primaryError: unknown }> {
    const account = options.account ?? resolvePart2LoginAccount();
    const appOrigin = options.appOrigin ?? STG_APP_ORIGIN;
    const target = resolveComparisonReportViewSmokeTarget();
    const comparisonTracker = new ComparisonReportViewStageTracker();
    const emailTracker = new ComparisonReportShareEmailStageTracker();
    const runContext = resolveComparisonReportShareEmailRunContext(options.testInfo);
    const evidence = buildEvidenceShell(options, runContext);
    let primaryError: unknown = null;

    let recipientEmail = options.recipientEmail;
    if (!recipientEmail) {
        try {
            const validated = options.skipGmailPreflight
                ? { recipientEmail: process.env.ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT?.trim() || 'fixture-recipient@example.com' }
                : await validateComparisonReportShareEmailEnvironment();
            recipientEmail = validated.recipientEmail;
        } catch (error) {
            primaryError = error;
            evidence.failureStep = error instanceof Error ? error.message : String(error);
            return { evidence, primaryError };
        }
    }

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

        const emailPartial = await runComparisonReportShareEmailFromComparisonPage(
            options.page,
            options.browser,
            {
                customerId: target.customerId,
                recipientEmail,
                skipGmailPreflight: options.skipGmailPreflight,
                prepareGuestContext: options.prepareGuestContext,
            },
            emailTracker
        );
        Object.assign(evidence, emailPartial);
        evidence.shareEmailStages = emailTracker.toRecord();
    } catch (error) {
        primaryError = error;
        evidence.failureStep = error instanceof Error ? error.message : String(error);
        if (error instanceof ComparisonReportViewFlowError && error.partialEvidence) {
            Object.assign(evidence, error.partialEvidence);
        }
        if (error instanceof ComparisonReportShareEmailFlowError && error.partialEvidence) {
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
        evidence.shareEmailStages = emailTracker.toRecord();
    }

    return { evidence, primaryError };
}

export async function finalizeComparisonReportShareEmailRun(
    testInfo: TestInfo,
    evidence: ComparisonReportShareEmailRunEvidence,
    primaryError: unknown
): Promise<void> {
    if (primaryError) {
        logComparisonReportShareEmailFailed(evidence);
    } else {
        logComparisonReportShareEmailVerified(evidence);
    }
    await attachComparisonReportShareEmailEvidence(testInfo, evidence);
    if (primaryError) {
        throw primaryError;
    }
}

export { comparisonReportShareEmailEvidenceBody };