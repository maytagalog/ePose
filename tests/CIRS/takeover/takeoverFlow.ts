import { expect, type Locator, type Page } from '@playwright/test';
import {
    assertCirsRecordDetailContainer,
    INTERACTION_RECORD_DETAIL_URL,
    parseCustomerIdFromUrl,
    parseInteractionRecordIdFromUrl,
} from '../cirsRecord/cirsRecordFlow';
import { dismissAutomaticLimitDialogIfPresent } from '../responseDetails/responseDetailsFlow';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    assertHandoverRowDisplaysContent,
    captureHandoverIdsInSection,
    handoverItem,
    resolveNewHandoverIdFromSection,
} from './takeoverCreateIdentity';
import { assertHandoverFullListReady, assertHandoverPreviewListReady } from './takeoverListReadiness';
import { TakeoverRunTracker, type TakeoverCrudSummary, type TakeoverRunEvidence, logTakeoverCrudSummary } from './takeoverReporting';
import { TakeoverFlowError } from './takeoverErrors';
import { resolveTakeoverSmokeContent } from './takeoverSmokeText';
import {
    CUSTOMER_SERVICE_ID_ATTR,
    ENTITY_TYPE_ATTR,
    HANDOVER_ENTITY_TYPE,
    HANDOVER_ID_ATTR,
    HANDOVER_TEST_IDS,
    OPERATION_ATTR,
} from './takeoverTestIds';

export { TakeoverFlowError } from './takeoverErrors';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;
const TOAST_TIMEOUT_MS = 20000;

export type TakeoverCrudInput = {
    customerId: string;
    recordId: string;
};

export type TakeoverCrudRunResult = {
    customerId: string;
    recordId: string;
    handoverId: string | null;
    createVerified: boolean;
    readVerified: boolean;
    updateVerified: boolean;
    deleteVerified: boolean;
    handoverRetainedOnStaging: boolean;
    crudSummary: TakeoverCrudSummary;
};

export type RunTakeoverCrudOptions = {
    accountEmail?: string | null;
    onEvidence?: (evidence: TakeoverRunEvidence) => void;
};

export function takeoverEvidenceAttachmentBody(
    payload: TakeoverCrudRunResult | TakeoverRunEvidence | Record<string, unknown>
): string {
    return JSON.stringify(payload, null, 2);
}

function handoverSection(page: Page): Locator {
    return page.getByTestId(HANDOVER_TEST_IDS.section);
}

