import { access } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { loginExistingUserForPart2 } from '../../login/existingUserLoginFlow';
import { collectReportPdfContentExpectations } from './analysisReportPdfContentExpectations';
import { generateAnalysisReportA4Pdf } from './analysisReportPdfGeneration';
import { type AnalysisReportPdfRunEvidence, logAnalysisReportPdfEvent } from './analysisReportPdfReporting';
import { resolveAnalysisReportPdfRunContext } from './analysisReportPdfRunContext';
import { navigateToAuthenticatedAnalysisReport } from './analysisReportPdfSession';
import { executeAnalysisReportPrintMenuAction } from './analysisReportPrintMenuAction';
import { AnalysisReportPdfStageTracker, type AnalysisReportPdfStage } from './analysisReportPdfStageTracker';
import { analyzeAnalysisReportPdfFile, validateAnalysisReportPdfFile } from './analysisReportPdfValidation';

export type AnalysisReportPdfRunTarget = {
    customerId: string;
    analysisId: string;
    customerDisplayNameHint: string | null;
};

export type RunAnalysisReportPdfA4Options = {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account: { email: string; password: string };
    appOrigin: string;
    target: AnalysisReportPdfRunTarget;
    skipPdfGenerationReason: string | null;
};

function buildBaseEvidence(
    options: RunAnalysisReportPdfA4Options,
    tracker: AnalysisReportPdfStageTracker,
    runContext: ReturnType<typeof resolveAnalysisReportPdfRunContext>
): AnalysisReportPdfRunEvidence {
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        browserProject: options.testInfo.project.name,
        browserName: options.browser.browserType().name(),
        browserVersion: options.browser.version(),
        customerId: options.target.customerId,
        analysisId: options.target.analysisId,
        menuAction: null,
        pdfGeneration: null,
        pdfValidation: null,
        pdfGenerationSkipReason: options.skipPdfGenerationReason,
        coverageLabel: 'A4 PDF generation and validation',
        setup: tracker.toSetupRecord(),
        verification: tracker.toVerificationRecord(),
        stages: tracker.toRecord(),
        failureStep: null,
    };
}

function finalizeEvidence(
    evidence: AnalysisReportPdfRunEvidence,
    tracker: AnalysisReportPdfStageTracker
): void {
    evidence.setup = tracker.toSetupRecord();
    evidence.verification = tracker.toVerificationRecord();
    evidence.stages = tracker.toRecord();
}

function markOpenStagesFailed(tracker: AnalysisReportPdfStageTracker): void {
    for (const stage of Object.keys(tracker.toRecord()) as AnalysisReportPdfStage[]) {
        if (tracker.outcome(stage) === 'Entered') {
            tracker.fail(stage);
        }
    }
}

async function pdfExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function runAnalysisReportPdfMenuActionOnly(
    options: Omit<RunAnalysisReportPdfA4Options, 'skipPdfGenerationReason'>
): Promise<{ evidence: AnalysisReportPdfRunEvidence; primaryError: unknown }> {
    const tracker = new AnalysisReportPdfStageTracker();
    const runContext = resolveAnalysisReportPdfRunContext(options.testInfo);
    const evidence = buildBaseEvidence(
        { ...options, skipPdfGenerationReason: null },
        tracker,
        runContext
    );
    let primaryError: unknown = null;

    try {
        tracker.enter('login');
        await loginExistingUserForPart2(options.page, options.account);
        tracker.pass('login');

        tracker.enter('navigation');
        await navigateToAuthenticatedAnalysisReport(
            options.page,
            options.appOrigin,
            options.target.customerId,
            options.target.analysisId
        );
        tracker.pass('navigation');

        tracker.enter('applicationPrintMenuAction');
        const menuResult = await executeAnalysisReportPrintMenuAction(
            options.page,
            options.appOrigin,
            options.target.customerId,
            options.target.analysisId
        );
        evidence.menuAction = menuResult.evidence;
        if (menuResult.error) {
            tracker.fail('applicationPrintMenuAction');
            throw menuResult.error;
        }
        tracker.pass('applicationPrintMenuAction');
    } catch (error) {
        primaryError = error;
        markOpenStagesFailed(tracker);
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 300) : 'menu_action_run_failed';
    } finally {
        finalizeEvidence(evidence, tracker);
    }

    return { evidence, primaryError };
}

