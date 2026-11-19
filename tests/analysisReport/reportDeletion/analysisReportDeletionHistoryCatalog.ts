import { expect, type Page } from '@playwright/test';
import { postureAnalysisFullListContainer } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import { POSTURE_ANALYSIS_TEST_IDS } from '../../CIRS/postureAnalysis/postureAnalysisTestIds';
import { ANALYSIS_ID_ATTR, CUSTOMER_ID_ATTR } from '../analysisReportTestIds';

const ACTION_TIMEOUT_MS = 15000;

export async function assertHistoryRowAbsent(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<void> {
    const historyList = postureAnalysisFullListContainer(page);
    const row = historyList
        .locator(
            `[data-testid="${POSTURE_ANALYSIS_TEST_IDS.item}"][${CUSTOMER_ID_ATTR}="${customerId}"][${ANALYSIS_ID_ATTR}="${analysisId}"]`
        )
        .locator('visible=true');
    await expect(row, 'deleted analysis row absent from fresh history').toHaveCount(0, {
        timeout: ACTION_TIMEOUT_MS,
    });
}

export async function assertHistoryRowPresent(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<void> {
    const historyList = postureAnalysisFullListContainer(page);
    const row = historyList
        .locator(
            `[data-testid="${POSTURE_ANALYSIS_TEST_IDS.item}"][${CUSTOMER_ID_ATTR}="${customerId}"][${ANALYSIS_ID_ATTR}="${analysisId}"]`
        )
        .locator('visible=true');
    await expect(row, 'pinned analysis row still on customer history').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
}
