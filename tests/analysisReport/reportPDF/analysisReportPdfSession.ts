import type { Page } from '@playwright/test';
import { navigateToPinnedAnalysisReport } from '../reportView/analysisReportSingleReportLocators';

export async function navigateToAuthenticatedAnalysisReport(
    page: Page,
    appOrigin: string,
    customerId: string,
    analysisId: string
): Promise<void> {
    await navigateToPinnedAnalysisReport(page, appOrigin, customerId, analysisId);
}
