import { test, expect } from '@playwright/test';
import { isConfiguredLoginRoute, type LogoutEnvironment } from './logoutFlow';

const FIXTURE_ENV: LogoutEnvironment = {
    appOrigin: 'https://logout-fixture.test',
    loginUrl: 'https://logout-fixture.test/login',
    protectedCustomersUrl: 'https://logout-fixture.test/customers',
};

test('isConfiguredLoginRoute accepts configured origin and pathname with varying query', () => {
    expect(isConfiguredLoginRoute('https://logout-fixture.test/login?return=%2Fcustomers', FIXTURE_ENV)).toBe(
        true
    );
    expect(isConfiguredLoginRoute('https://logout-fixture.test/login', FIXTURE_ENV)).toBe(true);
});

test('isConfiguredLoginRoute rejects another origin with /login pathname', () => {
    expect(isConfiguredLoginRoute('https://other-origin.example/login', FIXTURE_ENV)).toBe(false);
});

test('isConfiguredLoginRoute rejects correct origin with /login-other pathname', () => {
    expect(isConfiguredLoginRoute('https://logout-fixture.test/login-other', FIXTURE_ENV)).toBe(false);
});