async function assertRecordIdentity(page: Page, customerId: string, recordId: string): Promise<void> {
    await expect(page).toHaveURL(INTERACTION_RECORD_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    const routeRecordId = parseInteractionRecordIdFromUrl(page.url());
    if (routeCustomerId !== customerId || routeRecordId !== recordId) {
        throw new TakeoverFlowError(
            `Record identity mismatch (route customer=${routeCustomerId} record=${routeRecordId}).`
        );
    }
    await assertCirsRecordDetailContainer(page, customerId, recordId);
}

function operationSuccessToast(page: Page, operation: 'create' | 'update' | 'delete'): Locator {
    return page.locator(
        `[data-testid="${HANDOVER_TEST_IDS.operationSuccess}"][${OPERATION_ATTR}="${operation}"][${ENTITY_TYPE_ATTR}="${HANDOVER_ENTITY_TYPE}"]`
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
): Promise<Locator> {
    const toast = operationSuccessToast(page, operation);
    await expect
        .poll(
            async () => {
                if (!(await toast.isVisible())) {
                    return false;
                }
                const op = await toast.getAttribute(OPERATION_ATTR);
                const entityType = await toast.getAttribute(ENTITY_TYPE_ATTR);
                return op === operation && entityType === HANDOVER_ENTITY_TYPE;
            },
            {
                timeout: TOAST_TIMEOUT_MS,
                message: `operation-success ${operation} for ${HANDOVER_ENTITY_TYPE}`,
            }
        )
        .toBe(true);
    return toast;
}

async function clickAndWaitForOperationSuccess(
    page: Page,
    operation: 'create' | 'update' | 'delete',
    click: () => Promise<void>
): Promise<Locator> {
    await assertNoVisibleOperationSuccessToast(page, operation);
    const toastPromise = waitForFreshOperationSuccessToast(page, operation);
    try {
        await click();
        return await toastPromise;
    } catch (error) {
        await toastPromise.catch(() => undefined);
        throw error;
    }
}

export async function waitForHandoverListItem(
    section: Locator,
    handoverId: string,
    recordId: string
): Promise<void> {
    const item = handoverItem(section, handoverId);
    await expect(item, `exact handover item for handoverId=${handoverId}`).toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(item).toHaveAttribute(CUSTOMER_SERVICE_ID_ATTR, recordId);
}

/** @deprecated */
export const waitForTakeoverListItem = waitForHandoverListItem;

async function openHandoverPreviewItem(
    section: Locator,
    handoverId: string,
    recordId: string
): Promise<void> {
    await waitForHandoverListItem(section, handoverId, recordId);
    await handoverItem(section, handoverId).click({ timeout: ACTION_TIMEOUT_MS });
}

function handoverEditorDialog(page: Page): Locator {
    return page.getByRole('dialog').filter({
        has: page.getByTestId(HANDOVER_TEST_IDS.editor),
    });
}

async function assertCreateEditorOpen(page: Page): Promise<{ dialog: Locator; editor: Locator }> {
    const dialog = handoverEditorDialog(page);
    await expect(dialog, 'handover editor dialog').toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const editor = dialog.getByTestId(HANDOVER_TEST_IDS.editor);
    await expect(editor).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const existingId = (await editor.getAttribute(HANDOVER_ID_ATTR))?.trim() ?? '';
    if (existingId.length > 0) {
        throw new TakeoverFlowError(
            'Create editor must not carry data-handover-id (existing notes only per contract).'
        );
    }
    await expect(editor.getByTestId(HANDOVER_TEST_IDS.date)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(editor.getByTestId(HANDOVER_TEST_IDS.assignee)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return { dialog, editor };
}

async function assertEditEditorOpen(
    page: Page,
    handoverId: string
): Promise<{ dialog: Locator; editor: Locator }> {
    const dialog = handoverEditorDialog(page);
    await expect(dialog, 'handover editor dialog').toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const editor = dialog.getByTestId(HANDOVER_TEST_IDS.editor);
    await expect(editor).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(editor).toHaveAttribute(HANDOVER_ID_ATTR, handoverId);
    await expect(editor.getByTestId(HANDOVER_TEST_IDS.content)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return { dialog, editor };
}

async function assertDialogFooterActionReady(
    dialog: Locator,
    actionTestId: typeof HANDOVER_TEST_IDS.update | typeof HANDOVER_TEST_IDS.delete
): Promise<Locator> {
    const button = dialog.getByTestId(actionTestId);
    await expect(button, `handover footer action ${actionTestId}`).toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(button).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(button).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    return button;
}

async function assertHandoverAbsent(section: Locator, handoverId: string): Promise<void> {
    await expect(
        handoverItem(section, handoverId),
        `handover item absent for handoverId=${handoverId}`
    ).toHaveCount(0, { timeout: ACTION_TIMEOUT_MS });
}

async function assertOtherHandoversPreserved(
    section: Locator,
    recordId: string,
    handoverIdsToRetain: string[]
): Promise<void> {
    for (const retainedId of handoverIdsToRetain) {
        await waitForHandoverListItem(section, retainedId, recordId);
    }
}

async function assertHandoverListAfterDelete(
    section: Locator,
    recordId: string,
    deletedHandoverId: string,
    otherHandoverIdsBeforeDelete: string[]
): Promise<void> {
    const otherIds = otherHandoverIdsBeforeDelete.filter((id) => id !== deletedHandoverId);
    await assertHandoverAbsent(section, deletedHandoverId);
    await assertOtherHandoversPreserved(section, recordId, otherIds);
}

async function returnToRecordFromHandoverList(page: Page): Promise<void> {
    const back = page.getByTestId(HANDOVER_TEST_IDS.back).locator('visible=true').first();
    await expect(back).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await back.click({ timeout: ACTION_TIMEOUT_MS });
}

export async function openExistingCirsRecordForTakeover(
    page: Page,
    input: TakeoverCrudInput & { appOrigin?: string }
): Promise<void> {
    const origin = input.appOrigin ?? STG_APP_ORIGIN;
    await page.goto(`${origin}/customers/${input.customerId}/interaction-records/${input.recordId}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await dismissAutomaticLimitDialogIfPresent(page);
    await assertRecordIdentity(page, input.customerId, input.recordId);
}

export function resolveTakeoverRecordFromEnv(): TakeoverCrudInput {
    const customerId = process.env.CIRS_TAKEOVER_CUSTOMER_ID?.trim() ?? '';
    const recordId = process.env.CIRS_TAKEOVER_RECORD_ID?.trim() ?? '';
    if (!customerId || !recordId) {
        throw new Error(
            'Set CIRS_TAKEOVER_CUSTOMER_ID and CIRS_TAKEOVER_RECORD_ID before running takeover CRUD specs.'
        );
    }
    return { customerId, recordId };
}

export async function runCirsTakeoverCrudFlow(
    page: Page,
    input: TakeoverCrudInput,
    options?: RunTakeoverCrudOptions
): Promise<TakeoverCrudRunResult> {
    const { customerId, recordId } = input;
    const tracker = new TakeoverRunTracker({ accountEmail: options?.accountEmail ?? null });
    const { createText, updateText } = resolveTakeoverSmokeContent();
    const summary: TakeoverCrudSummary = {
        create: 'Not reached',
        read: 'Not reached',
        update: 'Not reached',
        delete: 'Not reached',
        handoverId: null,
        customerId,
        recordId,
    };
    const publish = (): void => {
        options?.onEvidence?.(tracker.toEvidence());
    };

    tracker.logCrudStarted(new URL(page.url()).pathname, customerId, recordId);
    publish();

    let handoverId: string | null = null;
    let handoverIdsBeforeDelete: string[] = [];
    let activeStep: keyof Omit<TakeoverCrudSummary, 'handoverId' | 'customerId' | 'recordId'> = 'create';

    try {
        tracker.stepStarted('identity verification');
        await assertRecordIdentity(page, customerId, recordId);
        tracker.stepCompleted('identity verification');
        publish();

        const section = handoverSection(page);
        await assertHandoverPreviewListReady(page, 'before_create_baseline');
        handoverIdsBeforeDelete = await captureHandoverIdsInSection(section);
        const idsBeforeCreate = new Set(handoverIdsBeforeDelete);

        activeStep = 'create';
        tracker.stepStarted('handover create');
        tracker.createAttempted = true;
        publish();

        await section.getByTestId(HANDOVER_TEST_IDS.create).click({ timeout: ACTION_TIMEOUT_MS });
        const { dialog: createDialog, editor: createEditor } = await assertCreateEditorOpen(page);
        const contentField = createEditor.getByTestId(HANDOVER_TEST_IDS.content);
        await expect(contentField).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await contentField.fill(createText);

        const createSubmit = createDialog.getByTestId(HANDOVER_TEST_IDS.submit);
        await expect(createSubmit).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await expect(createSubmit).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
        await clickAndWaitForOperationSuccess(page, 'create', () =>
            createDialog.getByTestId(HANDOVER_TEST_IDS.submit).click({ timeout: ACTION_TIMEOUT_MS })
        );

        tracker.createServerConfirmed = true;
        publish();

        await assertRecordIdentity(page, customerId, recordId);
        await assertHandoverPreviewListReady(page, 'after_create_preview');

        const created = await resolveNewHandoverIdFromSection(section, recordId, idsBeforeCreate, createText);
        handoverId = created.handoverId;
        tracker.handoverIdentitySource = created.source;

        tracker.handoverId = handoverId;
        summary.handoverId = handoverId;
        tracker.createIdentityVerified = true;
        tracker.listVerificationStatus = 'verified';
        tracker.logCreateVerified(new URL(page.url()).pathname);
        summary.create = 'Passed';
        publish();

        activeStep = 'read';
        tracker.stepStarted('handover read');
        publish();

        await assertHandoverPreviewListReady(page, 'before_read_list');
        await waitForHandoverListItem(section, handoverId, recordId);
        await section.getByTestId(HANDOVER_TEST_IDS.listOpen).click({ timeout: ACTION_TIMEOUT_MS });
        const listPanel = page.getByTestId(HANDOVER_TEST_IDS.list);
        await expect(listPanel).toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });
        await assertHandoverFullListReady(page, 'read_full_list');
        await expect(page).toHaveURL(INTERACTION_RECORD_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
        expect(parseCustomerIdFromUrl(page.url())).toBe(customerId);
        expect(parseInteractionRecordIdFromUrl(page.url())).toBe(recordId);
        await assertHandoverRowDisplaysContent(listPanel, handoverId, recordId, createText);
        await returnToRecordFromHandoverList(page);
        await assertRecordIdentity(page, customerId, recordId);

        tracker.logReadVerified(new URL(page.url()).pathname);
        summary.read = 'Passed';
        publish();

        activeStep = 'update';
        tracker.stepStarted('handover update');
        tracker.updateAttempted = true;
        publish();

        await assertHandoverPreviewListReady(page, 'after_create_preview');
        await openHandoverPreviewItem(section, handoverId, recordId);
        const { dialog: editDialog, editor: editEditor } = await assertEditEditorOpen(page, handoverId);
        await editEditor.getByTestId(HANDOVER_TEST_IDS.content).fill(updateText);
        await assertDialogFooterActionReady(editDialog, HANDOVER_TEST_IDS.update);
        await clickAndWaitForOperationSuccess(page, 'update', () =>
            editDialog.getByTestId(HANDOVER_TEST_IDS.update).click({ timeout: ACTION_TIMEOUT_MS })
        );
        await assertRecordIdentity(page, customerId, recordId);
        await assertHandoverPreviewListReady(page, 'after_create_preview');
        await assertHandoverRowDisplaysContent(section, handoverId, recordId, updateText);

        tracker.logUpdateVerified(new URL(page.url()).pathname);
        summary.update = 'Passed';
        publish();

        activeStep = 'delete';
        tracker.stepStarted('handover delete');
        tracker.deleteAttempted = true;
        publish();

        await openHandoverPreviewItem(section, handoverId, recordId);
        const { dialog: deleteDialog } = await assertEditEditorOpen(page, handoverId);
        await assertDialogFooterActionReady(deleteDialog, HANDOVER_TEST_IDS.delete);
        await clickAndWaitForOperationSuccess(page, 'delete', () =>
            deleteDialog.getByTestId(HANDOVER_TEST_IDS.delete).click({ timeout: ACTION_TIMEOUT_MS })
        );
        tracker.deleteServerConfirmed = true;
        publish();

        await assertRecordIdentity(page, customerId, recordId);
        await assertHandoverPreviewListReady(page, 'after_delete_preview');
        await assertHandoverListAfterDelete(section, recordId, handoverId, handoverIdsBeforeDelete);

        tracker.logDeleteVerified(new URL(page.url()).pathname, true);
        summary.delete = 'Passed';
        logTakeoverCrudSummary(summary);
        publish();

        return {
            customerId,
            recordId,
            handoverId,
            createVerified: true,
            readVerified: true,
            updateVerified: true,
            deleteVerified: true,
            handoverRetainedOnStaging: false,
            crudSummary: summary,
        };
    } catch (error) {
        summary[activeStep] = 'Failed';
        if (handoverId) {
            summary.handoverId = handoverId;
            tracker.handoverId = handoverId;
        }
        tracker.logCrudFailed(error, new URL(page.url()).pathname);
        if (activeStep === 'create') {
            tracker.logCreateFailed(error, new URL(page.url()).pathname);
        } else if (activeStep === 'read') {
            tracker.logReadFailed(error, new URL(page.url()).pathname);
        } else if (activeStep === 'update') {
            tracker.logUpdateFailed(error, new URL(page.url()).pathname);
        } else if (activeStep === 'delete') {
            tracker.deleteServerConfirmed = tracker.deleteServerConfirmed || false;
            tracker.logDeleteFailed(error, new URL(page.url()).pathname);
        }
        logTakeoverCrudSummary(summary);
        publish();
        throw error;
    }
}
