import { access } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page, type TestInfo } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../../login/existingUserLoginFlow';
import {
    resolveFullSmokePdfExecutionPlan,
    usesAuxiliaryHeadlessPdfContext,
} from '../../smoke/analysisReportFullPdfExecution';
import {
    describeComparisonPdfExecutionContextAfterSave,
    describeComparisonPdfExecutionContextPlan,
} from './comparisonReportPdfExecutionContext';
import { pdfGenerationSkipReason } from '../../reportPDF/analysisReportPdfBrowserCapability';
import {
    failEnteredComparisonFlowStages,
    ComparisonReportViewStageTracker,
} from '../comparisonReportViewStageTracker';
import { ComparisonReportViewFlowError } from '../comparisonReportViewErrors';
import { runComparisonReportViewFlow } from '../comparisonReportViewFlow';
import {
    loginAndReachCustomersForComparisonView,
    openFirstPostureAnalysisCardOnCustomer,
    openPinnedFirstCustomerFromList,
} from '../comparisonReportViewCustomerNavigation';
import { resolveComparisonReportViewSmokeTarget } from '../comparisonReportViewSmokeConfig';
import { readComparisonSlotAnalysisIds } from '../comparisonReportViewLocators';
import {
    attachComparisonReportPdfEvidence,
    logComparisonReportPdfFailed,
    logComparisonReportPdfVerified,
    type ComparisonReportPdfRunEvidence,
} from './comparisonReportPdfReporting';
import { resolveComparisonReportPdfRunContext } from './comparisonReportPdfRunContext';
import { runComparisonReportPdfFlowOnPage } from './comparisonReportPdfFlow';
import {
    ComparisonReportPdfStageTracker,
    failEnteredComparisonPdfStages,
} from './comparisonReportPdfStageTracker';
import { navigateToAuthenticatedComparisonPair } from './comparisonReportPdfSession';

const COMBINED_PDF_DEVICE_SCALE = 2;

export type RunComparisonReportPdfStandaloneOptions = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account?: { email: string; password: string };
    appOrigin?: string;
    skipPdfGenerationReason?: string | null;
};

async function pdfExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

function buildEvidenceShell(
    options: RunComparisonReportPdfStandaloneOptions,
    runContext: ReturnType<typeof resolveComparisonReportPdfRunContext>,
    skipReason: string | null
): ComparisonReportPdfRunEvidence {
    const target = resolveComparisonReportViewSmokeTarget();
    const pdfTracker = new ComparisonReportPdfStageTracker();
    if (skipReason) {
        pdfTracker.skipPdfGenerationStages();
    }
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        customerId: target.customerId,
        leftAnalysisId: null,
        rightAnalysisId: null,
        menuAction: null,
        pdfGeneration: null,
        pdfValidation: null,
        pdfGenerationSkipReason: skipReason,
        coverageLabel: 'A4 comparison PDF save and validation',
        stages: pdfTracker.toRecord(),
        failureStep: null,
    };
}

