import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    CHANGE_EMAIL_OTP_SUBJECT_MARKER,
    buildEmailCandidateFromRecord,
    extractChangeEmailVerificationCodeFromBody,
    extractChangeEmailVerificationCodeFromCandidate,
    headersMatchExactRecipient,
    isChangeEmailOtpCandidate,
    selectMatchingGmailMessage,
    setGmailClientOverride,
    waitForChangeEmailVerificationCode,
    waitForEmail,
    type GmailMessageRecord,
} from '../../../utils/gmail';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const OTP_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailOtpEmail.html'),
    'utf8'
);
const STAGING_STRUCTURE_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailOtpEmailStagingStructure.html'),
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
            body: {
                data: encodePayloadBody(htmlBody),
            },
        },
    };
}

function multipartMsg(
    id: string,
    internalDate: number,
    headers: Array<{ name: string; value: string }>,
    plainBody: string,
    htmlBody: string
): GmailMessageRecord {
    return {
        id,
        internalDate,
        headers,
        payload: {
            mimeType: 'multipart/alternative',
            parts: [
                {
                    mimeType: 'text/plain',
                    body: { data: encodePayloadBody(plainBody) },
                },
                {
                    mimeType: 'text/html',
                    body: { data: encodePayloadBody(htmlBody) },
                },
            ],
        },
    };
}

test.afterEach(() => {
    setGmailClientOverride(null);
});

test('exact recipient: rejects substring and display-name false matches', () => {
    expect(
        headersMatchExactRecipient(
            [{ name: 'To', value: 'other@gmail.com' }],
            'aa.rdvark@gmail.com'
        )
    ).toBe(false);
    expect(
        headersMatchExactRecipient(
            [{ name: 'To', value: 'aa.rdvark@gmail.com extra@gmail.com' }],
            'aa.rdvark@gmail.com'
        )
    ).toBe(false);
    expect(
        headersMatchExactRecipient(
            [{ name: 'To', value: 'Display <aa.rdvark@gmail.com>' }],
            'aa.rdvark@gmail.com'
        )
    ).toBe(true);
    expect(
        headersMatchExactRecipient(
            [{ name: 'delivered-to', value: 'AA.rdvark@gmail.com' }],
            'aa.rdvark@gmail.com'
        )
    ).toBe(true);
});

