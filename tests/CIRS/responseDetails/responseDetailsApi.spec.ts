import { test, expect } from '@playwright/test';
import {
    buildResponseDetailRequestUrl,
    parseResponseDetailJsonBody,
    responseDetailRequestMatches,
    RESPONSE_DETAIL_API_ORIGIN,
} from './responseDetailsApi';

const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('responseDetailRequestMatches requires origin, path, GET, and customerServiceId', () => {
    const url = buildResponseDetailRequestUrl(RECORD_ID);
    expect(
        responseDetailRequestMatches({ url: () => url, method: () => 'GET' }, RECORD_ID)
    ).toBe(true);
    expect(
        responseDetailRequestMatches({ url: () => url, method: () => 'POST' }, RECORD_ID)
    ).toBe(false);
    expect(
        responseDetailRequestMatches(
            {
                url: () => `${RESPONSE_DETAIL_API_ORIGIN}/customer_interaction_record/other`,
                method: () => 'GET',
            },
            RECORD_ID
        )
    ).toBe(false);
    expect(
        responseDetailRequestMatches(
            {
                url: () =>
                    `${RESPONSE_DETAIL_API_ORIGIN}/customer_interaction_record/response_detail?customerServiceId=wrong-id`,
                method: () => 'GET',
            },
            RECORD_ID
        )
    ).toBe(false);
});

test('parseResponseDetailJsonBody accepts null as no_details', () => {
    expect(parseResponseDetailJsonBody(null, RECORD_ID)).toEqual({
        kind: 'no_details',
        recordId: RECORD_ID,
    });
});

test('parseResponseDetailJsonBody validates loaded schema and record id', () => {
    expect(
        parseResponseDetailJsonBody(
            { customerServiceId: RECORD_ID, details: 'hello' },
            RECORD_ID
        )
    ).toEqual({ kind: 'loaded', recordId: RECORD_ID, details: 'hello' });

    expect(() =>
        parseResponseDetailJsonBody({ customerServiceId: 'other', details: 'x' }, RECORD_ID)
    ).toThrow(/customerServiceId other/);

    expect(() => parseResponseDetailJsonBody({ customerServiceId: RECORD_ID }, RECORD_ID)).toThrow(
        /missing string details/
    );

    expect(() => parseResponseDetailJsonBody('string-body', RECORD_ID)).toThrow(
        /must be null or an object/
    );
});
