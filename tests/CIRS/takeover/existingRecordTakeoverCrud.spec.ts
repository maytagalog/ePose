import { test, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import type { TakeoverRunEvidence } from './takeoverReporting';
import {
    openExistingCirsRecordForTakeover,
    resolveTakeoverRecordFromEnv,
    runCirsTakeoverCrudFlow,
    takeoverEvidenceAttachmentBody,
    type TakeoverCrudRunResult,
} from './takeoverFlow';

/**
 * Standalone Takeover (引き継ぎ) CRUD on an existing staging CIRS record.
 *
 * Required env:
 * - CIRS_TAKEOVER_CUSTOMER_ID
 * - CIRS_TAKEOVER_RECORD_ID
 *
 * Run: npx playwright test tests/CIRS/takeover/existingRecordTakeoverCrud.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const hasCrudEnv =
    Boolean(process.env.CIRS_TAKEOVER_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.CIRS_TAKEOVER_RECORD_ID?.trim());

async function attachEvidence(
    testInfo: TestInfo,
    payload: TakeoverCrudRunResult | TakeoverRunEvidence | Record<string, unknown>
): Promise<void> {
    try {
        await testInfo.attach('cirs-takeover-crud', {
            body: takeoverEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-takeover-crud:', error);
    }
}

test('existing record: CIRS takeover handover CRUD', async ({ page }, testInfo) => {
    test.skip(
        !hasCrudEnv,
        'Set CIRS_TAKEOVER_CUSTOMER_ID and CIRS_TAKEOVER_RECORD_ID for staging CRUD runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { customerId, recordId } = resolveTakeoverRecordFromEnv();
    let latestEvidence: TakeoverRunEvidence | null = null;

    await test.step('login existing account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    await test.step('open existing record', async () => {
        await openExistingCirsRecordForTakeover(page, { customerId, recordId });
    });

    try {
        const result = await test.step('takeover CRUD', async () => {
            return runCirsTakeoverCrudFlow(page, { customerId, recordId }, {
                accountEmail: account.email,
                onEvidence: (evidence) => {
                    latestEvidence = evidence;
                },
            });
        });
        await attachEvidence(testInfo, result);
    } catch (error) {
        if (latestEvidence) {
            await attachEvidence(testInfo, { evidence: latestEvidence });
        }
        throw error;
    }
});
