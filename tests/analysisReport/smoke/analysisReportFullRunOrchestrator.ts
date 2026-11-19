import type { Browser, Page, TestInfo } from '@playwright/test';
import { loginExistingUserForPart2 } from '../../login/existingUserLoginFlow';
import { runAnalysisReportViewFlow } from '../reportView/analysisReportViewFlow';
import { runAnalysisReportDisplayItemSettingsFlow } from '../displaySettings/analysisReportDisplayItemSettingsFlow';
import { runAnalysisReportShareQrOpenCloseFlow } from '../sharing/qrCode/analysisReportShareQrFlow';
import { runAnalysisReportShareEmailFlow } from '../sharing/email/analysisReportShareEmailFlow';
import { allShareEmailVerificationsPassed } from '../sharing/email/analysisReportShareEmailReporting';
import {
    applyPreflightSourceToConfig,
    resolveAnalysisReportFullSmokeConfig,
    type AnalysisReportFullSmokeConfig,
} from './analysisReportFullSmokeConfig';
import { logCombinedSmokeStage } from './analysisReportFullStageDiagnostics';
import { resolveAnalysisReportFullRunContext } from './analysisReportFullRunContext';
import { AnalysisReportFullStageTracker, deletionMustRemainNotReached } from './analysisReportFullStageTracker';
import {
    attachAnalysisReportFullEvidence,
    deriveCombinedPass,
    type AnalysisReportFullRunEvidence,
} from './analysisReportFullReporting';
import { runAnalysisReportFullPreflight, type AnalysisReportFullPreflightOptions } from './analysisReportFullPreflight';
import type { CustomerHistoryCatalogLoadResult } from '../reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { validateCombinedSmokeBeforeMutations } from './analysisReportFullConfigValidation';
import { runAnalysisReportFullPdfPhase } from './analysisReportFullPdfPhase';
import { runAnalysisReportFullHistoryPhase } from './analysisReportFullHistoryPhase';
import { runCombinedDeletionPhase, attachCombinedDeletionEvidence } from './analysisReportFullDeletionPhase';
import { assertDeletionPlanNotLegacyReconciled } from './analysisReportFullDeletionGuards';
import { loadDeletionPlan } from '../reportDeletion/analysisReportDeletionPlanLedger';
import {
    ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID,
} from './analysisReportFullSmokeConfig';
import type { AnalysisReportFullFeature } from './analysisReportFullStageTracker';

export type RunAnalysisReportFullSmokeOptions = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account: { email: string; password: string };
    appOrigin: string;
    config?: AnalysisReportFullSmokeConfig;
    /** Part 2 CIRS list handoff: reuse fetch_customer_report captured during CIRS navigation. */
    part2HandoffCatalog?: CustomerHistoryCatalogLoadResult | null;
};

const FEATURE_ORDER: readonly AnalysisReportFullFeature[] = [
    'login',
    'preflight',
    'reportView',
    'displaySettings',
    'shareQr',
    'shareEmail',
    'reportPdf',
    'reportHistory',
    'reportDeletion',
];

function skipDeletionWhenOff(tracker: AnalysisReportFullStageTracker): void {
    tracker.skip('reportDeletion', 'deletion mode off');
}

function failRemainingFeatures(_tracker: AnalysisReportFullStageTracker, from: AnalysisReportFullFeature): void {
    if (from === 'preflight') {
        return;
    }
    // Later featureStages remain "Not reached" (do not mark Skipped after an earlier failure).
}

