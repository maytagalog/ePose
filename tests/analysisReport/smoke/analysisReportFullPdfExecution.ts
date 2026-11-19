import type { Page } from '@playwright/test';

export type AnalysisReportFullPdfExecutionContext =
    | 'primary-headless-chromium'
    | 'primary-headed-chromium'
    | 'auxiliary-headless-chromium';

export type AnalysisReportFullPdfExecutionPlan = {
    context: AnalysisReportFullPdfExecutionContext;
    /** null when primary is headless (probe not needed). */
    headedPagePdfSupported: boolean | null;
};

/**
 * Probe page.pdf() on a throwaway tab in the headed primary context (does not navigate the visible report page).
 */
export async function probeChromiumHeadedPagePdfSupported(primaryPage: Page): Promise<boolean> {
    const probePage = await primaryPage.context().newPage();
    try {
        await probePage.goto('about:blank', { waitUntil: 'commit' });
        const bytes = await probePage.pdf({ format: 'A4', printBackground: false });
        return bytes.byteLength > 0;
    } catch {
        return false;
    } finally {
        await probePage.close();
    }
}

export async function resolveFullSmokePdfExecutionPlan(options: {
    browserName: string;
    primaryHeadless: boolean;
    primaryPage: Page;
}): Promise<AnalysisReportFullPdfExecutionPlan> {
    if (options.browserName !== 'chromium') {
        throw new Error('Combined Analysis Report A4 PDF requires Chromium.');
    }
    if (options.primaryHeadless) {
        return { context: 'primary-headless-chromium', headedPagePdfSupported: null };
    }
    const headedPagePdfSupported = await probeChromiumHeadedPagePdfSupported(options.primaryPage);
    if (headedPagePdfSupported) {
        return { context: 'primary-headed-chromium', headedPagePdfSupported: true };
    }
    return { context: 'auxiliary-headless-chromium', headedPagePdfSupported: false };
}

/** @deprecated Use resolveFullSmokePdfExecutionPlan */
export function resolveFullSmokePdfExecutionContext(options: {
    browserName: string;
    primaryHeadless: boolean;
}): AnalysisReportFullPdfExecutionContext {
    if (options.browserName !== 'chromium') {
        throw new Error('Combined Analysis Report A4 PDF requires Chromium.');
    }
    if (options.primaryHeadless) {
        return 'primary-headless-chromium';
    }
    return 'auxiliary-headless-chromium';
}

export function usesAuxiliaryHeadlessPdfContext(
    context: AnalysisReportFullPdfExecutionContext
): boolean {
    return context === 'auxiliary-headless-chromium';
}

export function describePdfExecutionContextForEvidence(
    context: AnalysisReportFullPdfExecutionContext,
    headedPagePdfSupported: boolean | null
): string {
    if (context === 'auxiliary-headless-chromium') {
        const probe =
            headedPagePdfSupported === false
                ? 'Headed page.pdf() probe failed for this Chromium build;'
                : 'Headed primary retained;';
        return `${probe} PDF used isolated headless Chromium with copied storageState on the pinned latest report (no duplicate login/email/settings/deletion).`;
    }
    if (context === 'primary-headed-chromium') {
        return 'Headed page.pdf() probe succeeded; PDF generated on the visible primary Chromium page for the pinned latest report.';
    }
    return 'PDF generated on the primary headless Chromium page for the pinned latest report.';
}
