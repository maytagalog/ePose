import { expect, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_PRINT_PAGE_TITLE,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../analysisReportTestIds';
import { openAnalysisReportActionsMenu } from '../displaySettings/analysisReportDisplayItemSettingsFlow';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
} from '../reportView/analysisReportSingleReportLocators';
import {
    installAnalysisReportPrintIntercept,
    readAnalysisReportPrintIntercept,
    restoreAnalysisReportPrintIntercept,
} from './analysisReportPrintIntercept';

const ACTION_TIMEOUT_MS = 15000;
const PRINT_HANDLER_POLL_MS = 8000;
const TITLE_RESTORE_POLL_MS = 8000;

export type AnalysisReportPrintMenuActionEvidence = {
    customerId: string;
    analysisId: string;
    originalDocumentTitle: string;
    expectedPrintTitle: string;
    printInvocationCount: number;
    titleAtPrintInvocation: string | null;
    titleRestored: boolean;
    titleVerifiedBeforeInterceptCleanup: boolean;
    menuClosedAfterAction: boolean;
    reportStillReady: boolean;
    failureStep: string | null;
    interceptCleanupError: string | null;
    /** Intercept proves handler called print(); does not prove native print preview UI. */
    interceptionNote: string;
};

async function resolveExpectedPrintPageTitle(page: Page): Promise<string> {
    const lang = ((await page.locator('html').getAttribute('lang')) ?? 'ja').toLowerCase();
    if (lang.startsWith('en')) {
        return ANALYSIS_REPORT_PRINT_PAGE_TITLE.en;
    }
    return ANALYSIS_REPORT_PRINT_PAGE_TITLE.ja;
}

export async function executeAnalysisReportPrintMenuAction(
    page: Page,
    appOrigin: string,
    customerId: string,
    analysisId: string
): Promise<{ evidence: AnalysisReportPrintMenuActionEvidence; error: unknown }> {
    const evidence: AnalysisReportPrintMenuActionEvidence = {
        customerId,
        analysisId,
        originalDocumentTitle: await page.title(),
        expectedPrintTitle: await resolveExpectedPrintPageTitle(page),
        printInvocationCount: 0,
        titleAtPrintInvocation: null,
        titleRestored: false,
        titleVerifiedBeforeInterceptCleanup: false,
        menuClosedAfterAction: false,
        reportStillReady: false,
        failureStep: null,
        interceptCleanupError: null,
        interceptionNote:
            'window.print was intercepted to block the native print dialog; this does not verify native browser print preview UI.',
    };

    let primaryError: unknown = null;

    await installAnalysisReportPrintIntercept(page);
    try {
        await openAnalysisReportActionsMenu(page);
        const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
        await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await expect(menu).toHaveAttribute('data-report-view', 'single');

        const printAction = menu
            .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.printOpen)
            .locator('visible=true');
        await expect(printAction, 'visible print action inside actions menu').toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(printAction).toHaveCount(1);
        await printAction.click({ timeout: ACTION_TIMEOUT_MS });

        await expect
            .poll(async () => (await readAnalysisReportPrintIntercept(page)).invocationCount, {
                timeout: PRINT_HANDLER_POLL_MS,
                message: 'window.print invocation after menu action',
            })
            .toBe(1);
        const intercept = await readAnalysisReportPrintIntercept(page);

        evidence.printInvocationCount = intercept.invocationCount;
        evidence.titleAtPrintInvocation = intercept.titleAtInvocation;

        expect(intercept.invocationCount).toBe(1);
        expect(intercept.titleAtInvocation).toBe(evidence.expectedPrintTitle);

        await expect
            .poll(async () => page.title(), {
                timeout: TITLE_RESTORE_POLL_MS,
                message: 'document.title restored after print handler',
            })
            .toBe(evidence.originalDocumentTitle);
        evidence.titleRestored = true;

        await expect(menu).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        evidence.menuClosedAfterAction = true;

        await assertAnalysisReportRouteIdentity(page, appOrigin, customerId, analysisId);
        await assertAnalysisReportReady(page, customerId, analysisId);
        evidence.reportStillReady = true;
    } catch (error) {
        primaryError = error;
        evidence.failureStep =
            error instanceof Error ? error.message.slice(0, 200) : 'analysis_report_print_menu_action';
    } finally {
        try {
            await expect
                .poll(async () => page.title(), {
                    timeout: TITLE_RESTORE_POLL_MS,
                    message: 'app document.title before intercept cleanup',
                })
                .toBe(evidence.originalDocumentTitle);
            evidence.titleVerifiedBeforeInterceptCleanup = true;
        } catch {
            evidence.titleVerifiedBeforeInterceptCleanup = false;
        }

        const cleanup = await restoreAnalysisReportPrintIntercept(page);
        evidence.interceptCleanupError = cleanup.error;
        if (!primaryError && cleanup.error) {
            primaryError = new Error(`Print intercept cleanup failed: ${cleanup.error}`);
        }
    }

    return { evidence, error: primaryError };
}

export async function runAnalysisReportPrintMenuActionFlow(
    page: Page,
    appOrigin: string,
    customerId: string,
    analysisId: string
): Promise<AnalysisReportPrintMenuActionEvidence> {
    const result = await executeAnalysisReportPrintMenuAction(page, appOrigin, customerId, analysisId);
    if (result.error) {
        throw result.error;
    }
    return result.evidence;
}