test('selection: skips stale, malformed date, and password-reset candidates', () => {
    const target = 'a.ar.dvarkomonstrosesquip1230000@gmail.com';
    const notBefore = 1_000_000;
    const records = [
        msg(
            'newest-bad',
            2_000_000,
            [
                { name: 'To', value: target },
                { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
            ],
            `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} パスワード再設定 認証コード 111111</p>`
        ),
        msg(
            'older-good',
            1_500_000,
            [
                { name: 'To', value: target },
                { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
            ],
            `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} 認証コード 222222</p>`
        ),
        msg(
            'stale',
            500_000,
            [
                { name: 'To', value: target },
                { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
            ],
            `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} 認証コード 333333</p>`
        ),
        msg(
            'malformed-date',
            0,
            [
                { name: 'To', value: target },
                { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
            ],
            `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} 認証コード 444444</p>`
        ),
    ];

    const selected = selectMatchingGmailMessage(records, target, CHANGE_EMAIL_OTP_SUBJECT_MARKER, {
        recipient: target,
        notBeforeEpochMs: notBefore,
        candidatePredicate: isChangeEmailOtpCandidate,
    });

    expect(selected?.body).toContain('222222');
});

test('polling: continues across unsuitable batches within one timeout', async () => {
    const target = 'a.ar.dvark@gmail.com';
    let poll = 0;
    setGmailClientOverride({
        listMessages: async () => [{ id: 'm1' }],
        getMessage: async () => {
            poll += 1;
            if (poll === 1) {
                return msg(
                    'm1',
                    Date.now(),
                    [
                        { name: 'To', value: target },
                        { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
                    ],
                    `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} パスワード再設定 認証コード 999999</p>`
                );
            }
            return msg(
                'm1',
                Date.now(),
                [
                    { name: 'To', value: target },
                    { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
                ],
                `<p>${CHANGE_EMAIL_OTP_SUBJECT_MARKER} 認証コード 555555</p>`
            );
        },
    });

    const result = await waitForEmail(
        target,
        CHANGE_EMAIL_OTP_SUBJECT_MARKER,
        5000,
        200,
        {
            recipient: target,
            notBeforeEpochMs: Date.now() - 60_000,
            candidatePredicate: isChangeEmailOtpCandidate,
        }
    );
    expect(result.body).toContain('555555');
    expect(poll).toBeGreaterThan(1);
});

test('OTP extraction: labeled code from fixture HTML ignores style digits', () => {
    expect(extractChangeEmailVerificationCodeFromBody(OTP_HTML)).toBe('482913');
});

test('OTP extraction: rejects missing and ambiguous codes', () => {
    expect(() => extractChangeEmailVerificationCodeFromBody('<p>認証コード only</p>')).toThrow(
        /six-digit/
    );
    expect(() =>
        extractChangeEmailVerificationCodeFromBody(
            '<p>認証コード 111111 and 認証コード 222222</p>'
        )
    ).toThrow(/multiple different/);
});

test('OTP extraction: rejects seven-digit run; accepts standalone six-digit code', () => {
    expect(() =>
        extractChangeEmailVerificationCodeFromBody('<p>認証コード：1234567</p>')
    ).toThrow(/six-digit/);
    expect(extractChangeEmailVerificationCodeFromBody('<p>認証コード：654321</p>')).toBe(
        '654321'
    );
});

test('OTP extraction: staging MJML layout with numeric entities and separate code block', () => {
    const target = 'user.two.dot@example.com';
    const record = msg(
        'staging-layout',
        Date.now(),
        [
            { name: 'To', value: target },
            { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
        ],
        STAGING_STRUCTURE_HTML
    );
    const selected = selectMatchingGmailMessage([record], target, CHANGE_EMAIL_OTP_SUBJECT_MARKER, {
        recipient: target,
        notBeforeEpochMs: Date.now() - 60_000,
        candidatePredicate: isChangeEmailOtpCandidate,
    });
    expect(selected).not.toBeNull();
    const candidate = buildEmailCandidateFromRecord(record);
    expect(extractChangeEmailVerificationCodeFromCandidate(candidate)).toBe('482913');
});

test('OTP extraction: plain and HTML layers must agree when both present', () => {
    const agree = buildEmailCandidateFromRecord(
        multipartMsg(
            'agree',
            Date.now(),
            [{ name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER }],
            '認証コード：111222',
            '<p>認証コード：<strong>111222</strong></p>'
        )
    );
    expect(extractChangeEmailVerificationCodeFromCandidate(agree)).toBe('111222');
    expect(isChangeEmailOtpCandidate(agree)).toBe(true);

    const conflict = buildEmailCandidateFromRecord(
        multipartMsg(
            'conflict',
            Date.now(),
            [{ name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER }],
            '認証コード：111222',
            '<p>認証コード：<strong>333444</strong></p>'
        )
    );
    expect(() => extractChangeEmailVerificationCodeFromCandidate(conflict)).toThrow(/conflicting/);
});

test('waitForChangeEmailVerificationCode uses production selector path', async () => {
    const target = 'a.ar.dvark@gmail.com';
    setGmailClientOverride({
        listMessages: async () => [{ id: 'ok' }],
        getMessage: async () =>
            msg(
                'ok',
                Date.now(),
                [
                    { name: 'To', value: target },
                    { name: 'Subject', value: CHANGE_EMAIL_OTP_SUBJECT_MARKER },
                ],
                OTP_HTML
            ),
    });
    const code = await waitForChangeEmailVerificationCode(target, Date.now() - 5000, 5000, 100);
    expect(code).toBe('482913');
});
