import { test, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import {
    handwrittenNotesEvidenceAttachmentBody,
    openExistingCirsRecordForHandwrittenNotes,
    resolveHandwrittenNoteDeleteFromEnv,
    runCirsHandwrittenNoteDeleteFlow,
    type HandwrittenNotesDeleteRunResult,
} from './handwrittenNotesFlow';

/**
 * Standalone Handwritten Note delete on an existing staging note (delete-only; no creation/update).
 *
 * Required env:
 * - CIRS_HANDWRITTEN_CUSTOMER_ID
 * - CIRS_HANDWRITTEN_RECORD_ID
 * - CIRS_HANDWRITTEN_NOTE_ID
 *
 * Run: npx playwright test tests/CIRS/handwrittenNotes/existingRecordHandwrittenNotesDelete.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const hasDeleteEnv =
    Boolean(process.env.CIRS_HANDWRITTEN_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.CIRS_HANDWRITTEN_RECORD_ID?.trim()) &&
    Boolean(process.env.CIRS_HANDWRITTEN_NOTE_ID?.trim());

async function attachEvidence(
    testInfo: TestInfo,
    payload: HandwrittenNotesDeleteRunResult
): Promise<void> {
    try {
        await testInfo.attach('cirs-handwritten-notes-delete', {
            body: handwrittenNotesEvidenceAttachmentBody({
                customerId: payload.customerId,
                recordId: payload.recordId,
                noteId: payload.noteId,
                createAttempted: false,
                createServerConfirmed: false,
                createIdentityVerified: false,
                noteIdentitySource: null,
                listVerificationStatus: 'skipped_no_note_id',
                createVerified: false,
                updateVerified: false,
                deleteVerified: payload.deleteVerified,
                noteRetainedOnStaging: payload.noteRetainedOnStaging,
                creationScope: 'not_run',
                updateScope: 'not_run',
                readScope: 'executed',
                deleteScope: 'executed',
                deleteServerConfirmed: payload.deleteServerConfirmed,
            }),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-handwritten-notes-delete:', error);
    }
}

test('existing record: CIRS handwritten note delete only', async ({ page }, testInfo) => {
    test.skip(
        !hasDeleteEnv,
        'Set CIRS_HANDWRITTEN_CUSTOMER_ID, CIRS_HANDWRITTEN_RECORD_ID, and CIRS_HANDWRITTEN_NOTE_ID for staging runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { customerId, recordId, noteId } = resolveHandwrittenNoteDeleteFromEnv();

    await test.step('login existing account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    await test.step('open existing record', async () => {
        await openExistingCirsRecordForHandwrittenNotes(page, { customerId, recordId });
    });

    const result = await test.step('cirs handwritten note delete', async () => {
        return runCirsHandwrittenNoteDeleteFlow(page, { customerId, recordId, noteId }, {
            accountEmail: account.email,
        });
    });
    await attachEvidence(testInfo, result);
});
