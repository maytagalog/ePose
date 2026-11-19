import type { Page } from '@playwright/test';
import { loginExistingUserForPart2 } from '../../login/existingUserLoginFlow';
import {
    assertPostureAnalysisFullListRoute,
    postureAnalysisFullListPathname,
} from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { assertCustomerReportHistoryListReady } from '../reportHistory/analysisReportHistoryCustomerReadiness';

const NAVIGATION_TIMEOUT_MS = 30000;

export async function gotoCustomerReportHistoryList(
    page: Page,
    appOrigin: string,
    customerId: string
): Promise<void> {
    await page.goto(`${appOrigin}${postureAnalysisFullListPathname(customerId)}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await assertPostureAnalysisFullListRoute(page, customerId, appOrigin);
    await assertCustomerReportHistoryListReady(page, customerId);
}

/** Standalone path B: login → direct customer history list (verified route/readiness). */
export async function loginAndOpenCustomerReportHistory(
    page: Page,
    account: { email: string; password: string },
    appOrigin: string,
    customerId: string
): Promise<void> {
    await loginExistingUserForPart2(page, account);
    await gotoCustomerReportHistoryList(page, appOrigin, customerId);
}
