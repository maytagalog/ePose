import {
    fetchMessageRecords,
    selectMatchingGmailMessage,
    type ParsedEmailCandidate,
} from '../../utils/gmail';
import type { EmailState, PendingVerification } from './emailState';

export const REGISTRATION_OTP_EMAIL_SUBJECT = '認証コードをお送りします';

export const REGISTRATION_RESUME_ABORT_PREFIX =
    'Registration resume aborted';

export class RegistrationEmailRecoveryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RegistrationEmailRecoveryError';
    }
}

/**
 * Resume smoke only after application submit is persisted; OTP must not have been submitted yet.
 */
export function assertRecoverableApplicationSubmitPending(state: EmailState): PendingVerification {
    const pending = state.pendingVerification;
    if (!pending) {
        throw new RegistrationEmailRecoveryError(
            'Registration recovery requires pendingVerification; none is set.'
        );
    }
    if (pending.phase !== 'application_submit_pending') {
        throw new RegistrationEmailRecoveryError(
            `Registration recovery expects phase application_submit_pending, got ${pending.phase}.`
        );
    }
    if (!pending.applicationSubmitAttemptedAt) {
        throw new RegistrationEmailRecoveryError(
            'Registration recovery requires pendingVerification.applicationSubmitAttemptedAt.'
        );
    }
    if (pending.otpSubmittedAt) {
        throw new RegistrationEmailRecoveryError(
            'Registration recovery refuses pending with otpSubmittedAt already set.'
        );
    }
    return pending;
}

export function applicationSubmitNotBeforeEpochMs(pending: PendingVerification): number {
    const ms = Date.parse(pending.applicationSubmitAttemptedAt ?? '');
    if (!Number.isFinite(ms)) {
        throw new RegistrationEmailRecoveryError(
            'pendingVerification.applicationSubmitAttemptedAt is not parseable.'
        );
    }
    return ms;
}

/** Extract staging-style verification deep link from registration OTP email HTML. */
export function extractRegistrationVerificationUrlFromEmailBody(body: string): string | null {
    const anchorRe =
        /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>[\s\S]*?メール認証ページはこちら[\s\S]*?<\/a>/i;
    const direct = body.match(anchorRe);
    if (direct?.[1]) {
        return direct[1];
    }
    const reverseRe = /メール認証ページはこちら[\s\S]{0,400}?href=["']([^"']+)["']/i;
    const rev = body.match(reverseRe);
    return rev?.[1] ?? null;
}

export async function findRegistrationOtpEmailInGmail(
    accountEmail: string,
    notBeforeEpochMs: number
): Promise<ParsedEmailCandidate | null> {
    const records = await fetchMessageRecords(accountEmail, REGISTRATION_OTP_EMAIL_SUBJECT);
    return selectMatchingGmailMessage(records, accountEmail, REGISTRATION_OTP_EMAIL_SUBJECT, {
        recipient: accountEmail,
        notBeforeEpochMs,
    });
}

export type RegistrationResumeOtpEvidence = {
    verificationUrl: string;
    internalDate: number;
};

/**
 * Confirms OTP mail + verification link exist before resuming (no resend, no state mutation here).
 */
export async function verifyRegistrationResumeOtpInbox(
    pending: PendingVerification
): Promise<RegistrationResumeOtpEvidence> {
    const notBefore = applicationSubmitNotBeforeEpochMs(pending);
    const match = await findRegistrationOtpEmailInGmail(pending.email, notBefore);
    if (!match) {
        throw new RegistrationEmailRecoveryError(
            `${REGISTRATION_RESUME_ABORT_PREFIX}: no registration OTP email found after applicationSubmitAttemptedAt for ${pending.email}. Pending preserved; do not resend, clear pending, or advance counters until reconciled.`
        );
    }
    const verificationUrl = extractRegistrationVerificationUrlFromEmailBody(match.body);
    if (!verificationUrl?.trim()) {
        throw new RegistrationEmailRecoveryError(
            `${REGISTRATION_RESUME_ABORT_PREFIX}: registration OTP email is missing メール認証ページはこちら verification link for ${pending.email}. Pending preserved; reconcile before retry.`
        );
    }
    return {
        verificationUrl: verificationUrl.trim(),
        internalDate: match.internalDate,
    };
}