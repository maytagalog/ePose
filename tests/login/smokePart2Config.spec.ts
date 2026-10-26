import { test, expect } from '@playwright/test';
import {
    SmokePart2ConfigError,
    SMOKE_PART2_ACCOUNT_EMAIL,
    resolveSmokePart2Account,
    validateSmokePart2AccountFields,
} from '../e2e/shared/smokePart2Config';

test('resolveSmokePart2Account exposes configured email without throwing', () => {
    const account = resolveSmokePart2Account();
    expect(account.email).toBe(SMOKE_PART2_ACCOUNT_EMAIL.trim());
    expect(account.password.length).toBeGreaterThan(0);
});

test('validateSmokePart2AccountFields rejects unconfigured placeholder email', () => {
    expect(() =>
        validateSmokePart2AccountFields(
            'UNCONFIGURED_PART2@example.com',
            'secret'
        )
    ).toThrow(SmokePart2ConfigError);
});

test('validateSmokePart2AccountFields rejects empty password', () => {
    expect(() =>
        validateSmokePart2AccountFields('user@example.com', '')
    ).toThrow(SmokePart2ConfigError);
});
