
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const __dirname = path.resolve();
const TOKEN_PATH = path.join(__dirname, '../ePose/token.json');
const CREDENTIALS_PATH = path.join(__dirname, '../ePose/credentials/credentials.json');

export type GmailHeader = { name?: string | null; value?: string | null };

export type GmailPayloadPart = {
    mimeType?: string | null;
    body?: { data?: string | null };
    parts?: GmailPayloadPart[];
};

export type GmailPayload = {
    mimeType?: string | null;
    body?: { data?: string | null };
    parts?: GmailPayloadPart[];
    headers?: GmailHeader[];
};

export type GmailMessageRecord = {
    id: string;
    internalDate: number;
    headers: GmailHeader[];
    payload: GmailPayload;
};

export type ParsedEmailCandidate = {
    subject: string;
    body: string;
    /** Decoded text/plain part when present; empty when the message is HTML-only. */
    rawPlainBody: string;
    /** Plain part, or stripped HTML when no text/plain exists (display / legacy). */
    textBody: string;
    internalDate: number;
};

export type WaitForEmailOptions = {
    /** Ignore messages with Gmail internalDate before this timestamp (ms). */
    notBeforeEpochMs?: number;
    /** Require exact recipient match in To/Delivered-To (case-insensitive, dots preserved). */
    recipient?: string;
    /** Optional suitability filter applied during message scan (Change Email, etc.). */
    candidatePredicate?: (candidate: ParsedEmailCandidate) => boolean;
};

type ParsedEmail = ParsedEmailCandidate;

type GmailClientOverride = {
    listMessages: (query: string, maxResults: number) => Promise<Array<{ id: string }>>;
    getMessage: (id: string) => Promise<GmailMessageRecord>;
};

let gmailClientOverride: GmailClientOverride | null = null;

/** Test-only: inject mocked Gmail list/get responses. */
export function setGmailClientOverride(client: GmailClientOverride | null): void {
    gmailClientOverride = client;
}

async function getGmailClient() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const { client_secret, client_id } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
    oAuth2Client.setCredentials(token);
    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

function decodeGmailBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

/** Remove/decode HTML entities so numeric refs (e.g. &#8203;) do not break digit-gap parsing. */
export function decodeHtmlEntitiesForVerification(text: string): string {
    return text
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex: string) =>
            verificationCharFromCodePoint(parseInt(hex, 16))
        )
        .replace(/&#(\d+);/g, (_, dec: string) =>
            verificationCharFromCodePoint(parseInt(dec, 10))
        )
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'");
}

function verificationCharFromCodePoint(codePoint: number): string {
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return ' ';
    }
    // Invisible/format separators → space (ZWSP, ZWNJ, BOM, etc.)
    if (
        codePoint === 0xfeff ||
        codePoint === 0x200b ||
        codePoint === 0x200c ||
        codePoint === 0x200d ||
        codePoint === 0x2060 ||
        (codePoint >= 0x2000 && codePoint <= 0x200f)
    ) {
        return ' ';
    }
    return String.fromCodePoint(codePoint);
}

export function stripHtmlForVerificationText(html: string): string {
    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ');
    text = decodeHtmlEntitiesForVerification(text);
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

function collectPayloadParts(payload: GmailPayload | undefined, out: GmailPayloadPart[]): void {
    if (!payload) {
        return;
    }
    if (payload.parts?.length) {
        for (const part of payload.parts) {
            out.push(part);
            collectPayloadParts(part, out);
        }
    }
}

export function extractHtmlBodyFromPayload(payload: GmailPayload | undefined): string {
    if (!payload) {
        throw new Error('Email payload is empty');
    }
    const flat: GmailPayloadPart[] = [];
    collectPayloadParts(payload, flat);
    if (payload.body?.data && !flat.length) {
        flat.push(payload);
    }
    for (const part of flat) {
        if (part.mimeType === 'text/html' && part.body?.data) {
            return decodeGmailBase64Url(part.body.data);
        }
    }
    for (const part of flat) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            return decodeGmailBase64Url(part.body.data);
        }
    }
    if (payload.body?.data) {
        return decodeGmailBase64Url(payload.body.data);
    }
    throw new Error('Email body is empty');
}

