import type { Page, Request } from '@playwright/test';
import {
    VERIFIED_DELETE_REPORT_URL,
    VERIFIED_FETCH_CUSTOMER_REPORT_URL,
    type VerifiedDeleteReportRequestBody,
    type VerifiedFetchCustomerReportRequestBody,
} from './analysisReportStagingContracts';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import { isDeletionFixtureOrigin } from './analysisReportDeletionFixtureMode';

const OBSERVE_TIMEOUT_MS = 60000;

function parseJsonBody<T>(postData: string | null): T | null {
    if (!postData) {
        return null;
    }
    try {
        return JSON.parse(postData) as T;
    } catch {
        return null;
    }
}

/**
 * Staging: `useAuth.accountID` on StandingPostureAnalysis / CustomerPostureAnalysisReportListPage.
 * Passed on report APIs as JSON `accountId` (staff store account, not customerId).
 */
export async function observeAuthenticatedAccountId(page: Page): Promise<string> {
    if (isDeletionFixtureOrigin(page.url())) {
        throw new AnalysisReportDeletionFlowError(
            'Fixture origin has no authenticated session; use ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID in fixture flows only.'
        );
    }

    return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
            page.off('request', onRequest);
            reject(
                new AnalysisReportDeletionFlowError(
                    'Timed out waiting for authenticated report API request carrying accountId.'
                )
            );
        }, OBSERVE_TIMEOUT_MS);

        const onRequest = (request: Request) => {
            if (request.method() !== 'POST') {
                return;
            }
            const url = request.url();
            if (
                !url.includes(VERIFIED_FETCH_CUSTOMER_REPORT_URL) &&
                !url.includes(VERIFIED_DELETE_REPORT_URL)
            ) {
                return;
            }
            const body =
                parseJsonBody<VerifiedFetchCustomerReportRequestBody | VerifiedDeleteReportRequestBody>(
                    request.postData()
                );
            const accountId = body?.accountId?.trim();
            if (!accountId) {
                return;
            }
            clearTimeout(timer);
            page.off('request', onRequest);
            resolve(accountId);
        };

        page.on('request', onRequest);
    });
}

export function assertDeleteRequestMatchesPinnedTarget(
    body: VerifiedDeleteReportRequestBody,
    expected: {
        accountId: string;
        deleteRequestId: string;
        customerId: string;
    }
): void {
    if (body.accountId !== expected.accountId) {
        throw new AnalysisReportDeletionFlowError(
            `Delete request accountId ${body.accountId} != pinned session accountId ${expected.accountId}.`
        );
    }
    if (body.id !== expected.deleteRequestId) {
        throw new AnalysisReportDeletionFlowError(
            `Delete request id ${body.id} != pinned deleteRequestId ${expected.deleteRequestId}.`
        );
    }
    if (!body.id.trim()) {
        throw new AnalysisReportDeletionFlowError('Delete request id is empty.');
    }
    void expected.customerId;
}
