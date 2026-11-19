import { test, expect } from '@playwright/test';
import {
    buildPart1ForgotPasswordVerifiedPayload,
    logPart1ForgotPasswordVerified,
    logPart1RunCompleted,
    logPart1RunStarted,
} from './smokePart1Reporting';

test('logPart1RunStarted allowlists safe fields', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        logPart1RunStarted('  allocated@example.com  ');
    } finally {
        console.log = original;
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^PART1_RUN_STARTED /);
    const payload = JSON.parse(lines[0]!.replace(/^PART1_RUN_STARTED /, ''));
    expect(payload.accountEmail).toBe('allocated@example.com');
    expect(payload.accountSource).toBe('new_registration');
    expect(payload.smokePart).toBe(1);
    expect(payload.deferredReasons['Referral Coupon Copy']).toBe('pending product issue');
    expect(payload.activeCoverage).toContain('Forgot Password');
    expect(payload.activeCoverage).toContain('Logout');
    expect(JSON.stringify(payload)).not.toMatch(/Passw0rd|token/i);
});

test('logPart1ForgotPasswordVerified allowlists safe fields', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        logPart1ForgotPasswordVerified({
            accountEmail: ' reset-user@example.com ',
            resetSuccessVerified: true,
            loginAfterResetVerified: true,
            customersVisibleVerified: true,
        });
    } finally {
        console.log = original;
    }
    expect(lines[0]).toMatch(/^PART1_FORGOT_PASSWORD_VERIFIED /);
    const payload = JSON.parse(lines[0]!.replace(/^PART1_FORGOT_PASSWORD_VERIFIED /, ''));
    expect(payload.accountEmail).toBe('reset-user@example.com');
    expect(payload).toEqual(
        buildPart1ForgotPasswordVerifiedPayload({
            accountEmail: 'reset-user@example.com',
            resetSuccessVerified: true,
            loginAfterResetVerified: true,
            customersVisibleVerified: true,
        })
    );
    expect(JSON.stringify(payload)).not.toMatch(/P@ssw0rd|Passw0rd|042913|otp/i);
});

test('logPart1RunCompleted distinguishes registration vs final email', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        logPart1RunCompleted({
            registrationEmail: 'initial@example.com',
            finalAccountEmail: 'changed@example.com',
            accountWithdrawn: true,
            finalPageUrl: 'https://app-stg.epose.com/login',
        });
    } finally {
        console.log = original;
    }
    const payload = JSON.parse(lines[0]!.replace(/^PART1_RUN_COMPLETED /, ''));
    expect(payload.registrationEmail).toBe('initial@example.com');
    expect(payload.finalAccountEmail).toBe('changed@example.com');
    expect(payload.accountWithdrawn).toBe(true);
    expect(payload.finalPathname).toBe('/login');
});

test('accountWithdrawn remains false unless explicitly set', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        logPart1RunCompleted({
            registrationEmail: 'a@example.com',
            finalAccountEmail: 'a@example.com',
            accountWithdrawn: false,
        });
    } finally {
        console.log = original;
    }
    const payload = JSON.parse(lines[0]!.replace(/^PART1_RUN_COMPLETED /, ''));
    expect(payload.accountWithdrawn).toBe(false);
});
