import { test, expect } from '@playwright/test';
import {
    extractCustomerServiceIdFromSaveMemoRequest,
    parseSaveMemoCreateResponseBody,
    tryParseNoteIdFromMemoUrl,
    consumeHandwrittenNoteCreateResponseCapture,
    isSaveMemoPostResponse,
    SAVE_MEMO_URL,
} from './handwrittenNotesCreateIdentity';

const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTE_ID = '204e4ab8-6ffb-4430-846c-4472aa83cfd6';

test('parseSaveMemoCreateResponseBody validates id and customerServiceId', () => {
    const parsed = parseSaveMemoCreateResponseBody(
        JSON.stringify({ id: NOTE_ID, customerServiceId: RECORD_ID }),
        RECORD_ID
    );
    expect(parsed.id).toBe(NOTE_ID);
    expect(parsed.customerServiceId).toBe(RECORD_ID);
});

test('extractCustomerServiceIdFromSaveMemoRequest reads customerServiceId from JSON body', () => {
    expect(
        extractCustomerServiceIdFromSaveMemoRequest(JSON.stringify({ customerServiceId: RECORD_ID }))
    ).toBe(RECORD_ID);
});

test('tryParseNoteIdFromMemoUrl accepts memo routes with UUID only', () => {
    const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
        tryParseNoteIdFromMemoUrl(
            `https://app.example.com/customers/c1/interaction-records/r1/memo/${noteId}`
        )
    ).toBe(noteId);
    expect(
        tryParseNoteIdFromMemoUrl('https://app.example.com/customers/c1/interaction-records/r1/memo/new')
    ).toBeNull();
});

test('consumeHandwrittenNoteCreateResponseCapture parses save_memo when request and response match record', async () => {
    const response = {
        ok: () => true,
        url: () => SAVE_MEMO_URL,
        request: () => ({
            method: () => 'POST',
            postData: () => JSON.stringify({ customerServiceId: RECORD_ID }),
        }),
        text: async () => JSON.stringify({ id: NOTE_ID, customerServiceId: RECORD_ID }),
    } as import('@playwright/test').Response;

    expect(isSaveMemoPostResponse(response)).toBe(true);

    const identity = await consumeHandwrittenNoteCreateResponseCapture(
        { responsePromise: Promise.resolve(response) },
        RECORD_ID
    );
    expect(identity).toEqual({ noteId: NOTE_ID, source: 'save_memo_response' });
});

test('consumeHandwrittenNoteCreateResponseCapture returns null when no response', async () => {
    const identity = await consumeHandwrittenNoteCreateResponseCapture(
        { responsePromise: Promise.resolve(null) },
        RECORD_ID
    );
    expect(identity).toBeNull();
});
