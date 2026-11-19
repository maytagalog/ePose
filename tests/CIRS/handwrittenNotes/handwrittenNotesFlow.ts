import { expect, type Locator, type Page } from '@playwright/test';
import {
    assertCirsRecordDetailContainer,
    INTERACTION_RECORD_DETAIL_URL,
    parseCustomerIdFromUrl,
    parseInteractionRecordIdFromUrl,
    type CirsRecordContext,
} from '../cirsRecord/cirsRecordFlow';
import { dismissAutomaticLimitDialogIfPresent } from '../responseDetails/responseDetailsFlow';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    beginHandwrittenNoteCreateResponseCapture,
    consumeHandwrittenNoteCreateResponseCapture,
    waitForHandwrittenNoteListItem,
} from './handwrittenNotesCreateIdentity';
import { awaitHandwrittenNoteListSettled } from './handwrittenNotesListReadiness';
import {
    captureCanvasContentSignature,
    runHandwrittenDrawingSequence,
} from './handwrittenNotesDrawing';
import {
    HandwrittenNotesRunTracker,
    type HandwrittenNotesRunEvidence,
    type HandwrittenNotesListVerificationStatus,
} from './handwrittenNotesReporting';
import { HandwrittenNotesFlowError } from './handwrittenNotesErrors';
import {
    CUSTOMER_SERVICE_ID_ATTR,
    ENTITY_ID_ATTR,
    ENTITY_TYPE_ATTR,
    HANDWRITTEN_ENTITY_TYPE,
    HANDWRITTEN_TEST_IDS,
    NOTE_ID_ATTR,
    OPERATION_ATTR,
} from './handwrittenNotesTestIds';

export { HandwrittenNotesFlowError } from './handwrittenNotesErrors';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;
const TOAST_TIMEOUT_MS = 20000;

export type HandwrittenNotesRunResult = {
    customerId: string;
    recordId: string;
    noteId: string | null;
    createAttempted: boolean;
    createServerConfirmed: boolean;
    createIdentityVerified: boolean;
    noteIdentitySource: HandwrittenNotesRunEvidence['noteIdentitySource'];
    listVerificationStatus: HandwrittenNotesListVerificationStatus;
    createVerified: boolean;
    updateVerified: boolean;
    deleteVerified: boolean;
    noteRetainedOnStaging: boolean;
};

export type HandwrittenNoteUpdateInput = {
    customerId: string;
    recordId: string;
    noteId: string;
};

export type HandwrittenNotesUpdateRunResult = {
    customerId: string;
    recordId: string;
    noteId: string;
    updateAttempted: true;
    updateVerified: boolean;
    noteRetainedOnStaging: true;
};

export type HandwrittenNoteDeleteInput = {
    customerId: string;
    recordId: string;
    noteId: string;
};

export type HandwrittenNotesDeleteRunResult = {
    customerId: string;
    recordId: string;
    noteId: string;
    deleteAttempted: true;
    deleteServerConfirmed: boolean;
    deleteVerified: boolean;
    noteRetainedOnStaging: boolean;
};

export type RunHandwrittenNotesOptions = {
    accountEmail?: string | null;
    onEvidence?: (evidence: HandwrittenNotesRunEvidence) => void;
};

export function handwrittenNotesEvidenceAttachmentBody(
    payload: HandwrittenNotesRunResult | HandwrittenNotesRunEvidence | Record<string, unknown>
): string {
    return JSON.stringify(payload, null, 2);
}

function handwrittenSection(page: Page): Locator {
    return page.getByTestId(HANDWRITTEN_TEST_IDS.section);
}

function resolveRecordAppOrigin(page: Page, recordContext: CirsRecordContext): string {
    if (recordContext.recordUrl) {
        try {
            return new URL(recordContext.recordUrl).origin;
        } catch {
            /* fall through */
        }
    }
    return new URL(page.url()).origin;
}

export function expectedNewHandwrittenMemoUrl(
    appOrigin: string,
    customerId: string,
    recordId: string
): string {
    return `${appOrigin}/customers/${customerId}/interaction-records/${recordId}/memo/new`;
}

export function expectedExistingHandwrittenMemoUrl(
    appOrigin: string,
    customerId: string,
    recordId: string,
    noteId: string
): string {
    return `${appOrigin}/customers/${customerId}/interaction-records/${recordId}/memo/${noteId}`;
}

