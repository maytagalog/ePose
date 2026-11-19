import { expect, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_HEADER_FIELDS,
    ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../analysisReportTestIds';
import {
    analysisReportRoot,
    analysisReportVisibleHeader,
} from '../reportView/analysisReportSingleReportLocators';

const ACTION_TIMEOUT_MS = 15000;

export type ReportPdfContentExpectation = {
    customerDisplayName: string;
    measuredAtDisplayToken: string;
    measuredAtIso: string;
    scoreToken: string;
    sectionMarkers: readonly string[];
};

/** Derive PDF text expectations from the verified on-screen report (no hardcoded score or dates). */
export async function collectReportPdfContentExpectations(
    page: Page,
    customerDisplayNameHint: string | null
): Promise<ReportPdfContentExpectation> {
    const report = analysisReportRoot(page);
    await expect(report).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const header = analysisReportVisibleHeader(page);
    await expect(header).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const nameField = header
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.headerField)
        .and(header.locator(`[data-field="${ANALYSIS_REPORT_HEADER_FIELDS.name}"]`));
    await expect(nameField).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const customerDisplayName = (await nameField.innerText()).trim();
    if (!customerDisplayName) {
        throw new Error('Report header customer name is empty; cannot validate PDF content.');
    }
    if (customerDisplayNameHint && customerDisplayNameHint !== customerDisplayName) {
        throw new Error(
            `Header customer name "${customerDisplayName}" does not match ANALYSIS_REPORT_VIEW_CUSTOMER_NAME hint "${customerDisplayNameHint}".`
        );
    }

    const measuredAtField = header
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.headerField)
        .and(header.locator(`[data-field="${ANALYSIS_REPORT_HEADER_FIELDS.measuredAt}"]`));
    await expect(measuredAtField).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const measuredAtIso = (await measuredAtField.getAttribute('data-value'))?.trim() ?? '';
    if (!measuredAtIso || Number.isNaN(Date.parse(measuredAtIso))) {
        throw new Error('Report header measuredAt data-value is missing or not ISO-parseable.');
    }
    const measuredAtDisplayToken = (await measuredAtField.innerText()).trim();
    if (!measuredAtDisplayToken) {
        throw new Error('Report header measuredAt visible text is empty; cannot validate PDF content.');
    }

    const scoreEl = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.score).locator('visible=true');
    await expect(scoreEl, 'exactly one visible analysis-report-score').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    const scoreToken = (await scoreEl.innerText()).replace(/\s+/g, '').trim();
    if (!scoreToken) {
        throw new Error('Visible analysis-report-score text is empty.');
    }

    const summary = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.summary).locator('visible=true');
    await expect(summary, 'exactly one visible analysis-report-summary').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    const summaryText = (await summary.innerText()).trim();
    for (const marker of ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS) {
        if (!summaryText.includes(marker)) {
            throw new Error(
                `Visible analysis-report-summary is missing required marker "${marker}" (contract: ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS).`
            );
        }
    }

    return {
        customerDisplayName,
        measuredAtDisplayToken,
        measuredAtIso,
        scoreToken,
        sectionMarkers: [...ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS],
    };
}