export function extractPlainTextPartFromPayload(payload: GmailPayload | undefined): string {
    if (!payload) {
        return '';
    }
    const flat: GmailPayloadPart[] = [];
    collectPayloadParts(payload, flat);
    for (const part of flat) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            return decodeGmailBase64Url(part.body.data);
        }
    }
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return decodeGmailBase64Url(payload.body.data);
    }
    return '';
}

export function extractPlainTextFromPayload(payload: GmailPayload | undefined): string {
    const plain = extractPlainTextPartFromPayload(payload);
    if (plain) {
        return plain;
    }
    try {
        return stripHtmlForVerificationText(extractHtmlBodyFromPayload(payload));
    } catch {
        return '';
    }
}

export function parseEmailAddresses(headerValue: string): string[] {
    if (!headerValue.trim()) {
        return [];
    }
    const results: string[] = [];
    for (const segment of headerValue.split(',')) {
        const trimmed = segment.trim();
        if (!trimmed) {
            continue;
        }
        const angle = trimmed.match(/<([^>]+)>/);
        if (angle?.[1]?.includes('@')) {
            results.push(angle[1].trim());
            continue;
        }
        if (trimmed.includes('@') && !trimmed.includes(' ')) {
            results.push(trimmed);
        }
    }
    return results;
}

export function groupHeadersCaseInsensitive(
    headers: GmailHeader[]
): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const header of headers) {
        if (!header.name) {
            continue;
        }
        const key = header.name.toLowerCase();
        const bucket = map.get(key) ?? [];
        bucket.push(header.value ?? '');
        map.set(key, bucket);
    }
    return map;
}

const RECIPIENT_HEADER_NAMES = ['delivered-to', 'to', 'x-original-to'] as const;

export function headersMatchExactRecipient(
    headers: GmailHeader[],
    recipient: string
): boolean {
    const needle = recipient.toLowerCase();
    const grouped = groupHeadersCaseInsensitive(headers);
    for (const name of RECIPIENT_HEADER_NAMES) {
        const values = grouped.get(name) ?? [];
        for (const value of values) {
            for (const addr of parseEmailAddresses(value)) {
                if (addr.toLowerCase() === needle) {
                    return true;
                }
            }
        }
    }
    return false;
}

export function passesInternalDateFreshness(
    internalDate: number,
    notBeforeEpochMs: number | undefined
): boolean {
    if (notBeforeEpochMs === undefined) {
        return true;
    }
    if (!Number.isFinite(internalDate) || internalDate <= 0) {
        return false;
    }
    return internalDate >= notBeforeEpochMs;
}

export function buildEmailCandidateFromRecord(record: GmailMessageRecord): ParsedEmailCandidate {
    const grouped = groupHeadersCaseInsensitive(record.headers);
    const subject = (grouped.get('subject') ?? [''])[0] ?? '';
    const htmlBody = extractHtmlBodyFromPayload(record.payload);
    const rawPlainBody = extractPlainTextPartFromPayload(record.payload);
    const textBody = rawPlainBody || stripHtmlForVerificationText(htmlBody);
    return {
        subject,
        body: htmlBody,
        rawPlainBody,
        textBody,
        internalDate: record.internalDate,
    };
}

export function selectMatchingGmailMessage(
    records: GmailMessageRecord[],
    to: string,
    subjectContains: string,
    options?: WaitForEmailOptions
): ParsedEmailCandidate | null {
    for (const record of records) {
        if (!passesInternalDateFreshness(record.internalDate, options?.notBeforeEpochMs)) {
            continue;
        }
        const candidate = buildEmailCandidateFromRecord(record);
        if (!candidate.subject.includes(subjectContains)) {
            continue;
        }
        if (options?.recipient) {
            if (!headersMatchExactRecipient(record.headers, options.recipient)) {
                continue;
            }
        }
        if (options?.candidatePredicate && !options.candidatePredicate(candidate)) {
            continue;
        }
        return candidate;
    }
    return null;
}

