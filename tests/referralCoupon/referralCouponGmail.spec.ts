import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    REFERRAL_COUPON_EMAIL_SUBJECT_MARKER,
    buildEmailCandidateFromRecord,
    isReferralCouponEmailCandidate,
    referralCouponCodeInVerificationText,
    setGmailClientOverride,
    waitForReferralCouponEmailMatch,
    type GmailMessageRecord,
} from '../../utils/gmail';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e/fixtures'
);
const REFERRAL_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'referralCouponEmail.html'),
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

test('referralCouponCodeInVerificationText: token boundary avoids partial match', () => {
    expect(referralCouponCodeInVerificationText(REFERRAL_HTML, 'DYN12ABC')).toBe(true);
    expect(referralCouponCodeInVerificationText(REFERRAL_HTML, 'DYN12')).toBe(false);
    expect(referralCouponCodeInVerificationText(REFERRAL_HTML, 'XYN12ABC')).toBe(false);
});

test('waitForReferralCouponEmailMatch: rejects older message with same code/recipient', async () => {
    const recipient = 'a.ardvarko.monstrosesquip1230000@gmail.com';
    const code = 'DYN12ABC';
    const oldDate = Date.now() - 3600_000;
    const freshNotBefore = Date.now() - 60_000;

    setGmailClientOverride({
        listMessages: async () => [{ id: 'old-msg' }],
        getMessage: async () =>
            msg(
                'old-msg',
                oldDate,
                [
                    { name: 'To', value: recipient },
                    { name: 'Subject', value: REFERRAL_COUPON_EMAIL_SUBJECT_MARKER },
                ],
                REFERRAL_HTML
            ),
    });

    await expect(
        waitForReferralCouponEmailMatch(recipient, code, freshNotBefore, 800, 200)
    ).rejects.toThrow(/Timeout waiting for referral coupon email/);
});

test('waitForReferralCouponEmailMatch: accepts fresh message with exact recipient dots', async () => {
    const recipient = 'a.ardvarko.monstrosesquip1230000@gmail.com';
    const code = 'DYN12ABC';
    const freshNotBefore = Date.now() - 60_000;
    const internalDate = Date.now();

    setGmailClientOverride({
        listMessages: async () => [{ id: 'fresh-msg' }],
        getMessage: async () =>
            msg(
                'fresh-msg',
                internalDate,
                [
                    { name: 'Delivered-To', value: recipient },
                    { name: 'Subject', value: REFERRAL_COUPON_EMAIL_SUBJECT_MARKER },
                ],
                REFERRAL_HTML
            ),
    });

    const match = await waitForReferralCouponEmailMatch(
        recipient,
        code,
        freshNotBefore,
        5000,
        200
    );
    expect(match.messageId).toBe('fresh-msg');
    expect(isReferralCouponEmailCandidate(match.candidate, code)).toBe(true);
});

test('isReferralCouponEmailCandidate: rejects wrong code in otherwise valid body', () => {
    const candidate = buildEmailCandidateFromRecord(
        msg(
            'x',
            Date.now(),
            [
                { name: 'To', value: 'a.ardvarko.monstrosesquip1230000@gmail.com' },
                { name: 'Subject', value: REFERRAL_COUPON_EMAIL_SUBJECT_MARKER },
            ],
            REFERRAL_HTML
        )
    );
    expect(isReferralCouponEmailCandidate(candidate, 'DYN12ABC')).toBe(true);
    expect(isReferralCouponEmailCandidate(candidate, 'WRONGCODE')).toBe(false);
});
