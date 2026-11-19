import { expect, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../analysisReportTestIds';
import {
    analysisReportRoot,
    assertPosturePhotosAndMetrics,
} from '../reportView/analysisReportSingleReportLocators';

const READY_TIMEOUT_MS = 30000;

export type AnalysisReportPdfReadinessEvidence = {
    printMediaEmulated: boolean;
    imagesChecked: number;
    imagesLoaded: number;
    printOnlyImagesChecked: number;
    printOnlyImagesLoaded: number;
    fontsReady: boolean;
    posturePhotosVerified: boolean;
    printableTextLength: number;
    printScopeNodeCount: number;
};

async function countLoadedImages(
    page: Page,
    selectorScope: 'report' | 'print'
): Promise<{ checked: number; loaded: number }> {
    return page.evaluate((scope) => {
        const selectors =
            scope === 'report'
                ? ['[data-testid="analysis-report"] img']
                : ['.show-on-print img', '.print-wrapper img'];
        const imgs = new Set<HTMLImageElement>();
        for (const sel of selectors) {
            for (const img of Array.from(document.querySelectorAll(sel)) as HTMLImageElement[]) {
                imgs.add(img);
            }
        }
        let loaded = 0;
        for (const img of imgs) {
            if (img.complete && img.naturalWidth > 0) {
                loaded += 1;
            }
        }
        return { checked: imgs.size, loaded };
    }, selectorScope);
}

async function waitForAllImagesLoaded(page: Page, message: string): Promise<void> {
    await expect
        .poll(
            async () => {
                const report = await countLoadedImages(page, 'report');
                const printOnly = await countLoadedImages(page, 'print');
                return report.loaded === report.checked && printOnly.loaded === printOnly.checked;
            },
            { timeout: READY_TIMEOUT_MS, message: `${message} (all discovered images loaded)` }
        )
        .toBe(true);
}

/**
 * Wait for report content, posture photos (contract), print-layout images/fonts, and non-empty printable text.
 */
export type AnalysisReportPdfReadinessOptions = {
    requirePosturePhotos?: boolean;
};

export async function assertAnalysisReportPdfReadiness(
    page: Page,
    options?: AnalysisReportPdfReadinessOptions
): Promise<AnalysisReportPdfReadinessEvidence> {
    const report = analysisReportRoot(page);
    await expect(report).toBeVisible({ timeout: READY_TIMEOUT_MS });
    const requirePosturePhotos = options?.requirePosturePhotos !== false;
    if (requirePosturePhotos) {
        await assertPosturePhotosAndMetrics(report);
    }

    await page.emulateMedia({ media: 'print' });

    const printable = await page.evaluate(() => {
        const chunks: string[] = [];
        const pushText = (el: Element | null) => {
            const text = (el as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
            if (text) {
                chunks.push(text);
            }
        };
        document.querySelectorAll('.show-on-print, .print-wrapper').forEach((el) => pushText(el));
        pushText(document.querySelector('[data-testid="analysis-report-summary"]'));
        return {
            printableTextLength: chunks.join(' ').trim().length,
            printScopeNodeCount: document.querySelectorAll('.show-on-print, .print-wrapper').length,
        };
    });
    expect(
        printable.printableTextLength,
        'print media exposes non-empty printable report text (show-on-print / summary)'
    ).toBeGreaterThan(0);

    await waitForAllImagesLoaded(page, 'analysis-report and print-only images loaded');

    const fontsReady = await page.evaluate(async () => {
        const fonts = document.fonts;
        if (!fonts) {
            return true;
        }
        try {
            await fonts.ready;
            return fonts.status === 'loaded';
        } catch {
            return false;
        }
    });
    expect(fontsReady, 'document.fonts.ready before PDF generation').toBe(true);

    const summary = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.summary);
    await expect(summary).toHaveCount(1, { timeout: READY_TIMEOUT_MS });

    const reportImagesAfter = await countLoadedImages(page, 'report');
    const printImagesAfter = await countLoadedImages(page, 'print');
    expect(reportImagesAfter.loaded).toBe(reportImagesAfter.checked);
    expect(printImagesAfter.loaded).toBe(printImagesAfter.checked);

    return {
        printMediaEmulated: true,
        imagesChecked: reportImagesAfter.checked,
        imagesLoaded: reportImagesAfter.loaded,
        printOnlyImagesChecked: printImagesAfter.checked,
        printOnlyImagesLoaded: printImagesAfter.loaded,
        fontsReady,
        posturePhotosVerified: true,
        printableTextLength: printable.printableTextLength,
        printScopeNodeCount: printable.printScopeNodeCount,
    };
}

export async function restoreAnalysisReportScreenMedia(page: Page): Promise<void> {
    await page.emulateMedia({ media: 'screen' });
}