export async function runComparisonReportPdfStandalone(
    options: RunComparisonReportPdfStandaloneOptions
): Promise<{ evidence: ComparisonReportPdfRunEvidence; pdfPath: string | null; primaryError: unknown }> {
    const account = options.account ?? resolvePart2LoginAccount();
    const appOrigin = options.appOrigin ?? STG_APP_ORIGIN;
    const target = resolveComparisonReportViewSmokeTarget();
    const comparisonTracker = new ComparisonReportViewStageTracker();
    const pdfTracker = new ComparisonReportPdfStageTracker();
    const runContext = resolveComparisonReportPdfRunContext(options.testInfo);
    const skipReason =
        options.skipPdfGenerationReason ?? pdfGenerationSkipReason(options.browser);
    const evidence = buildEvidenceShell(options, runContext, skipReason);
    let primaryError: unknown = null;

    const pdfPath = path.join(
        runContext.artifactDir,
        `comparison-report-a4-${evidence.browserName}-${target.customerId}.pdf`
    );

    if (skipReason) {
        return { evidence, pdfPath: null, primaryError: null };
    }

    const primaryHeadless = options.testInfo.project.use.headless !== false;
    const pdfPlan = await resolveFullSmokePdfExecutionPlan({
        browserName: options.browser.browserType().name(),
        primaryHeadless,
        primaryPage: options.page,
    });
    evidence.pdfExecutionContext = pdfPlan.context;
    evidence.headedPagePdfSupported = pdfPlan.headedPagePdfSupported;
    evidence.pdfExecutionContextNote = describeComparisonPdfExecutionContextPlan(
        pdfPlan.context,
        pdfPlan.headedPagePdfSupported
    );

    let auxiliaryBrowser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    let capturedPair: { leftAnalysisId: string; rightAnalysisId: string } | null = null;

    try {
        pdfTracker.enter('login');
        comparisonTracker.enter('login');
        await loginAndReachCustomersForComparisonView(options.page, account);
        pdfTracker.pass('login');
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
        comparisonTracker.pass('singleReportEntry');

        pdfTracker.enter('comparisonSetup');
        await runComparisonReportViewFlow(
            options.page,
            {
                customerId: target.customerId,
                appOrigin,
                sourceSingleReportAnalysisId,
            },
            comparisonTracker
        );
        capturedPair = await readComparisonSlotAnalysisIds(options.page);
        pdfTracker.pass('comparisonSetup');

        const flowInput = {
            customerId: target.customerId,
            customerDisplayNameHint: target.expectedFirstCustomerName,
            pdfPath,
            expectedPair: capturedPair,
        };

        if (usesAuxiliaryHeadlessPdfContext(pdfPlan.context)) {
            const storageState = await options.page.context().storageState();
            auxiliaryBrowser = await chromium.launch({ headless: true });
            const auxiliaryContext = await auxiliaryBrowser.newContext({
                storageState,
                viewport: { width: 1404, height: 856 },
                deviceScaleFactor: COMBINED_PDF_DEVICE_SCALE,
            });
            const pdfPage = await auxiliaryContext.newPage();
            try {
                await navigateToAuthenticatedComparisonPair(
                    pdfPage,
                    appOrigin,
                    target.customerId,
                    capturedPair
                );
                await runComparisonReportPdfFlowOnPage(pdfPage, flowInput, pdfTracker, evidence);
            } finally {
                await auxiliaryContext.close();
            }
            pdfTracker.enter('comparisonPairPreserved');
            await readComparisonSlotAnalysisIds(options.page);
            pdfTracker.pass('comparisonPairPreserved');
        } else {
            await runComparisonReportPdfFlowOnPage(options.page, flowInput, pdfTracker, evidence);
        }
    } catch (error) {
        primaryError = error;
        if (error instanceof ComparisonReportViewFlowError && error.partialEvidence) {
            // comparison partials are orthogonal; pdf evidence remains primary
        }
        failEnteredComparisonFlowStages(comparisonTracker);
        failEnteredComparisonPdfStages(pdfTracker);
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 300) : 'comparison_pdf_standalone_failed';
    } finally {
        if (auxiliaryBrowser) {
            await auxiliaryBrowser.close();
        }
        evidence.stages = pdfTracker.toRecord();
        if (evidence.pdfExecutionContext) {
            evidence.pdfExecutionContextNote = describeComparisonPdfExecutionContextAfterSave(
                evidence.pdfExecutionContext,
                evidence.headedPagePdfSupported ?? null,
                Boolean(evidence.pdfGeneration)
            );
        }
    }

    const attachPdf = (await pdfExists(pdfPath)) ? pdfPath : null;
    return { evidence, pdfPath: attachPdf, primaryError };
}

export async function finalizeComparisonReportPdfRun(
    testInfo: TestInfo,
    evidence: ComparisonReportPdfRunEvidence,
    pdfPath: string | null,
    primaryError: unknown
): Promise<void> {
    if (primaryError) {
        logComparisonReportPdfFailed(evidence);
    } else if (!evidence.pdfGenerationSkipReason) {
        logComparisonReportPdfVerified(evidence);
    }
    await attachComparisonReportPdfEvidence(testInfo, evidence, pdfPath);
    if (primaryError) {
        throw primaryError;
    }
}