async function fetchMessageRecords(
    to: string,
    subjectContains: string
): Promise<GmailMessageRecord[]> {
    const query = `to:${to} subject:${subjectContains}`;
    if (gmailClientOverride) {
        const ids = await gmailClientOverride.listMessages(query, 20);
        const records: GmailMessageRecord[] = [];
        for (const brief of ids) {
            records.push(await gmailClientOverride.getMessage(brief.id));
        }
        return records;
    }
    const gmail = await getGmailClient();
    const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20,
    });
    if (!res.data.messages?.length) {
        return [];
    }
    const records: GmailMessageRecord[] = [];
    for (const brief of res.data.messages) {
        const msg = await gmail.users.messages.get({
            userId: 'me',
            id: brief.id!,
        });
        records.push({
            id: brief.id!,
            internalDate: Number(msg.data.internalDate ?? 0),
            headers: (msg.data.payload?.headers ?? []) as GmailHeader[],
            payload: (msg.data.payload ?? {}) as GmailPayload,
        });
    }
    return records;
}

async function findMatchingEmail(
    to: string,
    subjectContains: string,
    options?: WaitForEmailOptions
): Promise<ParsedEmail | null> {
    const records = await fetchMessageRecords(to, subjectContains);
    return selectMatchingGmailMessage(records, to, subjectContains, options);
}

export async function getLastEmail(to: string, subjectContains: string) {
    const match = await findMatchingEmail(to, subjectContains);
    if (!match) return null;

    return {
        subject: match.subject,
        body: match.body,
    };
}

export const CHANGE_EMAIL_OTP_SUBJECT_MARKER = '認証コードをお送りします';

/** Standalone six digits — not a substring of a longer digit run. */
const STANDALONE_SIX_DIGITS = String.raw`(?<!\d)(\d{6})(?!\d)`;

function normalizeVerificationText(htmlOrText: string): string {
    const collapsed = htmlOrText.includes('<')
        ? stripHtmlForVerificationText(htmlOrText)
        : decodeHtmlEntitiesForVerification(htmlOrText).replace(/\s+/g, ' ').trim();
    return collapsed;
}

function allVerificationMarkerIndices(text: string, marker: string): number[] {
    const indices: number[] = [];
    let from = 0;
    while (from < text.length) {
        const i = text.indexOf(marker, from);
        if (i < 0) {
            break;
        }
        indices.push(i);
        from = i + marker.length;
    }
    return indices;
}

/**
 * Decoded layers used for Change Email OTP suitability and extraction.
 * HTML-only messages yield one layer (stripped HTML). Multipart yields plain and stripped HTML when they differ.
 */
export function changeEmailVerificationLayers(candidate: ParsedEmailCandidate): string[] {
    const layers: string[] = [];
    const plain = candidate.rawPlainBody.replace(/\s+/g, ' ').trim();
    const htmlAsText = stripHtmlForVerificationText(candidate.body);
    if (plain) {
        layers.push(plain);
    }
    if (htmlAsText && htmlAsText !== plain) {
        layers.push(htmlAsText);
    }
    if (!layers.length) {
        layers.push(htmlAsText || candidate.textBody.replace(/\s+/g, ' ').trim());
    }
    return layers.filter((layer) => layer.length > 0);
}

function layerPassesChangeEmailBodySuitability(text: string): boolean {
    if (!text.includes('認証コード')) {
        return false;
    }
    if (text.includes('パスワード再設定')) {
        return false;
    }
    return true;
}

export function isChangeEmailOtpCandidate(candidate: ParsedEmailCandidate): boolean {
    if (!candidate.subject.includes(CHANGE_EMAIL_OTP_SUBJECT_MARKER)) {
        return false;
    }
    const layers = changeEmailVerificationLayers(candidate);
    if (!layers.length) {
        return false;
    }
    return layers.every((layer) => layerPassesChangeEmailBodySuitability(layer));
}

export const PASSWORD_RESET_BODY_MARKER = 'パスワード再設定';

function layerPassesPasswordResetBodySuitability(text: string): boolean {
    if (!text.includes('認証コード')) {
        return false;
    }
    if (!text.includes(PASSWORD_RESET_BODY_MARKER)) {
        return false;
    }
    return true;
}

