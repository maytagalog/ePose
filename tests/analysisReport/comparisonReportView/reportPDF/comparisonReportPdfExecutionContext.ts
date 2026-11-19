import type { AnalysisReportFullPdfExecutionContext } from '../../smoke/analysisReportFullPdfExecution';

export function describeComparisonPdfExecutionContextPlan(
    context: AnalysisReportFullPdfExecutionContext,
    headedPagePdfSupported: boolean | null
): string {
    if (context === 'auxiliary-headless-chromium') {
        const probe =
            headedPagePdfSupported === false
                ? 'Headed page.pdf() probe failed for this Chromium build;'
                : 'Headed primary browser retained;';
        return `${probe} A4 PDF save is planned via isolated headless Chromium with copied session state and pinned comparison pair (file is not written until the save stage passes).`;
    }
    if (context === 'primary-headed-chromium') {
        return 'Headed page.pdf() probe succeeded; A4 PDF save is planned on the visible primary Chromium comparison page (file is not written until the save stage passes).';
    }
    return 'A4 PDF save is planned on the primary headless Chromium comparison page (file is not written until the save stage passes).';
}

export function describeComparisonPdfExecutionContextAfterSave(
    context: AnalysisReportFullPdfExecutionContext,
    headedPagePdfSupported: boolean | null,
    pdfSaved: boolean
): string {
    if (!pdfSaved) {
        return describeComparisonPdfExecutionContextPlan(context, headedPagePdfSupported);
    }
    if (context === 'auxiliary-headless-chromium') {
        return 'A4 comparison PDF saved via isolated headless Chromium using session state and the captured comparison pair.';
    }
    if (context === 'primary-headed-chromium') {
        return 'A4 comparison PDF saved on the visible primary Chromium page after headed page.pdf() probe succeeded.';
    }
    return 'A4 comparison PDF saved on the primary headless Chromium page.';
}