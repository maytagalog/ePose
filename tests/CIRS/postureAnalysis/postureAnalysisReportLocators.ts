import { expect, type Locator, type Page } from '@playwright/test';
import { parseCustomerIdFromUrl } from '../cirsRecord/cirsRecordFlow';
import { PostureAnalysisFlowError } from './postureAnalysisErrors';
import {
    ANALYSIS_ID_ATTR,
    ANALYSIS_REPORT_DETAIL_URL,
    CUSTOMER_ID_ATTR,
    parseAnalysisIdFromUrl,
    POSTURE_ANALYSIS_REPORT_TEST_IDS,
} from './postureAnalysisTestIds';

const NAVIGATION_TIMEOUT_MS = 30000;
const ACTION_TIMEOUT_MS = 15000;

export function postureAnalysisReportRoot(page: Page): Locator {
    return page.getByTestId(POSTURE_ANALYSIS_REPORT_TEST_IDS.report);
}

export async function assertAnalysisReportPageLoaded(
    page: Page,
    appOrigin: string,
    customerId: string,
    expectedAnalysisId: string
): Promise<void> {
    await expect(page).toHaveURL(ANALYSIS_REPORT_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const origin = new URL(page.url()).origin;
    if (origin !== appOrigin) {
        throw new PostureAnalysisFlowError(`Report page origin ${origin} != expected ${appOrigin}.`);
    }
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    const routeAnalysisId = parseAnalysisIdFromUrl(page.url());
    if (routeCustomerId !== customerId) {
        throw new PostureAnalysisFlowError(
            `Report route customer (${routeCustomerId}) != expected ${customerId}.`
        );
    }
    if (routeAnalysisId !== expectedAnalysisId) {
        throw new PostureAnalysisFlowError(
            `Report route analysis id (${routeAnalysisId}) != selected ${expectedAnalysisId}.`
        );
    }

    const report = postureAnalysisReportRoot(page);
    await expect(report, 'exactly one analysis-report container').toHaveCount(1, {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    const reportContainer = report.first();
    await expect(reportContainer, 'analysis-report container visible').toBeVisible({
        timeout: NAVIGATION_TIMEOUT_MS,
    });

    await expect
        .poll(
            async () => {
                const analysisId = await reportContainer.getAttribute(ANALYSIS_ID_ATTR);
                if (analysisId && analysisId !== expectedAnalysisId) {
                    throw new PostureAnalysisFlowError(
                        `analysis-report data-analysis-id (${analysisId}) != selected ${expectedAnalysisId}.`
                    );
                }
                return analysisId;
            },
            { timeout: NAVIGATION_TIMEOUT_MS, message: 'analysis-report data-analysis-id' }
        )
        .toBe(expectedAnalysisId);
    await expect
        .poll(
            async () => {
                const domCustomerId = await reportContainer.getAttribute(CUSTOMER_ID_ATTR);
                if (domCustomerId && domCustomerId !== customerId) {
                    throw new PostureAnalysisFlowError(
                        `analysis-report data-customer-id (${domCustomerId}) != expected ${customerId}.`
                    );
                }
                return domCustomerId;
            },
            { timeout: NAVIGATION_TIMEOUT_MS, message: 'analysis-report data-customer-id' }
        )
        .toBe(customerId);

    const summary = reportContainer.getByTestId(POSTURE_ANALYSIS_REPORT_TEST_IDS.summary);
    await expect(summary, 'analysis-report-summary visible within report').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });

    const score = reportContainer.getByTestId(POSTURE_ANALYSIS_REPORT_TEST_IDS.score);
    await expect(score, 'analysis-report-score visible within report').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect
        .poll(async () => (await score.textContent())?.trim() ?? '', {
            timeout: NAVIGATION_TIMEOUT_MS,
            message: 'analysis-report-score populated',
        })
        .toMatch(/\d+/);
}
