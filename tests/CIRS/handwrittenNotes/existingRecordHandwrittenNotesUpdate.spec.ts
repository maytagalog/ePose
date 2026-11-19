import { test, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import {
    handwrittenNotesEvidenceAttachmentBody,
    openExistingCirsRecordForHandwrittenNotes,
    resolveHandwrittenNoteUpdateFromEnv,
    runCirsHandwrittenNoteUpdateFlow,
    type HandwrittenNotesUpdateRunResult,
} from './handwrittenNotesFlow';

/**
 * Standalone Handwritten Note update on an existing staging note (update-only; no creation).
 *
 * Required env:
 * - CIRS_HANDWRITTEN_CUSTOMER_ID
 * - CIRS_HANDWRITTEN_RECORD_ID
 * - CIRS_HANDWRITTEN_NOTE_ID
 *
 * Run: npx playwright test tests/CIRS/handwrittenNotes/existingRecordHandwrittenNotesUpdate.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const hasUpdateEnv =
    Boolean(process.env.CIRS_HANDWRITTEN_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.CIRS_HANDWRITTEN_RECORD_ID?.trim()) &&
    Boolean(process.env.CIRS_HANDWRITTEN_NOTE_ID?.trim());

async function attachEvidence(
    testInfo: TestInfo,
    payload: HandwrittenNotesUpdateRunResult
): Promise<void> {
    try {
        await testInfo.attach('cirs-handwritten-notes-update', {
            body: handwrittenNotesEvidenceAttachmentBody({
                ...payload,
                createAttempted: false,
                createServerConfirmed: false,
                createIdentityVerified: false,
                noteIdentitySource: null,
                listVerificationStatus: 'skipped_no_note_id',
                createVerified: false,
                deleteVerified: false,
            }),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-handwritten-notes-update:', error);
    }
}

test('existing record: CIRS handwritten note update only', async ({ page }, testInfo) => {
    test.skip(
        !hasUpdateEnv,
        'Set CIRS_HANDWRITTEN_CUSTOMER_ID, CIRS_HANDWRITTEN_RECORD_ID, and CIRS_HANDWRITTEN_NOTE_ID for staging runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { customerId, recordId, noteId } = resolveHandwrittenNoteUpdateFromEnv();

    await test.step('login existing account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    await test.step('open existing record', async () => {
        await openExistingCirsRecordForHandwrittenNotes(page, { customerId, recordId });
    });

    const result = await test.step('cirs handwritten note update', async () => {
        return runCirsHandwrittenNoteUpdateFlow(page, { customerId, recordId, noteId }, {
            accountEmail: account.email,
        });
    });
    await attachEvidence(testInfo, result);
});
