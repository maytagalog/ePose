import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { resolveAnalysisReportShareEmailSmokeTarget } from '../../analysisReport/sharing/email/analysisReportShareEmailSmokeConfig';
import { playwrightPdfGenerationSupported } from '../../analysisReport/reportPDF/analysisReportPdfBrowserCapability';
import {
    ComparisonReportViewStageTracker,
    failEnteredComparisonFlowStages,
} from '../../analysisReport/comparisonReportView/comparisonReportViewStageTracker';
import {
    navigateToCustomersListForComparison,
    openCustomerFromListById,
    openFirstPostureAnalysisCardOnCustomer,
} from '../../analysisReport/comparisonReportView/comparisonReportViewCustomerNavigation';
import { readComparisonSlotAnalysisIds } from '../../analysisReport/comparisonReportView/comparisonReportViewLocators';
import { runComparisonReportViewFlow } from '../../analysisReport/comparisonReportView/comparisonReportViewFlow';
import { exitComparisonReportViewToSingleReport } from '../../analysisReport/comparisonReportView/comparisonReportViewExitFlow';
import { ComparisonReportViewExitStageTracker } from '../../analysisReport/comparisonReportView/comparisonReportViewExitStageTracker';
import { resolveComparisonReportPdfRunContext } from '../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfRunContext';
import { runComparisonReportPdfFlowOnPage } from '../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfFlow';
import type { ComparisonReportPdfRunEvidence } from '../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfReporting';
import { ComparisonReportPdfStageTracker } from '../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfStageTracker';
import { runComparisonReportShareEmailFromComparisonPage } from '../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailFlow';
import type { ComparisonReportShareEmailFlowEvidencePartial } from '../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailReporting';
import { ComparisonReportShareEmailStageTracker } from '../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailStageTracker';
import { runComparisonReportShareQrOpenCloseFromComparisonPage } from '../../analysisReport/comparisonReportView/sharing/qrCode/comparisonReportShareQrFlow';
import type { ComparisonReportShareQrFlowEvidencePartial } from '../../analysisReport/comparisonReportView/sharing/qrCode/comparisonReportShareQrReporting';
import { ComparisonReportShareQrStageTracker } from '../../analysisReport/comparisonReportView/sharing/qrCode/comparisonReportShareQrStageTracker';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    derivePart2ComparisonCombinedPass,
    type Part2ComparisonReportRunEvidence,
    type Part2ComparisonReportFeature,
    Part2ComparisonReportStageTracker,
} from './part2ComparisonReportReporting';
import { persistSmokeEvidenceJson } from './smokeEvidencePersistence';
import { logComparisonSmokeStage } from '../../analysisReport/smoke/comparisonReportFullStageDiagnostics';

export type Part2ComparisonCustomerIdentity = {
    customerId: string;
    customerName: string | null;
};

export type Part2ComparisonReportPhaseResult = {
    evidence: Part2ComparisonReportRunEvidence;
    primaryError: unknown;
};

function emptyPdfEvidence(
    runContext: ReturnType<typeof resolveComparisonReportPdfRunContext>,
    testInfo: TestInfo,
    browser: Browser,
    customerId: string
): ComparisonReportPdfRunEvidence {
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        browserProject: testInfo.project.name,
        browserName: browser.browserType().name(),
        browserVersion: browser.version(),
        customerId,
        leftAnalysisId: null,
        rightAnalysisId: null,
        menuAction: null,
        pdfGeneration: null,
        pdfValidation: null,
        pdfGenerationSkipReason: null,
        coverageLabel: 'A4 comparison PDF save and validation',
        stages: new ComparisonReportPdfStageTracker().toRecord(),
        failureStep: null,
    };
}

