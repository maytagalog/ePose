import { expect, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_HEADER_FIELDS,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
} from '../analysisReportTestIds';
import {
    analysisReportRoot,
    analysisReportVisibleHeader,
} from '../reportView/analysisReportSingleReportLocators';

const ACTION_TIMEOUT_MS = 15000;

export type AnalysisReportHistorySourceIdentity = {
    customerDisplayName: string;
    measuredAtDisplayToken: string;
    measuredAtIso: string;
    scoreToken: string;
};

/** Data-driven identity captured from the verified source report (no hardcoded scores/dates). */
export async function captureAnalysisReportHistorySourceIdentity(
    page: Page
): Promise<AnalysisReportHistorySourceIdentity> {
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
        throw new Error('Source report customer name is empty.');
    }

    const measuredAtField = header
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.headerField)
        .and(header.locator(`[data-field="${ANALYSIS_REPORT_HEADER_FIELDS.measuredAt}"]`));
    await expect(measuredAtField, 'visible measuredAt header field').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const measuredAtIso = (await measuredAtField.getAttribute('data-value'))?.trim() ?? '';
    const measuredAtDisplayToken = (await measuredAtField.innerText()).trim();
    if (!measuredAtDisplayToken) {
        throw new Error('Source report measuredAt visible text is empty.');
    }
    if (!measuredAtIso || Number.isNaN(Date.parse(measuredAtIso))) {
        throw new Error('Source report measuredAt data-value is missing or not ISO-parseable.');
    }

    const scoreEl = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.score).locator('visible=true');
    await expect(scoreEl, 'exactly one visible analysis-report-score on source report').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    const scoreToken = (await scoreEl.innerText()).replace(/\s+/g, '').trim();
    if (!scoreToken) {
        throw new Error('Source report score text is empty.');
    }

    return { customerDisplayName, measuredAtDisplayToken, measuredAtIso, scoreToken };
}

export async function assertReopenedReportMatchesSourceIdentity(
    page: Page,
    source: AnalysisReportHistorySourceIdentity,
    customerDisplayNameHint: string | null
): Promise<void> {
    const reopened = await captureAnalysisReportHistorySourceIdentity(page);
    if (customerDisplayNameHint && reopened.customerDisplayName !== customerDisplayNameHint) {
        throw new Error(
            `Reopened customer name "${reopened.customerDisplayName}" != hint "${customerDisplayNameHint}".`
        );
    }
    expect(reopened.customerDisplayName).toBe(source.customerDisplayName);
    expect(reopened.measuredAtIso).toBe(source.measuredAtIso);
    expect(reopened.measuredAtDisplayToken).toBe(source.measuredAtDisplayToken);
    expect(reopened.scoreToken).toBe(source.scoreToken);
}
