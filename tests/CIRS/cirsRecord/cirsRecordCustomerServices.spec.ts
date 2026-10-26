import { test, expect } from '@playwright/test';
import {
    parseFetchCustomerServicesResponse,
    parseFetchRequestCustomerId,
    requestMatchesFetchCaptureKind,
    resolveCustomerServiceIndex,
    CirsRecordCustomerServicesError,
} from './cirsRecordCustomerServices';

test('parseFetchCustomerServicesResponse preserves API order', () => {
    const snapshot = parseFetchCustomerServicesResponse([
        {
            customerServiceId: 'f11b84fe-d4aa-4bc3-8cfa-90a566c158cb',
            id: 366,
            createdAt: '2026-10-25T13:49:33.000Z',
        },
        {
            customerServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            id: 365,
            createdAt: '2026-10-25T13:00:00.000Z',
        },
    ]);
    expect(snapshot.customerServiceIdsInApiOrder).toEqual([
        'f11b84fe-d4aa-4bc3-8cfa-90a566c158cb',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
    expect(snapshot.entries[0]?.numericId).toBe(366);
});

test('parseFetchRequestCustomerId reads customerId query param (trace shape)', () => {
    const url =
        'https://api-stg.epose.com/customer_interaction_record/fetch_customer_services?customerId=ce3f36fd-07c3-4eda-ad87-35631acc39cc&orderBy=desc&limit=3';
    expect(parseFetchRequestCustomerId(url)).toBe('ce3f36fd-07c3-4eda-ad87-35631acc39cc');
    expect(requestMatchesFetchCaptureKind(url, 'customer_preview')).toBe(true);
    expect(requestMatchesFetchCaptureKind(url, 'full_list')).toBe(false);
});

test('resolveCustomerServiceIndex distinguishes duplicate display metadata', () => {
    const snapshot = parseFetchCustomerServicesResponse([
        { customerServiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id: 1, createdAt: '2026-10-25T13:00:00.000Z' },
        { customerServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', id: 2, createdAt: '2026-10-25T13:00:00.000Z' },
    ]);
    expect(resolveCustomerServiceIndex(snapshot, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBe(1);
    expect(() => resolveCustomerServiceIndex(snapshot, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toThrow(
        CirsRecordCustomerServicesError
    );
});
