import { test, type TestInfo } from '@playwright/test';
import type { CirsRecordContext } from '../cirsRecord/cirsRecordFlow';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import type { HandwrittenNotesRunEvidence } from './handwrittenNotesReporting';
import {
    handwrittenNotesEvidenceAttachmentBody,
    openExistingCirsRecordForHandwrittenNotes,
    resolveHandwrittenNotesRecordFromEnv,
    runCirsHandwrittenNoteDeleteFlow,
    runCirsHandwrittenNoteUpdateFlow,
    runCirsHandwrittenNotesFlow,
    type HandwrittenNotesRunResult,
} from './handwrittenNotesFlow';

/**
 * Standalone Handwritten Note CRUD on an existing staging CIRS record.
 *
 * Required env:
 * - CIRS_HANDWRITTEN_CUSTOMER_ID
 * - CIRS_HANDWRITTEN_RECORD_ID
 *
 * Does not use CIRS_HANDWRITTEN_NOTE_ID; creates a new note in-run and deletes it at the end.
 *
 * Run: npx playwright test tests/CIRS/handwrittenNotes/existingRecordHandwrittenNotesCrud.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

type CrudStepOutcome = 'Passed' | 'Failed' | 'Not reached';

type HandwrittenCrudSummary = {
    add: CrudStepOutcome;
    read: CrudStepOutcome;
    edit: CrudStepOutcome;
    delete: CrudStepOutcome;
    noteId: string | null;
    customerId: string | null;
    recordId: string | null;
};

const hasCrudEnv =
    Boolean(process.env.CIRS_HANDWRITTEN_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.CIRS_HANDWRITTEN_RECORD_ID?.trim());

function logCrudSummary(summary: HandwrittenCrudSummary): void {
    console.log('CIRS_HANDWRITTEN_CRUD_SUMMARY', JSON.stringify(summary));
}

async function attachCrudEvidence(
    testInfo: TestInfo,
    payload: HandwrittenNotesRunResult | HandwrittenNotesRunEvidence | Record<string, unknown>
): Promise<void> {
    try {
        await testInfo.attach('cirs-handwritten-notes-crud', {
            body: handwrittenNotesEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-handwritten-notes-crud:', error);
    }
}

function buildRecordContext(
    customerId: string,
    recordId: string,
    recordUrl: string
): CirsRecordContext {
    return {
        customerId,
        customerName: '',
        customerFurigana: '',
        recordId,
        recordUrl,
        createAttempted: false,
        createConfirmed: true,
        recordIdentitySource: 'route_only',
        customerIdFromApi: null,
        apiParseNotes: ['existing_record_handwritten_crud'],
    };
}

test('existing record: CIRS handwritten note CRUD', async ({ page }, testInfo) => {
    test.skip(
        !hasCrudEnv,
        'Set CIRS_HANDWRITTEN_CUSTOMER_ID and CIRS_HANDWRITTEN_RECORD_ID for staging CRUD runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { customerId, recordId } = resolveHandwrittenNotesRecordFromEnv();

    const summary: HandwrittenCrudSummary = {
        add: 'Not reached',
        read: 'Not reached',
        edit: 'Not reached',
        delete: 'Not reached',
        noteId: null,
        customerId,
        recordId,
    };

    let latestHandwrittenEvidence: HandwrittenNotesRunEvidence | null = null;
    let createResult: HandwrittenNotesRunResult | null = null;
    let activeStep: keyof Pick<HandwrittenCrudSummary, 'add' | 'read' | 'edit' | 'delete'> = 'add';

    try {
        await test.step('login existing account', async () => {
            await loginExistingUserForPart2(page, account);
        });

        await test.step('open existing record', async () => {
            await openExistingCirsRecordForHandwrittenNotes(page, { customerId, recordId });
        });

        activeStep = 'add';
        createResult = await test.step('Add', async () => {
            return runCirsHandwrittenNotesFlow(
                page,
                buildRecordContext(customerId, recordId, page.url()),
                {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestHandwrittenEvidence = evidence;
                    },
                }
            );
        });
        summary.add = 'Passed';
        summary.noteId = createResult.noteId;

        activeStep = 'read';
        await test.step('Read verification', async () => {
            if (!createResult!.noteId) {
                throw new Error(
                    'Handwritten CRUD stopped: create flow completed without noteId (save_memo identity or list verification required for update/delete).'
                );
            }
            if (!createResult!.createServerConfirmed) {
                throw new Error('Handwritten CRUD stopped: create server confirmation missing.');
            }
            if (!createResult!.createIdentityVerified) {
                throw new Error(
                    `Handwritten CRUD stopped: created note not verified in loaded list (status=${createResult!.listVerificationStatus}).`
                );
            }
            if (createResult!.listVerificationStatus !== 'verified') {
                throw new Error(
                    `Handwritten CRUD stopped: list verification status=${createResult!.listVerificationStatus}, expected verified.`
                );
            }
        });
        summary.read = 'Passed';

        activeStep = 'edit';
        const updateResult = await test.step('Edit', async () => {
            return runCirsHandwrittenNoteUpdateFlow(
                page,
                {
                    customerId: createResult!.customerId,
                    recordId: createResult!.recordId,
                    noteId: createResult!.noteId!,
                },
                {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestHandwrittenEvidence = evidence;
                    },
                }
            );
        });
        if (!updateResult.updateVerified) {
            throw new Error('Handwritten CRUD stopped: update flow returned updateVerified=false.');
        }
        summary.edit = 'Passed';

        activeStep = 'delete';
        const deleteResult = await test.step('Delete', async () => {
            return runCirsHandwrittenNoteDeleteFlow(
                page,
                {
                    customerId: createResult!.customerId,
                    recordId: createResult!.recordId,
                    noteId: createResult!.noteId!,
                },
                {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestHandwrittenEvidence = evidence;
                    },
                }
            );
        });
        if (!deleteResult.deleteVerified) {
            throw new Error('Handwritten CRUD stopped: delete flow returned deleteVerified=false.');
        }
        summary.delete = 'Passed';

        const finalPayload: HandwrittenNotesRunResult = {
            ...createResult,
            updateVerified: updateResult.updateVerified,
            deleteVerified: deleteResult.deleteVerified,
            noteRetainedOnStaging: deleteResult.noteRetainedOnStaging,
        };
        await attachCrudEvidence(testInfo, finalPayload);
        logCrudSummary(summary);
    } catch (error) {
        summary[activeStep] = 'Failed';
        if (latestHandwrittenEvidence) {
            await attachCrudEvidence(testInfo, {
                crudSummary: summary,
                handwrittenEvidence: latestHandwrittenEvidence,
            });
        } else if (createResult) {
            await attachCrudEvidence(testInfo, {
                ...createResult,
                crudSummary: summary,
            });
        } else {
            await attachCrudEvidence(testInfo, { crudSummary: summary });
        }
        logCrudSummary(summary);
        throw error;
    }
});
