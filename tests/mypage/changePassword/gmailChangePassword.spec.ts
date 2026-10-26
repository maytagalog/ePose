import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    CHANGE_EMAIL_OTP_SUBJECT_MARKER,
    PASSWORD_RESET_BODY_MARKER,
    buildEmailCandidateFromRecord,
    extractChangeEmailVerificationCodeFromBody,
    isChangeEmailOtpCandidate,
    isPasswordResetOtpCandidate,
    selectMatchingGmailMessage,
    setGmailClientOverride,
    waitForPasswordResetVerificationCode,
    type GmailMessageRecord,
} from '../../../utils/gmail';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const PASSWORD_RESET_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'passwordResetOtpEmail.html'),
    'utf8'
);

function encodePayloadBody(text: string): string {
    return Buffer.from(text, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function msg(
    id: string,
    internalDate: number,
    headers: Array<{ name: string; value: string }>,
    htmlBody: string
): GmailMessageRecord {
    return {
        id,
        internalDate,
        headers,
        payload: {
            mimeType: 'text/html',
            body: { data: encodePayloadBody(htmlBody) },
        },
    };
}

test.afterEach(() => {
    setGmailClientOverride(null);
});

test('password reset: accepts exact recipient with パスワード再設定 marker', () => {
    const target = 'a.ardva.rkomonstrosesquip1230000@gmail.com';
    const candidate = buildEmailCandidateFromRecord(
        msg(
            'pw-1',
            2_000_000,
            [
                { name: 'To', value: target },
                { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
            ],
            PASSWORD_RESET_HTML
        )
    );
    expect(isPasswordResetOtpCandidate(candidate)).toBe(true);
    expect(isChangeEmailOtpCandidate(candidate)).toBe(false);
    expect(extractChangeEmailVerificationCodeFromBody(PASSWORD_RESET_HTML)).toBe('482913');
});

test('password reset: rejects change-email body without password marker', () => {
    const html = `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} 認証コード：111111</p>`;
    const candidate = buildEmailCandidateFromRecord(
        msg('ce-1', 2_000_000, [{ name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER }], html)
    );
    expect(isPasswordResetOtpCandidate(candidate)).toBe(false);
    expect(isChangeEmailOtpCandidate(candidate)).toBe(true);
});

test('polling: first batch unsuitable then fresh password-reset mail', async () => {
    const target = 'a.ardva.rkomonstrosesquip1230000@gmail.com';
    const notBefore = 1_500_000;
    const stale = msg(
        'stale',
        1_000_000,
        [{ name: 'To', value: target }, { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER }],
        `<p>${PASSWORD_RESET_BODY_MARKER} 認証コード 111111</p>`
    );
    const changeEmail = msg(
        'change-email',
        2_000_000,
        [{ name: 'To', value: target }, { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER }],
        `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} 認証コード 222222</p>`
    );
    const fresh = msg(
        'fresh',
        2_100_000,
        [{ name: 'To', value: target }, { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER }],
        PASSWORD_RESET_HTML
    );

    let listCalls = 0;
    setGmailClientOverride({
        listMessages: async () => {
            listCalls += 1;
            if (listCalls === 1) {
                return [stale, changeEmail].map((r) => ({ id: r.id }));
            }
            return [stale, changeEmail, fresh].map((r) => ({ id: r.id }));
        },
        getMessage: async (id: string) =>
            [stale, changeEmail, fresh].find((r) => r.id === id)!,
    });

    const code = await waitForPasswordResetVerificationCode(target, notBefore, 5000, 100);
    expect(code).toBe('482913');
    expect(listCalls).toBeGreaterThanOrEqual(2);

    const selected = selectMatchingGmailMessage(
        [stale, changeEmail, fresh],
        target,
        CHANGE_EMAIL_OTP_SUBJECT_MARKER,
        {
            recipient: target,
            notBeforeEpochMs: notBefore,
            candidatePredicate: isPasswordResetOtpCandidate,
        }
    );
    expect(selected?.body).toContain('482913');
});
