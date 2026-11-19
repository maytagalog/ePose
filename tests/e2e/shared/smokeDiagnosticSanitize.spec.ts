import { test, expect } from '@playwright/test';
import { pickResponseCorrelationHeaders, redactUrlQueryToken, sanitizeApiResponseBody } from './smokeDiagnosticSanitize';

test('redactUrlQueryToken redacts token query param', () => {
    const url =
        'https://app-stg.epose.com/shared-report-comparison?token=secret-value&foo=bar';
    expect(redactUrlQueryToken(url)).toBe(
        'https://app-stg.epose.com/shared-report-comparison?token=%5Bredacted%5D&foo=bar'
    );
});

test('sanitizeApiResponseBody redacts sensitive keys', () => {
    const raw = JSON.stringify({
        errors: [{ message: 'fail', extensions: { errorCode: 'ResourceNotFound' } }],
        token: 'must-hide',
    });
    const sanitized = sanitizeApiResponseBody(raw);
    expect(sanitized).toContain('ResourceNotFound');
    expect(sanitized).toContain('[redacted]');
    expect(sanitized).not.toContain('must-hide');
});

test('pickResponseCorrelationHeaders keeps only safe correlation headers', () => {
    const picked = pickResponseCorrelationHeaders({
        'x-request-id': 'abc',
        authorization: 'Bearer secret',
        'content-type': 'application/json',
    });
    expect(picked).toEqual({ 'x-request-id': 'abc' });
    expect(picked.authorization).toBeUndefined();
});