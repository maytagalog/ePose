import { test, expect } from '@playwright/test';
import { GmailAuthError, isGmailAuthenticationFailure } from '../../../../utils/gmail';

test('isGmailAuthenticationFailure detects invalid_grant in Gaxios message', () => {
    const error = new Error('invalid_grant');
    expect(isGmailAuthenticationFailure(error)).toBe(true);
});

test('isGmailAuthenticationFailure detects GmailAuthError instance', () => {
    expect(isGmailAuthenticationFailure(new GmailAuthError('reauthorize'))).toBe(true);
});

test('isGmailAuthenticationFailure does not treat delivery timeout as auth failure', () => {
    const timeout = new Error(
        'Timeout waiting for analysis report share email to user@example.com with subject containing "姿勢分析レポート"'
    );
    expect(isGmailAuthenticationFailure(timeout)).toBe(false);
});