export async function runPart2ComparisonReportPhase(options: {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    identity: Part2ComparisonCustomerIdentity;
    appOrigin?: string;
}): Promise<Part2ComparisonReportPhaseResult> {
    const appOrigin = options.appOrigin ?? STG_APP_ORIGIN;
    const comparisonTracker = new ComparisonReportViewStageTracker();
    const phaseTracker = new Part2ComparisonReportStageTracker();
    const runContext = resolveComparisonReportPdfRunContext(options.testInfo);
    mkdirSync(runContext.runOutputRoot, { recursive: true });

    const evidence: Part2ComparisonReportRunEvidence = {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        customerId: options.identity.customerId,
        customerDisplayNameHint: options.identity.customerName,
        sourceSingleReportAnalysisId: null,
        selectedComparisonAnalysisId: null,
        comparisonPairLeftId: null,
        comparisonPairRightId: null,
        returnedSingleReportAnalysisId: null,
        comparisonViewStages: comparisonTracker.toRecord(),
        shareQr: null,
        shareEmail: null,
        reportPdf: null,
        exitComparison: null,
        featureStages: phaseTracker.toRecord(),
        combinedPassed: false,
        failureFeature: null,
        failureStep: null,
    };

    let primaryError: unknown = null;
    let pairAfterView: { leftAnalysisId: string; rightAnalysisId: string } | null = null;

    const fail = (feature: Part2ComparisonReportFeature, error: unknown): void => {
        primaryError = error;
        phaseTracker.fail(feature);
        evidence.failureFeature = feature;
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : String(error);
    };

    try {
        phaseTracker.enter('customersNavigation');
        logComparisonSmokeStage('customersNavigation', 'enter');
        comparisonTracker.enter('customerNavigation');
        await navigateToCustomersListForComparison(options.page, appOrigin);
        await openCustomerFromListById(options.page, options.identity.customerId);
        comparisonTracker.pass('customerNavigation');
        phaseTracker.pass('customersNavigation');
        logComparisonSmokeStage('customersNavigation', 'exit');

        phaseTracker.enter('singleReportEntry');
        logComparisonSmokeStage('singleReportEntry', 'enter');
        comparisonTracker.enter('singleReportEntry');
        const sourceSingleReportAnalysisId = await openFirstPostureAnalysisCardOnCustomer(
            options.page,
            options.identity.customerId,
            appOrigin
        );
        evidence.sourceSingleReportAnalysisId = sourceSingleReportAnalysisId;
        comparisonTracker.pass('singleReportEntry');
        phaseTracker.pass('singleReportEntry');
        logComparisonSmokeStage('singleReportEntry', 'exit');

        phaseTracker.enter('comparisonView');
        logComparisonSmokeStage('comparisonView', 'enter');
        const viewFlow = await runComparisonReportViewFlow(
            options.page,
            {
                customerId: options.identity.customerId,
                appOrigin,
                sourceSingleReportAnalysisId,
            },
            comparisonTracker
        );
        evidence.selectedComparisonAnalysisId =
            viewFlow.evidence.selectedComparisonAnalysisId ?? null;
        pairAfterView = await readComparisonSlotAnalysisIds(options.page);
        evidence.comparisonPairLeftId = pairAfterView.leftAnalysisId;
        evidence.comparisonPairRightId = pairAfterView.rightAnalysisId;
        evidence.comparisonViewStages = comparisonTracker.toRecord();
        phaseTracker.pass('comparisonView');
        logComparisonSmokeStage('comparisonView', 'exit');

        const qrTracker = new ComparisonReportShareQrStageTracker();
        phaseTracker.enter('comparisonShareQr');
        logComparisonSmokeStage('comparisonShareQr', 'enter');
        const qrPartial = await runComparisonReportShareQrOpenCloseFromComparisonPage(
            options.page,
            { customerId: options.identity.customerId },
            qrTracker
        );
        evidence.shareQr = { ...qrPartial, shareQrStages: qrTracker.toRecord() };
        phaseTracker.pass('comparisonShareQr');
        logComparisonSmokeStage('comparisonShareQr', 'exit');

        const emailTracker = new ComparisonReportShareEmailStageTracker();
        const recipient = resolveAnalysisReportShareEmailSmokeTarget().recipientEmail;
        phaseTracker.enter('comparisonShareEmail');
        logComparisonSmokeStage('comparisonShareEmail', 'enter');
        const emailPartial = await runComparisonReportShareEmailFromComparisonPage(
            options.page,
            options.browser,
            {
                customerId: options.identity.customerId,
                recipientEmail: recipient,
                validationMode: 'ui-send-confirmation',
            },
            emailTracker
        );
        evidence.shareEmail = {
            ...emailPartial,
            shareEmailStages: emailTracker.toRecord(),
        } satisfies ComparisonReportShareEmailFlowEvidencePartial;
        phaseTracker.pass('comparisonShareEmail');
        logComparisonSmokeStage('comparisonShareEmail', 'exit');

        const pdfTracker = new ComparisonReportPdfStageTracker();
        const pdfEvidence = emptyPdfEvidence(runContext, options.testInfo, options.browser, options.identity.customerId);
        phaseTracker.enter('comparisonReportPdf');
        logComparisonSmokeStage('comparisonReportPdf', 'enter');
        if (!playwrightPdfGenerationSupported(options.browser)) {
            pdfEvidence.pdfGenerationSkipReason = `Browser ${options.browser.browserType().name()} cannot save PDF`;
            pdfTracker.skip('a4PdfSave');
            evidence.reportPdf = { ...pdfEvidence, stages: pdfTracker.toRecord() };
            throw new Error(pdfEvidence.pdfGenerationSkipReason);
        }
        const pdfPath = path.join(runContext.runOutputRoot, 'comparison-a4.pdf');
        if (!pairAfterView) {
            throw new Error('Comparison pair missing before PDF save.');
        }
        const expectedPair = pairAfterView;
        await runComparisonReportPdfFlowOnPage(
            options.page,
            {
                customerId: options.identity.customerId,
                customerDisplayNameHint: options.identity.customerName,
                pdfPath,
                expectedPair,
            },
            pdfTracker,
            pdfEvidence
        );
        evidence.reportPdf = { ...pdfEvidence, stages: pdfTracker.toRecord() };
        phaseTracker.pass('comparisonReportPdf');
        logComparisonSmokeStage('comparisonReportPdf', 'exit');

        const exitTracker = new ComparisonReportViewExitStageTracker();
        phaseTracker.enter('exitComparison');
        logComparisonSmokeStage('exitComparison', 'enter');
        const exitResult = await exitComparisonReportViewToSingleReport(
            options.page,
            appOrigin,
            options.identity.customerId,
            exitTracker
        );
        evidence.exitComparison = exitResult;
        evidence.returnedSingleReportAnalysisId = exitResult.returnedAnalysisId;
        phaseTracker.pass('exitComparison');
        logComparisonSmokeStage('exitComparison', 'exit');
    } catch (error) {
        failEnteredComparisonFlowStages(comparisonTracker);
        evidence.comparisonViewStages = comparisonTracker.toRecord();
        const open = (
            [
                'customersNavigation',
                'singleReportEntry',
                'comparisonView',
                'comparisonShareQr',
                'comparisonShareEmail',
                'comparisonReportPdf',
                'exitComparison',
            ] as const
        ).find((feature) => phaseTracker.outcome(feature) === 'Entered');
        if (open) {
            logComparisonSmokeStage(
                open,
                'fail',
                error instanceof Error ? error.message.slice(0, 200) : String(error)
            );
            fail(open, error);
        } else if (!primaryError) {
            primaryError = error;
            evidence.failureStep = error instanceof Error ? error.message.slice(0, 400) : String(error);
        }
    }

    evidence.featureStages = phaseTracker.toRecord();
    evidence.combinedPassed = primaryError === null && derivePart2ComparisonCombinedPass(evidence);
    persistSmokeEvidenceJson('part2-comparison-report-run.json', evidence);
    if (evidence.shareEmail) {
        persistSmokeEvidenceJson('part2-comparison-share-email-partial.json', evidence.shareEmail);
    }
    return { evidence, primaryError };
}