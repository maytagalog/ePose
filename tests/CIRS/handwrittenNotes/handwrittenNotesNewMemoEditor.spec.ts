import { test, expect } from '@playwright/test';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import { expectedNewHandwrittenMemoUrl } from './handwrittenNotesFlow';

test('expectedNewHandwrittenMemoUrl uses staging-style origin and memo/new path', () => {
    const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const recordId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    expect(expectedNewHandwrittenMemoUrl(STG_APP_ORIGIN, customerId, recordId)).toBe(
        `${STG_APP_ORIGIN}/customers/${customerId}/interaction-records/${recordId}/memo/new`
    );
});