/** Mutually exclusive with {@link isChangeEmailOtpCandidate} (password-reset body marker required). */
export function isPasswordResetOtpCandidate(candidate: ParsedEmailCandidate): boolean {
    if (!candidate.subject.includes(CHANGE_EMAIL_OTP_SUBJECT_MARKER)) {
        return false;
    }
    const layers = changeEmailVerificationLayers(candidate);
    if (!layers.length) {
        return false;
    }
    return layers.every((layer) => layerPassesPasswordResetBodySuitability(layer));
}

function extractStandaloneCodeFromNormalizedText(text: string): string | null {
    const labeled = [
        ...text.matchAll(new RegExp(`認証コード[^0-9]{0,20}${STANDALONE_SIX_DIGITS}`, 'g')),
        ...text.matchAll(new RegExp(`${STANDALONE_SIX_DIGITS}[^0-9]{0,20}認証コード`, 'g')),
    ].map((m) => m[1]!);

    const uniqueLabeled = [...new Set(labeled)];
    if (uniqueLabeled.length === 1) {
        return uniqueLabeled[0]!;
    }
    if (uniqueLabeled.length > 1) {
        throw new Error('Verification email contains multiple different six-digit codes');
    }

    const windowCodes: string[] = [];
    for (const markerIndex of allVerificationMarkerIndices(text, '認証コード')) {
        const window = text.slice(markerIndex, markerIndex + 120);
        for (const match of window.matchAll(new RegExp(STANDALONE_SIX_DIGITS, 'g'))) {
            windowCodes.push(match[1]!);
        }
    }
    const uniqueWindow = [...new Set(windowCodes)];
    if (uniqueWindow.length === 1) {
        return uniqueWindow[0]!;
    }
    if (uniqueWindow.length > 1) {
        throw new Error('Verification email contains ambiguous six-digit codes near 認証コード');
    }

    return null;
}

export function extractChangeEmailVerificationCodeFromBody(htmlOrText: string): string {
    const text = normalizeVerificationText(htmlOrText);
    const code = extractStandaloneCodeFromNormalizedText(text);
    if (code) {
        return code;
    }
    throw new Error('Verification email did not contain a six-digit code');
}

export function extractChangeEmailVerificationCodeFromCandidate(
    candidate: ParsedEmailCandidate
): string {
    const layers = changeEmailVerificationLayers(candidate);
    const codes: string[] = [];
    for (const layer of layers) {
        const code = extractStandaloneCodeFromNormalizedText(layer);
        if (code) {
            codes.push(code);
        }
    }
    const unique = [...new Set(codes)];
    if (unique.length === 1) {
        return unique[0]!;
    }
    if (unique.length > 1) {
        throw new Error(
            'Verification email plain-text and HTML layers contain conflicting six-digit codes'
        );
    }
    throw new Error('Verification email did not contain a six-digit code');
}

/** @deprecated Prefer extractChangeEmailVerificationCodeFromBody */
export function extractSixDigitVerificationCode(body: string): string {
    return extractChangeEmailVerificationCodeFromBody(body);
}

async function waitForEmailCandidate(
    to: string,
    subjectContains: string,
    timeoutMs: number,
    intervalMs: number,
    options?: WaitForEmailOptions
): Promise<ParsedEmailCandidate> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const email = await findMatchingEmail(to, subjectContains, options);
        if (email) {
            return email;
        }
        await new Promise((res) => setTimeout(res, intervalMs));
    }

    throw new Error(
        `Timeout waiting for email to ${to} with subject containing "${subjectContains}"` +
            (options?.notBeforeEpochMs
                ? ` received after ${new Date(options.notBeforeEpochMs).toISOString()}`
                : '')
    );
}

export async function waitForChangeEmailVerificationCode(
    targetEmail: string,
    notBeforeEpochMs: number,
    timeoutMs: number = 120000,
    intervalMs: number = 10000
): Promise<string> {
    const candidate = await waitForEmailCandidate(
        targetEmail,
        CHANGE_EMAIL_OTP_SUBJECT_MARKER,
        timeoutMs,
        intervalMs,
        {
            recipient: targetEmail,
            notBeforeEpochMs,
            candidatePredicate: isChangeEmailOtpCandidate,
        }
    );
    return extractChangeEmailVerificationCodeFromCandidate(candidate);
}