async function assertNewHandwrittenNoteEditor(
    page: Page,
    appOrigin: string,
    customerId: string,
    recordId: string
): Promise<Locator> {
    await expect(page).toHaveURL(expectedNewHandwrittenMemoUrl(appOrigin, customerId, recordId), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });

    const editor = page.getByTestId(HANDWRITTEN_TEST_IDS.editor);
    await expect(editor, 'exactly one cirs-handwritten-editor').toHaveCount(1, {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect(editor).toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });

    const serviceId = (await editor.getAttribute(CUSTOMER_SERVICE_ID_ATTR))?.trim() ?? '';
    if (serviceId.length > 0 && serviceId !== recordId) {
        throw new HandwrittenNotesFlowError(
            `New-note editor ${CUSTOMER_SERVICE_ID_ATTR} mismatch (expected=${recordId}, received=${serviceId}).`
        );
    }

    return editor;
}

async function assertRecordIdentity(page: Page, customerId: string, recordId: string): Promise<void> {
    await expect(page).toHaveURL(INTERACTION_RECORD_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    const routeRecordId = parseInteractionRecordIdFromUrl(page.url());
    if (routeCustomerId !== customerId || routeRecordId !== recordId) {
        throw new HandwrittenNotesFlowError(
            `Record identity mismatch (route customer=${routeCustomerId} record=${routeRecordId}).`
        );
    }
    await assertCirsRecordDetailContainer(page, customerId, recordId);
}

function operationSuccessToast(page: Page, operation: 'create' | 'update' | 'delete'): Locator {
    return page.locator(
        `[data-testid="${HANDWRITTEN_TEST_IDS.operationSuccess}"][${OPERATION_ATTR}="${operation}"][${ENTITY_TYPE_ATTR}="${HANDWRITTEN_ENTITY_TYPE}"]`
    );
}

async function assertNoVisibleOperationSuccessToast(
    page: Page,
    operation: 'create' | 'update' | 'delete'
): Promise<void> {
    const toast = operationSuccessToast(page, operation);
    await expect(toast, `stale operation-success toast absent before ${operation}`).not.toBeVisible({
        timeout: 2000,
    });
}

async function waitForFreshOperationSuccessToast(
    page: Page,
    operation: 'create' | 'update' | 'delete'
): Promise<void> {
    const toast = operationSuccessToast(page, operation);
    await expect
        .poll(
            async () => {
                if (!(await toast.isVisible())) {
                    return false;
                }
                const op = await toast.getAttribute(OPERATION_ATTR);
                const entityType = await toast.getAttribute(ENTITY_TYPE_ATTR);
                return op === operation && entityType === HANDWRITTEN_ENTITY_TYPE;
            },
            {
                timeout: TOAST_TIMEOUT_MS,
                message: `operation-success ${operation} for ${HANDWRITTEN_ENTITY_TYPE}`,
            }
        )
        .toBe(true);
}

async function clickAndWaitForOperationSuccess(
    page: Page,
    operation: 'create' | 'update' | 'delete',
    click: () => Promise<void>
): Promise<void> {
    await assertNoVisibleOperationSuccessToast(page, operation);
    const toastPromise = waitForFreshOperationSuccessToast(page, operation);
    try {
        await click();
        await toastPromise;
    } catch (error) {
        await toastPromise.catch(() => undefined);
        throw error;
    }
}

function parseSingleLayerSignature(payload: string): { nonTransparentPixels: number; hash: number } {
    const [pixelPart, hashPart] = payload.split(':');
    return {
        nonTransparentPixels: Number.parseInt(pixelPart ?? '0', 10),
        hash: Number.parseInt(hashPart ?? '0', 10),
    };
}

function parseCanvasSignature(signature: string): { nonTransparentPixels: number; hash: number } {
    if (signature.includes('|')) {
        const layers = signature.split('|').map((part) => {
            const payload = part.slice(part.indexOf(':') + 1);
            return parseSingleLayerSignature(payload);
        });
        return {
            nonTransparentPixels: layers.reduce((sum, layer) => sum + layer.nonTransparentPixels, 0),
            hash: layers.reduce((combined, layer) => (combined ^ layer.hash) | 0, 0),
        };
    }
    return parseSingleLayerSignature(signature);
}

function isUnavailableCanvasSignature(signature: string): boolean {
    return (
        signature === 'not-a-canvas' ||
        signature === 'unsupported-konva-canvas-count' ||
        signature.startsWith('no-2d-context') ||
        signature.startsWith('empty-size')
    );
}

async function assertCanvasDrawingChanged(
    canvas: Locator,
    beforeSignature: string,
    contextLabel: string
): Promise<void> {
    if (isUnavailableCanvasSignature(beforeSignature)) {
        throw new HandwrittenNotesFlowError(
            `${contextLabel}: cannot use pixel signature on non-canvas cirs-handwritten-canvas host (signature=${beforeSignature}).`
        );
    }
    const afterSignature = await captureCanvasContentSignature(canvas);
    if (isUnavailableCanvasSignature(afterSignature)) {
        throw new HandwrittenNotesFlowError(
            `${contextLabel}: canvas pixel signature unavailable after drawing (signature=${afterSignature}).`
        );
    }
    const before = parseCanvasSignature(beforeSignature);
    const after = parseCanvasSignature(afterSignature);
    if (after.nonTransparentPixels <= 0) {
        throw new HandwrittenNotesFlowError(
            `${contextLabel}: canvas has no non-transparent pixels after drawing (signature=${afterSignature}).`
        );
    }
    if (beforeSignature === afterSignature) {
        throw new HandwrittenNotesFlowError(
            `${contextLabel}: canvas pixel signature unchanged after drawing (before=${beforeSignature}, after=${afterSignature}).`
        );
    }
    if (
        !beforeSignature.includes('|') &&
        after.nonTransparentPixels === before.nonTransparentPixels &&
        after.hash === before.hash
    ) {
        throw new HandwrittenNotesFlowError(
            `${contextLabel}: canvas pixel signature unchanged after drawing (before=${beforeSignature}, after=${afterSignature}).`
        );
    }
}

/** Create-only flow (update/delete are separate flows). */
export async function runCirsHandwrittenNotesFlow(
    page: Page,
    recordContext: CirsRecordContext,
    options?: RunHandwrittenNotesOptions
): Promise<HandwrittenNotesRunResult> {
    const tracker = new HandwrittenNotesRunTracker({ accountEmail: options?.accountEmail ?? null });
    const { customerId, recordId } = recordContext;
    const appOrigin = resolveRecordAppOrigin(page, recordContext);
    const publish = (): void => {
        options?.onEvidence?.(tracker.toEvidence());
    };

    tracker.logStarted(new URL(page.url()).pathname, customerId, recordId);
    publish();

    try {
        tracker.stepStarted('identity verification');
        await assertRecordIdentity(page, customerId, recordId);
        tracker.stepCompleted('identity verification');
        publish();

        const section = handwrittenSection(page);
        await awaitHandwrittenNoteListSettled(page, 'before_create');

        tracker.stepStarted('note create');
        tracker.createAttempted = true;
        publish();

        await section.getByTestId(HANDWRITTEN_TEST_IDS.create).click({ timeout: ACTION_TIMEOUT_MS });
        const editor = await assertNewHandwrittenNoteEditor(page, appOrigin, customerId, recordId);

        const canvas = editor.getByTestId(HANDWRITTEN_TEST_IDS.canvas);
        const signatureBeforeCreate = await captureCanvasContentSignature(canvas);
        await runHandwrittenDrawingSequence(page, canvas, 'create');
        await assertCanvasDrawingChanged(canvas, signatureBeforeCreate, 'create drawing');

        const createCapture = beginHandwrittenNoteCreateResponseCapture(page);
        const identityPromise = consumeHandwrittenNoteCreateResponseCapture(createCapture, recordId);
        await clickAndWaitForOperationSuccess(page, 'create', () =>
            editor.getByTestId(HANDWRITTEN_TEST_IDS.save).click({ timeout: ACTION_TIMEOUT_MS })
        );

        const identity = await identityPromise;
        await assertRecordIdentity(page, customerId, recordId);
        const createServerConfirmed = true;
        let listVerificationStatus: HandwrittenNotesListVerificationStatus = 'skipped_no_note_id';
        let createIdentityVerified = false;

        if (identity?.noteId) {
            await awaitHandwrittenNoteListSettled(page, 'after_create_list_verify');
            await waitForHandwrittenNoteListItem(section, identity.noteId, recordId);
            listVerificationStatus = 'verified';
            createIdentityVerified = true;
        } else {
            listVerificationStatus = 'unverified';
        }

        tracker.logCreateOnlyCompleted(new URL(page.url()).pathname, {
            noteId: identity?.noteId ?? null,
            noteIdentitySource: identity?.source ?? null,
            createServerConfirmed,
            createIdentityVerified,
            listVerificationStatus,
        });
        publish();

        return {
            customerId,
            recordId,
            noteId: identity?.noteId ?? null,
            createAttempted: true,
            createServerConfirmed,
            createIdentityVerified,
            noteIdentitySource: identity?.source ?? null,
            listVerificationStatus,
            createVerified: createServerConfirmed,
            updateVerified: false,
            deleteVerified: false,
            noteRetainedOnStaging: true,
        };
    } catch (error) {
        tracker.logFailed(error, new URL(page.url()).pathname);
        publish();
        throw error;
    }
}

export type OpenExistingRecordForHandwrittenInput = {
    customerId: string;
    recordId: string;
    appOrigin?: string;
};

export async function openExistingCirsRecordForHandwrittenNotes(
    page: Page,
    input: OpenExistingRecordForHandwrittenInput
): Promise<void> {
    const origin = input.appOrigin ?? STG_APP_ORIGIN;
    await page.goto(`${origin}/customers/${input.customerId}/interaction-records/${input.recordId}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await dismissAutomaticLimitDialogIfPresent(page);
    await assertRecordIdentity(page, input.customerId, input.recordId);
}

export function resolveHandwrittenNotesRecordFromEnv(): OpenExistingRecordForHandwrittenInput {
    const customerId = process.env.CIRS_HANDWRITTEN_CUSTOMER_ID?.trim() ?? '';
    const recordId = process.env.CIRS_HANDWRITTEN_RECORD_ID?.trim() ?? '';
    if (!customerId || !recordId) {
        throw new Error(
            'Set CIRS_HANDWRITTEN_CUSTOMER_ID and CIRS_HANDWRITTEN_RECORD_ID before running the handwritten standalone spec.'
        );
    }
    return { customerId, recordId };
}

async function openHandwrittenNoteItemById(
    section: Locator,
    noteId: string,
    recordId: string
): Promise<void> {
    const item = section.locator(
        `[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${noteId}"]`
    );
    await expect(item, `exact handwritten item for noteId=${noteId}`).toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(item).toHaveAttribute(CUSTOMER_SERVICE_ID_ATTR, recordId);
    await item.click({ timeout: ACTION_TIMEOUT_MS });
}

async function assertExistingHandwrittenNoteEditor(
    page: Page,
    appOrigin: string,
    customerId: string,
    recordId: string,
    noteId: string
): Promise<Locator> {
    await expect(page).toHaveURL(
        expectedExistingHandwrittenMemoUrl(appOrigin, customerId, recordId, noteId),
        { timeout: NAVIGATION_TIMEOUT_MS }
    );

    const editor = page.getByTestId(HANDWRITTEN_TEST_IDS.editor);
    await expect(editor, 'exactly one cirs-handwritten-editor').toHaveCount(1, {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect(editor).toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });
    await assertEditorIdentity(editor, noteId, recordId);
    return editor;
}

async function assertEditorIdentity(
    editor: Locator,
    noteId: string,
    recordId: string
): Promise<void> {
    await expect(editor).toHaveAttribute(NOTE_ID_ATTR, noteId);
    const serviceId = (await editor.getAttribute(CUSTOMER_SERVICE_ID_ATTR))?.trim() ?? '';
    if (serviceId.length > 0 && serviceId !== recordId) {
        throw new HandwrittenNotesFlowError(
            `Existing-note editor ${CUSTOMER_SERVICE_ID_ATTR} mismatch (expected=${recordId}, received=${serviceId}).`
        );
    }
}

/** Update-only flow. Caller must already be on the target CIRS record detail. */
export async function runCirsHandwrittenNoteUpdateFlow(
    page: Page,
    input: HandwrittenNoteUpdateInput,
    options?: RunHandwrittenNotesOptions
): Promise<HandwrittenNotesUpdateRunResult> {
    const { customerId, recordId, noteId } = input;
    const tracker = new HandwrittenNotesRunTracker({ accountEmail: options?.accountEmail ?? null });
    const publish = (): void => {
        options?.onEvidence?.(tracker.toEvidence());
    };

    tracker.logUpdateStarted(new URL(page.url()).pathname, customerId, recordId, noteId);
    publish();

    try {
        tracker.stepStarted('identity verification');
        await assertRecordIdentity(page, customerId, recordId);
        tracker.stepCompleted('identity verification');
        publish();

        const section = handwrittenSection(page);
        await awaitHandwrittenNoteListSettled(page, 'before_create');

        const appOrigin = new URL(page.url()).origin;

        await openHandwrittenNoteItemById(section, noteId, recordId);
        const editor = await assertExistingHandwrittenNoteEditor(
            page,
            appOrigin,
            customerId,
            recordId,
            noteId
        );

        const canvas = editor.getByTestId(HANDWRITTEN_TEST_IDS.canvas);
        const signatureBeforeUpdate = await captureCanvasContentSignature(canvas);
        await runHandwrittenDrawingSequence(page, canvas, 'edit');
        await assertCanvasDrawingChanged(canvas, signatureBeforeUpdate, 'update drawing');

        await clickAndWaitForOperationSuccess(page, 'update', () =>
            editor.getByTestId(HANDWRITTEN_TEST_IDS.save).click({ timeout: ACTION_TIMEOUT_MS })
        );

        await assertRecordIdentity(page, customerId, recordId);

        tracker.logUpdateVerified(new URL(page.url()).pathname);
        publish();

        return {
            customerId,
            recordId,
            noteId,
            updateAttempted: true,
            updateVerified: true,
            noteRetainedOnStaging: true,
        };
    } catch (error) {
        tracker.logUpdateFailed(error, new URL(page.url()).pathname);
        tracker.logFailed(error, new URL(page.url()).pathname);
        publish();
        throw error;
    }
}

export function resolveHandwrittenNoteUpdateFromEnv(): HandwrittenNoteUpdateInput {
    const customerId = process.env.CIRS_HANDWRITTEN_CUSTOMER_ID?.trim() ?? '';
    const recordId = process.env.CIRS_HANDWRITTEN_RECORD_ID?.trim() ?? '';
    const noteId = process.env.CIRS_HANDWRITTEN_NOTE_ID?.trim() ?? '';
    if (!customerId || !recordId || !noteId) {
        throw new Error(
            'Set CIRS_HANDWRITTEN_CUSTOMER_ID, CIRS_HANDWRITTEN_RECORD_ID, and CIRS_HANDWRITTEN_NOTE_ID for update-only staging runs.'
        );
    }
    return { customerId, recordId, noteId };
}

async function captureHandwrittenNoteIds(section: Locator): Promise<string[]> {
    const items = section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"]`);
    const count = await items.count();
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
        const noteId = (await items.nth(index).getAttribute(NOTE_ID_ATTR))?.trim() ?? '';
        if (noteId.length > 0) {
            ids.push(noteId);
        }
    }
    return ids;
}

async function assertNoteAbsent(section: Locator, noteId: string): Promise<void> {
    await expect(
        section.locator(`[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${noteId}"]`),
        `handwritten item absent for noteId=${noteId}`
    ).toHaveCount(0, { timeout: ACTION_TIMEOUT_MS });
}

async function assertOtherHandwrittenNotesPreserved(
    section: Locator,
    recordId: string,
    noteIdsToRetain: string[]
): Promise<void> {
    for (const retainedId of noteIdsToRetain) {
        await waitForHandwrittenNoteListItem(section, retainedId, recordId);
    }
}

/** Returns the visible role=dialog inside the metadata wrapper (Ant modal-root pattern). */
async function assertHandwrittenDeleteDialogReady(page: Page, noteId: string): Promise<Locator> {
    const wrapper = page.getByTestId(HANDWRITTEN_TEST_IDS.deleteDialog);
    await expect(wrapper, 'exactly one cirs-delete-dialog wrapper').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    const root = wrapper.first();
    await expect(root).toHaveAttribute(ENTITY_TYPE_ATTR, HANDWRITTEN_ENTITY_TYPE);
    await expect(root).toHaveAttribute(ENTITY_ID_ATTR, noteId);

    const visibleDialog = root.getByRole('dialog').locator('visible=true');
    await expect(
        visibleDialog,
        'exactly one visible role=dialog inside cirs-delete-dialog wrapper'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    return visibleDialog.first();
}

async function assertHandwrittenListAfterDelete(
    section: Locator,
    recordId: string,
    deletedNoteId: string,
    otherNoteIdsBeforeDelete: string[]
): Promise<void> {
    const otherIds = otherNoteIdsBeforeDelete.filter((id) => id !== deletedNoteId);
    await assertNoteAbsent(section, deletedNoteId);
    await assertOtherHandwrittenNotesPreserved(section, recordId, otherIds);
}

async function reloadSameCirsRecord(page: Page, customerId: string, recordId: string): Promise<void> {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/customers/${customerId}/interaction-records/${recordId}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await dismissAutomaticLimitDialogIfPresent(page);
    await assertRecordIdentity(page, customerId, recordId);
}

/** Delete-only flow. Caller must already be on the target CIRS record detail. */
export async function runCirsHandwrittenNoteDeleteFlow(
    page: Page,
    input: HandwrittenNoteDeleteInput,
    options?: RunHandwrittenNotesOptions
): Promise<HandwrittenNotesDeleteRunResult> {
    const { customerId, recordId, noteId } = input;
    const tracker = new HandwrittenNotesRunTracker({ accountEmail: options?.accountEmail ?? null });
    const publish = (): void => {
        options?.onEvidence?.(tracker.toEvidence());
    };

    tracker.logDeleteStarted(new URL(page.url()).pathname, customerId, recordId, noteId);
    publish();

    let deleteServerConfirmed = false;

    try {
        tracker.stepStarted('identity verification');
        await assertRecordIdentity(page, customerId, recordId);
        tracker.stepCompleted('identity verification');
        publish();

        const section = handwrittenSection(page);
        await awaitHandwrittenNoteListSettled(page, 'initial_snapshot');
        const noteIdsBeforeDelete = await captureHandwrittenNoteIds(section);
        if (!noteIdsBeforeDelete.includes(noteId)) {
            throw new HandwrittenNotesFlowError(
                `Target noteId=${noteId} not present in loaded handwritten list (found=${noteIdsBeforeDelete.join(',') || 'none'}).`
            );
        }

        const appOrigin = new URL(page.url()).origin;

        await openHandwrittenNoteItemById(section, noteId, recordId);
        const editor = await assertExistingHandwrittenNoteEditor(
            page,
            appOrigin,
            customerId,
            recordId,
            noteId
        );

        await editor.getByTestId(HANDWRITTEN_TEST_IDS.delete).click({ timeout: ACTION_TIMEOUT_MS });
        const deleteDialog = await assertHandwrittenDeleteDialogReady(page, noteId);

        tracker.deleteAttempted = true;
        publish();

        await clickAndWaitForOperationSuccess(page, 'delete', () =>
            deleteDialog
                .getByTestId(HANDWRITTEN_TEST_IDS.deleteConfirm)
                .click({ timeout: ACTION_TIMEOUT_MS })
        );
        deleteServerConfirmed = true;
        tracker.deleteServerConfirmed = true;
        publish();

        await assertRecordIdentity(page, customerId, recordId);

        await awaitHandwrittenNoteListSettled(page, 'after_delete');
        await assertHandwrittenListAfterDelete(section, recordId, noteId, noteIdsBeforeDelete);

        await reloadSameCirsRecord(page, customerId, recordId);
        await awaitHandwrittenNoteListSettled(page, 'after_reload');
        const sectionAfterReload = handwrittenSection(page);
        await assertHandwrittenListAfterDelete(
            sectionAfterReload,
            recordId,
            noteId,
            noteIdsBeforeDelete
        );

        tracker.logDeleteVerified(new URL(page.url()).pathname);
        publish();

        return {
            customerId,
            recordId,
            noteId,
            deleteAttempted: true,
            deleteServerConfirmed,
            deleteVerified: true,
            noteRetainedOnStaging: false,
        };
    } catch (error) {
        tracker.deleteServerConfirmed = deleteServerConfirmed;
        if (deleteServerConfirmed) {
            tracker.noteRetainedOnStaging = true;
        }
        tracker.logDeleteFailed(error, new URL(page.url()).pathname);
        tracker.logFailed(error, new URL(page.url()).pathname);
        publish();
        throw error;
    }
}

export function resolveHandwrittenNoteDeleteFromEnv(): HandwrittenNoteDeleteInput {
    const customerId = process.env.CIRS_HANDWRITTEN_CUSTOMER_ID?.trim() ?? '';
    const recordId = process.env.CIRS_HANDWRITTEN_RECORD_ID?.trim() ?? '';
    const noteId = process.env.CIRS_HANDWRITTEN_NOTE_ID?.trim() ?? '';
    if (!customerId || !recordId || !noteId) {
        throw new Error(
            'Set CIRS_HANDWRITTEN_CUSTOMER_ID, CIRS_HANDWRITTEN_RECORD_ID, and CIRS_HANDWRITTEN_NOTE_ID for delete-only staging runs.'
        );
    }
    return { customerId, recordId, noteId };
}
