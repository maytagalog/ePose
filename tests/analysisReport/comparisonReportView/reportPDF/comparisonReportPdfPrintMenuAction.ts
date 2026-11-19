import { expect, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_PRINT_PAGE_TITLE,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../../analysisReportTestIds';
import { openComparisonReportActionsMenu } from '../sharing/qrCode/comparisonReportShareQrMenuAction';
import {
    assertComparisonReportViewReady,
    readComparisonSlotAnalysisIds,
    type ComparisonSlotAnalysisIds,
} from '../comparisonReportViewLocators';
import {
    installAnalysisReportPrintIntercept,
    readAnalysisReportPrintIntercept,
    restoreAnalysisReportPrintIntercept,
} from '../../reportPDF/analysisReportPrintIntercept';

const ACTION_TIMEOUT_MS = 15000;
const PRINT_HANDLER_POLL_MS = 8000;
const TITLE_RESTORE_POLL_MS = 8000;

export type ComparisonReportPrintMenuActionEvidence = {
    customerId: string;
    leftAnalysisId: string;
    rightAnalysisId: string;
    originalDocumentTitle: string;
    expectedPrintTitle: string;
    printInvocationCount: number;
    titleAtPrintInvocation: string | null;
    titleRestored: boolean;
    titleVerifiedBeforeInterceptCleanup: boolean;
    menuClosedAfterAction: boolean;
    comparisonStillReady: boolean;
    pairUnchanged: boolean;
    failureStep: string | null;
    interceptCleanupError: string | null;
    interceptionNote: string;
};

async function resolveExpectedPrintPageTitle(page: Page): Promise<string> {
    const lang = ((await page.locator('html').getAttribute('lang')) ?? 'ja').toLowerCase();
    if (lang.startsWith('en')) {
        return ANALYSIS_REPORT_PRINT_PAGE_TITLE.en;
    }
    return ANALYSIS_REPORT_PRINT_PAGE_TITLE.ja;
}

function assertPairUnchanged(before: ComparisonSlotAnalysisIds, after: ComparisonSlotAnalysisIds): void {
    if (
        before.leftAnalysisId !== after.leftAnalysisId ||
        before.rightAnalysisId !== after.rightAnalysisId
    ) {
        throw new Error(
            `Comparison pair changed during print menu action (before ${before.leftAnalysisId}/${before.rightAnalysisId}, after ${after.leftAnalysisId}/${after.rightAnalysisId}).`
        );
    }
}

export async function executeComparisonReportPrintMenuAction(
    page: Page,
    customerId: string,
    pairBefore: ComparisonSlotAnalysisIds
): Promise<{ evidence: ComparisonReportPrintMenuActionEvidence; error: unknown }> {
    const evidence: ComparisonReportPrintMenuActionEvidence = {
        customerId,
        leftAnalysisId: pairBefore.leftAnalysisId,
        rightAnalysisId: pairBefore.rightAnalysisId,
        originalDocumentTitle: await page.title(),
        expectedPrintTitle: await resolveExpectedPrintPageTitle(page),
        printInvocationCount: 0,
        titleAtPrintInvocation: null,
        titleRestored: false,
        titleVerifiedBeforeInterceptCleanup: false,
        menuClosedAfterAction: false,
        comparisonStillReady: false,
        pairUnchanged: false,
        failureStep: null,
        interceptCleanupError: null,
        interceptionNote:
            'window.print was intercepted to block the native print dialog; this does not verify native browser Save as PDF.',
    };

    let primaryError: unknown = null;

    await installAnalysisReportPrintIntercept(page);
    try {
        await openComparisonReportActionsMenu(page);
        const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
        await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await expect(menu).toHaveAttribute('data-report-view', 'comparison', { timeout: ACTION_TIMEOUT_MS });

        const printAction = menu
            .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.printOpen)
            .locator('visible=true');
        await expect(printAction, 'visible comparison print action').toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(printAction).toHaveCount(1);
        await printAction.click({ timeout: ACTION_TIMEOUT_MS });

        await expect
            .poll(async () => (await readAnalysisReportPrintIntercept(page)).invocationCount, {
                timeout: PRINT_HANDLER_POLL_MS,
                message: 'window.print invocation after comparison print menu action',
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
                message: 'document.title restored after comparison print handler',
            })
            .toBe(evidence.originalDocumentTitle);
        evidence.titleRestored = true;

        await expect(menu).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        evidence.menuClosedAfterAction = true;

        await assertComparisonReportViewReady(page, customerId);
        const pairAfter = await readComparisonSlotAnalysisIds(page);
        assertPairUnchanged(pairBefore, pairAfter);
        evidence.comparisonStillReady = true;
        evidence.pairUnchanged = true;
    } catch (error) {
        primaryError = error;
        evidence.failureStep =
            error instanceof Error ? error.message.slice(0, 200) : 'comparison_print_menu_action';
    } finally {
        try {
            await expect
                .poll(async () => page.title(), {
                    timeout: TITLE_RESTORE_POLL_MS,
                    message: 'document.title before comparison print intercept cleanup',
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