export async function waitForPasswordResetVerificationCode(
    accountEmail: string,
    notBeforeEpochMs: number,
    timeoutMs: number = 120000,
    intervalMs: number = 10000
): Promise<string> {
    const candidate = await waitForEmailCandidate(
        accountEmail,
        CHANGE_EMAIL_OTP_SUBJECT_MARKER,
        timeoutMs,
        intervalMs,
        {
            recipient: accountEmail,
            notBeforeEpochMs,
            candidatePredicate: isPasswordResetOtpCandidate,
        }
    );
    return extractChangeEmailVerificationCodeFromCandidate(candidate);
}

export async function waitForEmail(
    to: string,
    subjectContains: string,
    timeoutMs: number = 30000,
    intervalMs: number = 10000,
    options?: WaitForEmailOptions
): Promise<{ subject?: string | null | undefined; body: string }> {
    const email = await waitForEmailCandidate(to, subjectContains, timeoutMs, intervalMs, options);
    return {
        subject: email.subject,
        body: email.body,
    };
}

export const REFERRAL_COUPON_EMAIL_SUBJECT_MARKER = '紹介クーポンが届きました';
export const REFERRAL_COUPON_EMAIL_BODY_LABEL = '紹介クーポンコード';

export function escapeRegexForVerification(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Alphanumeric referral codes: require token boundaries (not a substring of a longer token). */
export function referralCouponCodeInVerificationText(
    htmlOrText: string,
    referralCode: string
): boolean {
    const code = referralCode.trim();
    if (!code) {
        return false;
    }
    const normalized = htmlOrText.includes('<')
        ? stripHtmlForVerificationText(htmlOrText)
        : decodeHtmlEntitiesForVerification(htmlOrText).replace(/\s+/g, ' ');
    if (!normalized.includes(REFERRAL_COUPON_EMAIL_BODY_LABEL)) {
        return false;
    }
    const escaped = escapeRegexForVerification(code);
    const tokenBoundary = String.raw`(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`;
    return new RegExp(tokenBoundary).test(normalized);
}

export function isReferralCouponEmailCandidate(
    candidate: ParsedEmailCandidate,
    referralCode: string
): boolean {
    if (!candidate.subject.includes(REFERRAL_COUPON_EMAIL_SUBJECT_MARKER)) {
        return false;
    }
    if (referralCouponCodeInVerificationText(candidate.textBody, referralCode)) {
        return true;
    }
    if (referralCouponCodeInVerificationText(candidate.body, referralCode)) {
        return true;
    }
    return false;
}

export type ReferralCouponEmailMatch = {
    messageId: string;
    candidate: ParsedEmailCandidate;
};

export async function waitForReferralCouponEmailMatch(
    recipient: string,
    referralCode: string,
    notBeforeEpochMs: number,
    timeoutMs: number = 120000,
    intervalMs: number = 10000
): Promise<ReferralCouponEmailMatch> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const records = await fetchMessageRecords(
            recipient,
            REFERRAL_COUPON_EMAIL_SUBJECT_MARKER
        );
        for (const record of records) {
            if (!passesInternalDateFreshness(record.internalDate, notBeforeEpochMs)) {
                continue;
            }
            if (!headersMatchExactRecipient(record.headers, recipient)) {
                continue;
            }
            const candidate = buildEmailCandidateFromRecord(record);
            if (isReferralCouponEmailCandidate(candidate, referralCode)) {
                return { messageId: record.id, candidate };
            }
        }
        await new Promise((res) => setTimeout(res, intervalMs));
    }

    throw new Error(
        `Timeout waiting for referral coupon email to ${recipient} with subject containing "${REFERRAL_COUPON_EMAIL_SUBJECT_MARKER}" and code "${referralCode}" received after ${new Date(notBeforeEpochMs).toISOString()}`
    );
}
