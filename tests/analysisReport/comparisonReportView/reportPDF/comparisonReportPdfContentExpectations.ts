import { expect, type Locator, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_COMPARISON_ATTRS,
    ANALYSIS_REPORT_COMPARISON_REPORT_TITLE,
} from '../../analysisReportTestIds';
import {
    assertComparisonReportViewReady,
    comparisonColumn,
    comparisonReportRoot,
    readComparisonSlotAnalysisIds,
    type ComparisonSlotAnalysisIds,
} from '../comparisonReportViewLocators';
import {
    comparisonReportHeaderRegion,
    readComparisonReportCustomerDisplayName,
} from './comparisonReportPdfLocators';

const ACTION_TIMEOUT_MS = 15000;
const YMD_SLASH_PATTERN = /\d{4}\/\d{1,2}\/\d{1,2}/;

export type ComparisonReportPdfPairSourceVerification = ComparisonSlotAnalysisIds;

export type ComparisonReportPdfContentExpectation = {
    comparisonTitle: string;
    customerDisplayName: string;
    pairSourceVerification: ComparisonReportPdfPairSourceVerification;
    leftMeasuredAtDisplayToken: string | null;
    rightMeasuredAtDisplayToken: string | null;
};

async function extractColumnDateToken(column: Locator): Promise<string | null> {
    const text = (await column.innerText()).replace(/\s+/g, ' ').trim();
    const match = text.match(YMD_SLASH_PATTERN);
    return match?.[0] ?? null;
}

export async function collectComparisonReportPdfContentExpectations(
    page: Page,
    customerId: string,
    customerDisplayNameHint: string | null
): Promise<ComparisonReportPdfContentExpectation> {
    await assertComparisonReportViewReady(page, customerId);
    const root = comparisonReportRoot(page);
    await expect(root).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const pairSourceVerification = await readComparisonSlotAnalysisIds(page);

    const header = comparisonReportHeaderRegion(page);
    await expect(header).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(
        header.getByText(ANALYSIS_REPORT_COMPARISON_REPORT_TITLE, { exact: true }),
        'comparison title within comparison page chrome'
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const comparisonTitle = ANALYSIS_REPORT_COMPARISON_REPORT_TITLE;

    const customerDisplayName = await readComparisonReportCustomerDisplayName(page);
    if (customerDisplayNameHint && customerDisplayNameHint !== customerDisplayName) {
        throw new Error(
            `Comparison header customer name "${customerDisplayName}" does not match hint "${customerDisplayNameHint}".`
        );
    }

    const leftColumn = comparisonColumn(page, ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft);
    const rightColumn = comparisonColumn(page, ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotRight);
    const leftMeasuredAtDisplayToken = await extractColumnDateToken(leftColumn);
    const rightMeasuredAtDisplayToken = await extractColumnDateToken(rightColumn);

    return {
        comparisonTitle,
        customerDisplayName,
        pairSourceVerification,
        leftMeasuredAtDisplayToken,
        rightMeasuredAtDisplayToken,
    };
}

export function assertExpectedComparisonPair(
    actual: ComparisonSlotAnalysisIds,
    expected: ComparisonSlotAnalysisIds
): void {
    if (
        actual.leftAnalysisId !== expected.leftAnalysisId ||
        actual.rightAnalysisId !== expected.rightAnalysisId
    ) {
        throw new Error(
            `Comparison pair mismatch before PDF save (expected ${expected.leftAnalysisId}/${expected.rightAnalysisId}, got ${actual.leftAnalysisId}/${actual.rightAnalysisId}).`
        );
    }
}