import { test, expect } from '@playwright/test';
import {
    assertProfileValuesEqual,
    expectedValuesAfterSingleFieldUpdate,
    MyPageProfilePersistenceError,
} from './myPageProfileFlow';

test('profile orchestration: single-field update preserves other fields', () => {
    const before = {
        personInCharge: 'PIC A',
        furigana: 'テストアア',
        displayName: 'Display A',
    };
    const expected = expectedValuesAfterSingleFieldUpdate(before, 'furigana', 'テストウウ');
    expect(expected.personInCharge).toBe('PIC A');
    expect(expected.displayName).toBe('Display A');
    expect(expected.furigana).toBe('テストウウ');
    assertProfileValuesEqual(expected, expected, 'self-check');
});

test('profile orchestration: detect persistence mismatch', () => {
    const expected = {
        personInCharge: 'PIC A',
        furigana: 'テストアア',
        displayName: 'Display A',
    };
    const actual = { ...expected, displayName: 'Stale' };
    expect(() => assertProfileValuesEqual(expected, actual, 'unit-test')).toThrow(
        MyPageProfilePersistenceError
    );
});
