import { test, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import {
    openExistingCirsRecordForResponseDetails,
    resolveResponseDetailsRecordFromEnv,
    responseDetailsEvidenceAttachmentBody,
    runCirsResponseDetailsFlow,
    type CirsResponseDetailsRunResult,
} from './responseDetailsFlow';
import type { CirsRecordContext } from '../cirsRecord/cirsRecordFlow';

/**
 * Standalone Response Details on an existing staging record (no create, no deletion).
 *
 * Required env:
 * - CIRS_RESPONSE_DETAILS_CUSTOMER_ID
 * - CIRS_RESPONSE_DETAILS_RECORD_ID
 *
 * Run: npx playwright test tests/CIRS/responseDetails/existingRecordResponseDetails.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

async function attachResponseDetailsEvidence(
    testInfo: TestInfo,
    payload: CirsResponseDetailsRunResult
): Promise<void> {
    try {
        await testInfo.attach('cirs-response-details', {
            body: responseDetailsEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-response-details:', error);
    }
}

const hasStandaloneRecordEnv =
    Boolean(process.env.CIRS_RESPONSE_DETAILS_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.CIRS_RESPONSE_DETAILS_RECORD_ID?.trim());

test('existing record: CIRS Response Details autosave and persistence', async ({ page }, testInfo) => {
    test.skip(!hasStandaloneRecordEnv, 'Set CIRS_RESPONSE_DETAILS_CUSTOMER_ID and CIRS_RESPONSE_DETAILS_RECORD_ID for staging runs.');
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { customerId, recordId } = resolveResponseDetailsRecordFromEnv();

    await test.step('login existing account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    let responseDetailLoad: Awaited<ReturnType<typeof openExistingCirsRecordForResponseDetails>>;
    await test.step('open existing record', async () => {
        responseDetailLoad = await openExistingCirsRecordForResponseDetails(page, {
            customerId,
            recordId,
        });
    });

    const recordContext: CirsRecordContext = {
        customerId,
        customerName: '',
        customerFurigana: '',
        recordId,
        recordUrl: page.url(),
        createAttempted: false,
        createConfirmed: true,
        recordIdentitySource: 'route_only',
        customerIdFromApi: null,
        apiParseNotes: ['existing_record_response_details'],
    };

    const result = await test.step('cirs response details', async () => {
        return runCirsResponseDetailsFlow(page, recordContext, {
            accountEmail: account.email,
            responseDetailLoad: responseDetailLoad!,
        });
    });
    await attachResponseDetailsEvidence(testInfo, result);
});
