import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { collectReportPdfContentExpectations } from '../reportPDF/analysisReportPdfContentExpectations';
import { generateAnalysisReportA4Pdf } from '../reportPDF/analysisReportPdfGeneration';
import { executeAnalysisReportPrintMenuAction } from '../reportPDF/analysisReportPrintMenuAction';
import type { AnalysisReportPdfRunEvidence } from '../reportPDF/analysisReportPdfReporting';
import { AnalysisReportPdfStageTracker } from '../reportPDF/analysisReportPdfStageTracker';
import { navigateToAuthenticatedAnalysisReport } from '../reportPDF/analysisReportPdfSession';
import { analyzeAnalysisReportPdfFile, validateAnalysisReportPdfFile } from '../reportPDF/analysisReportPdfValidation';
import type { AnalysisReportFullRunContext } from './analysisReportFullRunContext';
import {
    describePdfExecutionContextForEvidence,
    resolveFullSmokePdfExecutionPlan,
    usesAuxiliaryHeadlessPdfContext,
} from './analysisReportFullPdfExecution';

const COMBINED_PDF_VIEWPORT = { width: 1404, height: 856 } as const;
const COMBINED_PDF_DEVICE_SCALE = 2;

async function runAnalysisReportFullPdfFlowOnPage(options: {
    page: Page;
    appOrigin: string;
    customerId: string;
    analysisId: string;
    customerDisplayNameHint: string | null;
    pdfPath: string;
    tracker: AnalysisReportPdfStageTracker;
    evidence: AnalysisReportPdfRunEvidence;
}): Promise<Awaited<ReturnType<typeof collectReportPdfContentExpectations>>> {
    const { tracker } = options;
    tracker.skip('login');
    tracker.enter('navigation');
    await navigateToAuthenticatedAnalysisReport(
        options.page,
        options.appOrigin,
        options.customerId,
        options.analysisId
    );
    tracker.pass('navigation');

    tracker.enter('contentExpectations');
    const contentExpectation = await collectReportPdfContentExpectations(
        options.page,
        options.customerDisplayNameHint
    );
    tracker.pass('contentExpectations');

    tracker.enter('applicationPrintMenuAction');
    const menuResult = await executeAnalysisReportPrintMenuAction(
        options.page,
        options.appOrigin,
        options.customerId,
        options.analysisId
    );
    options.evidence.menuAction = menuResult.evidence;
    if (menuResult.error) {
        tracker.fail('applicationPrintMenuAction');
        throw menuResult.error;
    }
    tracker.pass('applicationPrintMenuAction');

    tracker.enter('a4PdfGeneration');
    options.evidence.pdfGeneration = await generateAnalysisReportA4Pdf(options.page, {
        outputPath: options.pdfPath,
    });
    tracker.pass('a4PdfGeneration');

    tracker.enter('savedPdfFileValidation');
    options.evidence.pdfValidation = await validateAnalysisReportPdfFile(options.pdfPath, contentExpectation);
    tracker.pass('savedPdfFileValidation');
    tracker.enter('pdfContentVerification');
    tracker.pass('pdfContentVerification');
    expect(options.evidence.pdfValidation?.contentVerificationPassed).toBe(true);
    return contentExpectation;
}

export async function runAnalysisReportFullPdfPhase(options: {
    page: Page;
    browser: Browser;
    appOrigin: string;
    customerId: string;
    analysisId: string;
    customerDisplayNameHint: string | null;
    runContext: AnalysisReportFullRunContext;
    browserName: string;
    primaryHeadless: boolean;
}): Promise<{ evidence: AnalysisReportPdfRunEvidence; primaryError: unknown }> {
    const pdfPlan = await resolveFullSmokePdfExecutionPlan({
        browserName: options.browserName,
        primaryHeadless: options.primaryHeadless,
        primaryPage: options.page,
    });
    const executionContext = pdfPlan.context;

    const tracker = new AnalysisReportPdfStageTracker();
    const evidence: AnalysisReportPdfRunEvidence = {
        runId: options.runContext.runId,
        runOutputRoot: options.runContext.runOutputRoot,
        browserProject: 'combined',
        browserName: options.browserName,
        browserVersion: '',
        customerId: options.customerId,
        analysisId: options.analysisId,
        pdfExecutionContext: executionContext,
        headedPagePdfSupported: pdfPlan.headedPagePdfSupported,
        pdfExecutionContextNote: describePdfExecutionContextForEvidence(
            executionContext,
            pdfPlan.headedPagePdfSupported
        ),
        menuAction: null,
        pdfGeneration: null,
        pdfValidation: null,
        pdfGenerationSkipReason: null,
        coverageLabel: 'A4 PDF generation and validation',
        setup: tracker.toSetupRecord(),
        verification: tracker.toVerificationRecord(),
        stages: tracker.toRecord(),
        failureStep: null,
    };

    const artifactDir = path.join(options.runContext.runOutputRoot, 'pdf');
    mkdirSync(artifactDir, { recursive: true });
    const pdfPath = path.join(artifactDir, `analysis-report-a4-${options.analysisId}.pdf`);
    let primaryError: unknown = null;
    let auxiliaryBrowser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    let contentExpectation: Awaited<ReturnType<typeof collectReportPdfContentExpectations>> | null = null;

    try {
        if (usesAuxiliaryHeadlessPdfContext(executionContext)) {
            const storageState = await options.page.context().storageState();
            auxiliaryBrowser = await chromium.launch({ headless: true });
            const auxiliaryContext = await auxiliaryBrowser.newContext({
                storageState,
                viewport: COMBINED_PDF_VIEWPORT,
                deviceScaleFactor: COMBINED_PDF_DEVICE_SCALE,
            });
            const pdfPage = await auxiliaryContext.newPage();
            try {
                contentExpectation = await runAnalysisReportFullPdfFlowOnPage({
                    page: pdfPage,
                    appOrigin: options.appOrigin,
                    customerId: options.customerId,
                    analysisId: options.analysisId,
                    customerDisplayNameHint: options.customerDisplayNameHint,
                    pdfPath,
                    tracker,
                    evidence,
                });
            } finally {
                await auxiliaryContext.close();
            }
        } else {
            contentExpectation = await runAnalysisReportFullPdfFlowOnPage({
                page: options.page,
                appOrigin: options.appOrigin,
                customerId: options.customerId,
                analysisId: options.analysisId,
                customerDisplayNameHint: options.customerDisplayNameHint,
                pdfPath,
                tracker,
                evidence,
            });
        }
    } catch (error) {
        primaryError = error;
        for (const stage of Object.keys(tracker.toRecord()) as Array<keyof ReturnType<typeof tracker.toRecord>>) {
            if (tracker.outcome(stage) === 'Entered') {
                tracker.fail(stage);
            }
        }
        if (contentExpectation) {
            try {
                evidence.pdfValidation =
                    evidence.pdfValidation ??
                    (await analyzeAnalysisReportPdfFile(pdfPath, contentExpectation));
            } catch {
                void error;
            }
        }
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 300) : 'pdf_phase_failed';
    } finally {
        if (auxiliaryBrowser) {
            await auxiliaryBrowser.close();
        }
    }

    evidence.setup = tracker.toSetupRecord();
    evidence.verification = tracker.toVerificationRecord();
    evidence.stages = tracker.toRecord();
    return { evidence, primaryError };
}
