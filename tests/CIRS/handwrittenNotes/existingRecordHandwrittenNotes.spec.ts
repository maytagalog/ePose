import { test, type TestInfo } from '@playwright/test';
import type { CirsRecordContext } from '../cirsRecord/cirsRecordFlow';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import {
    handwrittenNotesEvidenceAttachmentBody,
    openExistingCirsRecordForHandwrittenNotes,
    resolveHandwrittenNotesRecordFromEnv,
    runCirsHandwrittenNotesFlow,
    type HandwrittenNotesRunResult,
} from './handwrittenNotesFlow';

/**
 * Standalone Handwritten Note creation on an existing staging record (create-only; note retained).
 *
 * Required env:
 * - CIRS_HANDWRITTEN_CUSTOMER_ID
 * - CIRS_HANDWRITTEN_RECORD_ID
 *
 * Run: npx playwright test tests/CIRS/handwrittenNotes/existingRecordHandwrittenNotes.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const hasStandaloneEnv =
    Boolean(process.env.CIRS_HANDWRITTEN_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.CIRS_HANDWRITTEN_RECORD_ID?.trim());

async function attachEvidence(testInfo: TestInfo, payload: HandwrittenNotesRunResult): Promise<void> {
    try {
        await testInfo.attach('cirs-handwritten-notes', {
            body: handwrittenNotesEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-handwritten-notes:', error);
    }
}

test('existing record: CIRS handwritten note creation', async ({ page }, testInfo) => {
    test.skip(!hasStandaloneEnv, 'Set CIRS_HANDWRITTEN_CUSTOMER_ID and CIRS_HANDWRITTEN_RECORD_ID for staging runs.');
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { customerId, recordId } = resolveHandwrittenNotesRecordFromEnv();

    await test.step('login existing account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    await test.step('open existing record', async () => {
        await openExistingCirsRecordForHandwrittenNotes(page, { customerId, recordId });
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
        apiParseNotes: ['existing_record_handwritten'],
    };

    const result = await test.step('cirs handwritten note creation', async () => {
        return runCirsHandwrittenNotesFlow(page, recordContext, { accountEmail: account.email });
    });
    await attachEvidence(testInfo, result);
});
