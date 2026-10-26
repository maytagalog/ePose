import { test, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
    STG_APP_ORIGIN,
} from '../../login/existingUserLoginFlow';
import {
    cirsEvidenceAttachmentBody,
    runCirsRecordListNavigationVerification,
    type CirsRecordRunEvidence,
} from './cirsRecordFlow';

/**
 * Verification-only continuation for a record already created on staging (no 新規応対, no deletion).
 *
 * Explicit inputs from 2026-10-25 failed run — not production defaults.
 * Set display-name env vars to match the customer row on staging before running live.
 */
const CONTINUATION_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
const CONTINUATION_RECORD_ID = 'f11b84fe-d4aa-4bc3-8cfa-90a566c158cb';

function resolveContinuationCustomerDisplay(): { name: string; furigana: string } {
    const name = process.env.CIRS_VERIFICATION_CUSTOMER_NAME?.trim() ?? '';
    const furigana = process.env.CIRS_VERIFICATION_CUSTOMER_FURIGANA?.trim() ?? '';
    if (!name || !furigana) {
        throw new Error(
            'Set CIRS_VERIFICATION_CUSTOMER_NAME and CIRS_VERIFICATION_CUSTOMER_FURIGANA to the ' +
                'staging customer display values before running this spec on staging.'
        );
    }
    return { name, furigana };
}

test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

async function attachCirsEvidence(
    testInfo: TestInfo,
    payload: CirsRecordRunEvidence
): Promise<void> {
    try {
        await testInfo.attach('cirs-record-context', {
            body: cirsEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-record-context:', error);
    }
}

test('staging verification: existing record list navigation (no create)', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const { name: customerName, furigana: customerFurigana } = resolveContinuationCustomerDisplay();
    const account = resolvePart2LoginAccount();

    await test.step('login existing account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    let latestEvidence: CirsRecordRunEvidence | null = null;

    try {
        await test.step('verify existing CIRS record navigation', async () => {
            await runCirsRecordListNavigationVerification(
                page,
                {
                    customerId: CONTINUATION_CUSTOMER_ID,
                    recordId: CONTINUATION_RECORD_ID,
                    customerName,
                    customerFurigana,
                    appOrigin: STG_APP_ORIGIN,
                },
                {
                    onEvidence: (evidence) => {
                        latestEvidence = evidence;
                    },
                }
            );
        });
        if (latestEvidence) {
            await attachCirsEvidence(testInfo, latestEvidence);
        }
    } catch (error) {
        if (latestEvidence) {
            await attachCirsEvidence(testInfo, latestEvidence);
        }
        throw error;
    }
});
