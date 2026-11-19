import { expect, type Page } from '@playwright/test';
import { ANALYSIS_REPORT_COMPARISON_TEST_IDS } from '../../analysisReportTestIds';
import {
    assertComparisonReportViewReady,
    comparisonReportRoot,
} from '../comparisonReportViewLocators';
import { restoreAnalysisReportScreenMedia } from '../../reportPDF/analysisReportPdfReadiness';

const READY_TIMEOUT_MS = 30000;

export type ComparisonReportPdfReadinessEvidence = {
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

async function countLoadedImages(page: Page): Promise<{ report: { checked: number; loaded: number }; print: { checked: number; loaded: number } }> {
    return page.evaluate(() => {
        const countScope = (selector: string) => {
            const imgs = Array.from(document.querySelectorAll(selector)) as HTMLImageElement[];
            let loaded = 0;
            for (const img of imgs) {
                if (img.complete && img.naturalWidth > 0) {
                    loaded += 1;
                }
            }
            return { checked: imgs.length, loaded };
        };
        return {
            report: countScope('[data-testid="analysis-report-comparison"] img'),
            print: countScope('.show-on-print img, .print-wrapper img'),
        };
    });
}

export async function assertComparisonReportPdfReadiness(
    page: Page,
    customerId: string
): Promise<ComparisonReportPdfReadinessEvidence> {
    await assertComparisonReportViewReady(page, customerId);
    const root = comparisonReportRoot(page);
    await expect(root).toBeVisible({ timeout: READY_TIMEOUT_MS });

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
        pushText(document.querySelector('[data-testid="analysis-report-comparison"]'));
        return {
            printableTextLength: chunks.join(' ').trim().length,
            printScopeNodeCount: document.querySelectorAll('.show-on-print, .print-wrapper').length,
        };
    });
    expect(printable.printableTextLength, 'comparison printable text non-empty').toBeGreaterThan(0);

    await expect
        .poll(async () => {
            const counts = await countLoadedImages(page);
            return (
                counts.report.loaded === counts.report.checked &&
                counts.print.loaded === counts.print.checked
            );
        }, { timeout: READY_TIMEOUT_MS, message: 'comparison report and print-only images loaded' })
        .toBe(true);

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
    expect(fontsReady, 'document.fonts.ready before comparison PDF generation').toBe(true);

    const columns = root.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.column);
    await expect(columns).toHaveCount(2, { timeout: READY_TIMEOUT_MS });

    const counts = await countLoadedImages(page);

    return {
        printMediaEmulated: true,
        imagesChecked: counts.report.checked,
        imagesLoaded: counts.report.loaded,
        printOnlyImagesChecked: counts.print.checked,
        printOnlyImagesLoaded: counts.print.loaded,
        fontsReady,
        posturePhotosVerified: false,
        printableTextLength: printable.printableTextLength,
        printScopeNodeCount: printable.printScopeNodeCount,
    };
}

export { restoreAnalysisReportScreenMedia };