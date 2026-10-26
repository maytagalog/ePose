import { test, expect } from '@playwright/test';
import {
    assertKarteCustomerLookupNotFoundHttp,
    assertKarteCustomerLookupPresentHttp,
    assertKarteDeleteHttpSuccess,
    CustomerDeleteVerificationError,
    type CreatedCustomerRef,
} from './customerFlow';

const REF = {
    customerId: '8e71de1a-7550-4bf8-8bca-91a90834507d',
    name: 'E2E Add Customer 1792753817963 Edited',
    furigana: 'テストクウイミソソササ',
} satisfies CreatedCustomerRef;

test('karte/customer present: rejects ResourceNotFound (still deleted / missing)', () => {
    expect(() =>
        assertKarteCustomerLookupPresentHttp(
            404,
            {
                errors: [
                    {
                        message: 'Customer not found',
                        extensions: { errorCode: 'ResourceNotFound', statusCode: 404 },
                    },
                ],
            },
            REF
        )
    ).toThrow(CustomerDeleteVerificationError);
});

test('karte/customer notFound: rejects HTTP 200 (customer still exists)', () => {
    expect(() =>
        assertKarteCustomerLookupNotFoundHttp(200, {
            id: REF.customerId,
            fullName: REF.name,
        } as never)
    ).toThrow(CustomerDeleteVerificationError);
});

test('karte/customer notFound: rejects auth failures', () => {
    expect(() =>
        assertKarteCustomerLookupNotFoundHttp(403, {
            errors: [{ extensions: { errorCode: 'Forbidden', statusCode: 403 } }],
        })
    ).toThrow(CustomerDeleteVerificationError);
});

test('karte/customer notFound: accepts verified 404 ResourceNotFound', () => {
    expect(() =>
        assertKarteCustomerLookupNotFoundHttp(404, {
            errors: [
                {
                    message: 'Customer not found',
                    extensions: { errorCode: 'ResourceNotFound', statusCode: 404 },
                },
            ],
        })
    ).not.toThrow();
});

test('karte/customer present: accepts matching record', () => {
    expect(() =>
        assertKarteCustomerLookupPresentHttp(200, {
            id: REF.customerId,
            fullName: REF.name,
            furiganaFullName: REF.furigana,
        }, REF)
    ).not.toThrow();
});

test('karte/delete: rejects non-2xx and error payloads', () => {
    expect(() => assertKarteDeleteHttpSuccess(403, { errors: [{}] })).toThrow(
        CustomerDeleteVerificationError
    );
    expect(() =>
        assertKarteDeleteHttpSuccess(200, {
            errors: [{ message: 'failed' }],
        })
    ).toThrow(CustomerDeleteVerificationError);
    expect(() => assertKarteDeleteHttpSuccess(200, null)).not.toThrow();
});