export async function runAnalysisReportFullStandalone(
    options: RunAnalysisReportFullSmokeOptions
): Promise<{ evidence: AnalysisReportFullRunEvidence; primaryError: unknown }> {
    let config = options.config ?? resolveAnalysisReportFullSmokeConfig(options.appOrigin);

    const runContext = resolveAnalysisReportFullRunContext(options.testInfo);
    const tracker = new AnalysisReportFullStageTracker();
    const evidence: AnalysisReportFullRunEvidence = {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        sourceCustomerId: config.source.customerId,
        sourceAnalysisId: config.source.analysisId,
        deletionMode: config.deletionMode,
        featureStages: tracker.toRecord(),
        preflight: null,
        reportView: null,
        displaySettings: null,
        shareQr: null,
        shareEmail: null,
        reportPdf: null,
        reportHistory: null,
        reportDeletion: null,
        combinedPassed: false,
        failureFeature: null,
        failureStep: null,
        testmoNote:
            'JUnit exposes one testcase (analysisReportFullStandalone). Per-feature JSON attachments and featureStages map to TestMo steps manually; do not auto-submit destructive combined runs. Combined deletion coverage is UI confirmation and customer-list redirect to /customers only (not API or fresh-history absence).',
    };

    let primaryError: unknown = null;

    const fail = (feature: Parameters<typeof tracker.fail>[0], error: unknown): void => {
        primaryError = error;
        tracker.fail(feature);
        evidence.failureFeature = feature;
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : String(error);
        failRemainingFeatures(tracker, feature);
        tracker.markOpenFailed();
    };

    let persistedPlan = config.deletionPlanId ? loadDeletionPlan(config.deletionPlanId) : null;

    try {
        const startOnCirsList =
            process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST === '1' ||
            process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST === 'true';
        if (startOnCirsList) {
            tracker.skip('login', 'CIRS posture-analysis list handoff');
        } else {
            tracker.enter('login');
            await loginExistingUserForPart2(options.page, options.account);
            tracker.pass('login');
        }

        tracker.enter('preflight');
        const preflightOptions: AnalysisReportFullPreflightOptions | undefined =
            options.part2HandoffCatalog != null
                ? { preloadedCatalog: options.part2HandoffCatalog }
                : undefined;
        evidence.preflight = await runAnalysisReportFullPreflight(options.page, config, preflightOptions);
        config = applyPreflightSourceToConfig(config, evidence.preflight.sourceAnalysisId);
        evidence.sourceAnalysisId = config.source.analysisId;
        await validateCombinedSmokeBeforeMutations(config);
        if (config.embeddedDeletionPlan && evidence.preflight.deletionPlanId) {
            persistedPlan = loadDeletionPlan(evidence.preflight.deletionPlanId);
        }
        tracker.pass('preflight');
        logCombinedSmokeStage('preflight', 'exit');

        logCombinedSmokeStage('reportView', 'enter');
        tracker.enter('reportView');
        evidence.reportView = await runAnalysisReportViewFlow(options.page, config.source, {
            accountEmail: options.account.email,
            appOrigin: config.appOrigin,
        });
        tracker.pass('reportView');
        logCombinedSmokeStage('reportView', 'exit');

        logCombinedSmokeStage('displaySettings', 'enter');
        tracker.enter('displaySettings');
        evidence.displaySettings = await runAnalysisReportDisplayItemSettingsFlow(
            options.page,
            config.source.customerId,
            config.source.analysisId,
            config.appOrigin
        );
        tracker.pass('displaySettings');
        logCombinedSmokeStage('displaySettings', 'exit');

        logCombinedSmokeStage('shareQr', 'enter');
        tracker.enter('shareQr');
        evidence.shareQr = await runAnalysisReportShareQrOpenCloseFlow(
            options.page,
            config.source.customerId,
            config.source.analysisId,
            config.appOrigin
        );
        tracker.pass('shareQr');
        logCombinedSmokeStage('shareQr', 'exit');

        logCombinedSmokeStage('shareEmail', 'enter');
        tracker.enter('shareEmail');
        evidence.shareEmail = await runAnalysisReportShareEmailFlow(
            options.page,
            options.browser,
            config.source.customerId,
            config.source.analysisId,
            config.shareEmailRecipient,
            config.appOrigin,
            {
                validationMode: config.shareEmailValidationMode,
                skipPinnedNavigation: options.part2HandoffCatalog != null,
            }
        );
        if (!allShareEmailVerificationsPassed(evidence.shareEmail)) {
            throw new Error('Share-email verifications did not all pass.');
        }
        tracker.pass('shareEmail');
        logCombinedSmokeStage('shareEmail', 'exit');

        logCombinedSmokeStage('reportPdf', 'enter');
        tracker.enter('reportPdf');
        const primaryHeadless = options.testInfo.project.use.headless !== false;
        const pdfRun = await runAnalysisReportFullPdfPhase({
            page: options.page,
            browser: options.browser,
            appOrigin: config.appOrigin,
            customerId: config.source.customerId,
            analysisId: config.source.analysisId,
            customerDisplayNameHint: config.source.customerName ?? null,
            runContext,
            browserName: options.browser.browserType().name(),
            primaryHeadless,
        });
        evidence.reportPdf = pdfRun.evidence;
        if (pdfRun.primaryError) {
            throw pdfRun.primaryError;
        }
        tracker.pass('reportPdf');
        logCombinedSmokeStage('reportPdf', 'exit');

        logCombinedSmokeStage('reportHistory', 'enter');
        tracker.enter('reportHistory');
        const historyRun = await runAnalysisReportFullHistoryPhase({
            page: options.page,
            appOrigin: config.appOrigin,
            customerId: config.source.customerId,
            analysisId: config.source.analysisId,
            runContext,
            browserProject: options.testInfo.project.name,
            browserName: options.browser.browserType().name(),
            browserVersion: options.browser.version(),
        });
        evidence.reportHistory = historyRun.evidence;
        if (historyRun.primaryError) {
            throw historyRun.primaryError;
        }
        tracker.pass('reportHistory');
        logCombinedSmokeStage('reportHistory', 'exit');

        if (config.deletionMode === 'off') {
            skipDeletionWhenOff(tracker);
        } else {
            tracker.enter('reportDeletion');
            if (config.deletionMode === 'delete-once' && config.deletionPlanId) {
                assertDeletionPlanNotLegacyReconciled(config.deletionPlanId);
                const pinned = loadDeletionPlan(config.deletionPlanId);
                if (
                    evidence.preflight?.deletionTargetAnalysisId &&
                    pinned.analysisId !== evidence.preflight.deletionTargetAnalysisId
                ) {
                    throw new Error(
                        'Pinned delete-once plan no longer matches preflight history-order pin; stop without substitution.'
                    );
                }
            }
            if (config.deletionPlanId === ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID) {
                throw new Error('Legacy reconciled plan cannot be used for deletion.');
            }
            const deletion = await runCombinedDeletionPhase({
                page: options.page,
                browser: options.browser,
                testInfo: options.testInfo,
                account: options.account,
                appOrigin: config.appOrigin,
                config,
                persistedPlan,
            });
            evidence.reportDeletion = deletion.evidence;
            if (deletion.primaryError) {
                throw deletion.primaryError;
            }
            tracker.pass('reportDeletion');
        }
    } catch (error) {
        const openFeature = (
            [
                'preflight',
                'reportView',
                'displaySettings',
                'shareQr',
                'shareEmail',
                'reportPdf',
                'reportHistory',
                'reportDeletion',
            ] as const
        ).find((feature) => tracker.outcome(feature) === 'Entered');
        if (openFeature) {
            fail(openFeature, error);
        } else if (!primaryError) {
            primaryError = error;
            evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : String(error);
        }
    }

    evidence.featureStages = tracker.toRecord();
    evidence.combinedPassed = primaryError === null && deriveCombinedPass(evidence);
    if (!deletionMustRemainNotReached(tracker) && primaryError) {
        evidence.combinedPassed = false;
    }
    return { evidence, primaryError };
}

export async function finalizeAnalysisReportFullRun(
    testInfo: TestInfo,
    evidence: AnalysisReportFullRunEvidence,
    primaryError: unknown
): Promise<void> {
    await attachAnalysisReportFullEvidence(testInfo, evidence);
    if (evidence.reportDeletion) {
        await attachCombinedDeletionEvidence(testInfo, evidence.reportDeletion);
    }
    if (primaryError) {
        throw primaryError;
    }
}