export async function runAnalysisReportPdfA4GenerationRun(
    options: RunAnalysisReportPdfA4Options
): Promise<{ evidence: AnalysisReportPdfRunEvidence; pdfPath: string | null; primaryError: unknown }> {
    const tracker = new AnalysisReportPdfStageTracker();
    const runContext = resolveAnalysisReportPdfRunContext(options.testInfo);
    const evidence = buildBaseEvidence(options, tracker, runContext);

    const pdfPath = path.join(
        runContext.artifactDir,
        `analysis-report-a4-${evidence.browserName}-${options.target.analysisId}.pdf`
    );

    if (options.skipPdfGenerationReason) {
        tracker.skipPdfGenerationStages();
    }

    let primaryError: unknown = null;

    try {
        tracker.enter('login');
        await loginExistingUserForPart2(options.page, options.account);
        tracker.pass('login');

        tracker.enter('navigation');
        await navigateToAuthenticatedAnalysisReport(
            options.page,
            options.appOrigin,
            options.target.customerId,
            options.target.analysisId
        );
        tracker.pass('navigation');

        tracker.enter('contentExpectations');
        const contentExpectation = await collectReportPdfContentExpectations(
            options.page,
            options.target.customerDisplayNameHint
        );
        tracker.pass('contentExpectations');

        tracker.enter('applicationPrintMenuAction');
        const menuResult = await executeAnalysisReportPrintMenuAction(
            options.page,
            options.appOrigin,
            options.target.customerId,
            options.target.analysisId
        );
        evidence.menuAction = menuResult.evidence;
        if (menuResult.error) {
            tracker.fail('applicationPrintMenuAction');
            throw menuResult.error;
        }
        tracker.pass('applicationPrintMenuAction');

        tracker.enter('a4PdfGeneration');
        evidence.pdfGeneration = await generateAnalysisReportA4Pdf(options.page, { outputPath: pdfPath });
        tracker.pass('a4PdfGeneration');

        tracker.enter('savedPdfFileValidation');
        try {
            evidence.pdfValidation = await validateAnalysisReportPdfFile(pdfPath, contentExpectation);
            tracker.pass('savedPdfFileValidation');
            tracker.enter('pdfContentVerification');
            tracker.pass('pdfContentVerification');
        } catch (validationError) {
            if (await pdfExists(pdfPath)) {
                try {
                    evidence.pdfValidation = await analyzeAnalysisReportPdfFile(pdfPath, contentExpectation);
                } catch {
                    // keep parser/geometry error as primary
                }
            }
            if (evidence.pdfValidation?.a4ValidationPassed) {
                tracker.pass('savedPdfFileValidation');
                tracker.enter('pdfContentVerification');
                tracker.fail('pdfContentVerification');
            } else if (evidence.pdfValidation) {
                tracker.fail('savedPdfFileValidation');
            } else {
                tracker.fail('savedPdfFileValidation');
            }
            throw validationError;
        }

        expect(evidence.pdfValidation?.pageCount).toBeGreaterThanOrEqual(1);
        expect(evidence.pdfValidation?.contentVerificationPassed).toBe(true);
    } catch (error) {
        primaryError = error;
        markOpenStagesFailed(tracker);
        evidence.failureStep = error instanceof Error ? error.message.slice(0, 300) : 'a4_pdf_run_failed';
    } finally {
        finalizeEvidence(evidence, tracker);
    }

    const attachPdf = (await pdfExists(pdfPath)) ? pdfPath : null;
    return { evidence, pdfPath: attachPdf, primaryError };
}

export function buildSkipEvidence(options: RunAnalysisReportPdfA4Options): AnalysisReportPdfRunEvidence {
    const tracker = new AnalysisReportPdfStageTracker();
    tracker.skipPdfGenerationStages();
    const runContext = resolveAnalysisReportPdfRunContext(options.testInfo);
    const evidence = buildBaseEvidence(options, tracker, runContext);
    finalizeEvidence(evidence, tracker);
    logAnalysisReportPdfEvent('pdf_generation_skipped', {
        browserName: evidence.browserName,
        reason: options.skipPdfGenerationReason,
        runId: evidence.runId,
    });
    return evidence;
}
