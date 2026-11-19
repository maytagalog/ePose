import type { Locator, Response } from '@playwright/test';
import { HandwrittenNotesFlowError } from './handwrittenNotesErrors';
import {
    CUSTOMER_SERVICE_ID_ATTR,
    HANDWRITTEN_TEST_IDS,
    NOTE_ID_ATTR,
} from './handwrittenNotesTestIds';

export const SAVE_MEMO_URL = 'https://api-stg.epose.com/customer_interaction_record/save_memo';

export type HandwrittenNoteIdentitySource = 'save_memo_response';

export type HandwrittenNoteCreateIdentity = {
    noteId: string;
    source: HandwrittenNoteIdentitySource;
};

export type HandwrittenNoteCreateResponseCapture = {
    responsePromise: Promise<Response | null>;
};

const NOTE_ID_UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSaveMemoPostResponse(response: Response): boolean {
    return response.request().method() === 'POST' && response.url() === SAVE_MEMO_URL;
}

export function extractCustomerServiceIdFromSaveMemoRequest(postData: string): string | null {
    const trimmed = postData.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const body = JSON.parse(trimmed) as Record<string, unknown>;
        const candidate = body.customerServiceId ?? body.customer_service_id;
        return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
    } catch {
        return null;
    }
}

export type SaveMemoResponseBody = {
    id: string;
    customerServiceId: string;
};

export function parseSaveMemoCreateResponseBody(
    rawText: string,
    expectedRecordId: string
): SaveMemoResponseBody {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        throw new HandwrittenNotesFlowError('save_memo response was not JSON.');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new HandwrittenNotesFlowError('save_memo response JSON was not an object.');
    }
    const record = parsed as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const customerServiceId =
        typeof record.customerServiceId === 'string' ? record.customerServiceId.trim() : '';
    if (!NOTE_ID_UUID.test(id)) {
        throw new HandwrittenNotesFlowError(`save_memo response id was not a UUID (id=${JSON.stringify(id)}).`);
    }
    if (!customerServiceId) {
        throw new HandwrittenNotesFlowError('save_memo response missing customerServiceId.');
    }
    if (customerServiceId !== expectedRecordId) {
        throw new HandwrittenNotesFlowError(
            `save_memo response customerServiceId mismatch (expected=${expectedRecordId}, received=${customerServiceId}).`
        );
    }
    return { id, customerServiceId };
}

/** Register immediately before Save — matches staging save_memo POST only. */
export function beginHandwrittenNoteCreateResponseCapture(page: import('@playwright/test').Page): HandwrittenNoteCreateResponseCapture {
    const responsePromise = page
        .waitForResponse(
            (response) => isSaveMemoPostResponse(response),
            { timeout: 30000 }
        )
        .catch(() => null);
    return { responsePromise };
}

export async function consumeHandwrittenNoteCreateResponseCapture(
    capture: HandwrittenNoteCreateResponseCapture,
    expectedRecordId: string
): Promise<HandwrittenNoteCreateIdentity | null> {
    const response = await capture.responsePromise;
    if (!response || !response.ok()) {
        return null;
    }
    if (!isSaveMemoPostResponse(response)) {
        return null;
    }

    const requestRecordId = extractCustomerServiceIdFromSaveMemoRequest(response.request().postData() ?? '');
    if (!requestRecordId) {
        throw new HandwrittenNotesFlowError('save_memo request missing customerServiceId ownership field.');
    }
    if (requestRecordId !== expectedRecordId) {
        throw new HandwrittenNotesFlowError(
            `save_memo request customerServiceId mismatch (expected=${expectedRecordId}, received=${requestRecordId}).`
        );
    }

    let rawText = '';
    try {
        rawText = await response.text();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new HandwrittenNotesFlowError(`save_memo response body read failed: ${message}`);
    }

    const parsed = parseSaveMemoCreateResponseBody(rawText, expectedRecordId);
    return { noteId: parsed.id, source: 'save_memo_response' };
}

/** @deprecated Editor identity is not reliable after save navigation. */
export function tryParseNoteIdFromMemoUrl(url: string): string | null {
    const match = url.match(/\/memo\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i);
    return match?.[1] ?? null;
}

export async function waitForHandwrittenNoteListItem(
    section: Locator,
    noteId: string,
    recordId: string,
    timeoutMs = 20000
): Promise<void> {
    const item = section.locator(
        `[data-testid="${HANDWRITTEN_TEST_IDS.item}"][${NOTE_ID_ATTR}="${noteId}"]`
    );
    const { expect } = await import('@playwright/test');
    await expect(item).toBeVisible({ timeout: timeoutMs });
    await expect(item).toHaveAttribute(CUSTOMER_SERVICE_ID_ATTR, recordId, { timeout: timeoutMs });
}
