import { test, expect } from '@playwright/test';
import { newStagingSmokeBrowserContextOptions } from '../e2e/shared/stagingSmokeBrowserContext';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    GmailAuthError,
    setGmailClientOverride,
    setGmailPreflightOverride,
    type GmailMessageRecord,
} from '../../utils/gmail';
import {
    DEFAULT_DOMAIN,
    DEFAULT_LOCAL_BASE,
    readEmailState,
    stateFilePath,
    writeEmailStateAtomic,
    type EmailState,
    type PendingVerification,
} from './emailState';
import {
    executeVerificationBoundaries,
    runSmokeEmailStateSession,
} from './emailSmokeOrchestration';
import {
    REGISTRATION_RESUME_ABORT_PREFIX,
    extractRegistrationVerificationUrlFromEmailBody,
} from './registrationEmailRecovery';
import {
    REGISTRATION_RESUME_FIXTURE_EMAIL,
    REGISTRATION_RESUME_FIXTURE_OTP,
    buildRegistrationOtpEmailHtml,
    buildRegistrationResumeVerificationUrl,
    installRegistrationResumeFixtureShell,
} from './registrationResumeFixtureShell';

test.describe.configure({ retries: 0 });

function encodePayloadBody(text: string): string {
    return Buffer.from(text, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function gmailOtpMessage(
    accountEmail: string,
    verificationUrl: string,
    internalDate: number
): GmailMessageRecord {
    const html = buildRegistrationOtpEmailHtml(verificationUrl, REGISTRATION_RESUME_FIXTURE_OTP);
    return {
        id: 'fixture-reg-otp-1',
        internalDate,
        headers: [
            { name: 'To', value: accountEmail },
            { name: 'Subject', value: '認証コードをお送りします' },
        ],
        payload: {
            mimeType: 'text/html',
            body: { data: encodePayloadBody(html) },
        },
    };
}

function pendingThreeDotState(overrides: Partial<PendingVerification> = {}): EmailState {
    const applicationSubmitAttemptedAt = '2026-11-17T09:10:15.892Z';
    const pending: PendingVerification = {
        allocationPool: 'three_dot',
        threeDotIndex: 4,
        threeDotGaps: [1, 2, 7],
        email: REGISTRATION_RESUME_FIXTURE_EMAIL,
        phase: 'application_submit_pending',
        runId: '2625f7ea-2ce1-45b3-9153-15367b92178d',
        hostname: 'fixture-host',
        pid: 42,
        startedAt: '2026-11-17T09:09:59.902Z',
        applicationSubmitAttemptedAt,
        ...overrides,
    };
    return {
        schemaVersion: 3,
        localBase: DEFAULT_LOCAL_BASE,
        domain: DEFAULT_DOMAIN,
        nextDotPosition: 30,
        highWaterMark: 30,
        allocationPool: 'three_dot',
        nextThreeDotIndex: 4,
        threeDotHighWaterMark: 4,
        pendingVerification: pending,
    };
}

function initRepo(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'epose-reg-resume-'));
}

test.afterEach(() => {
    setGmailPreflightOverride(null);
    setGmailClientOverride(null);
});

test('resume: fresh browser opens verification URL from OTP email; skips application submit', async ({
    browser,
}) => {
    const repoRoot = initRepo();
    const statePath = stateFilePath(repoRoot);
    writeEmailStateAtomic(statePath, pendingThreeDotState());

    const verificationUrl = buildRegistrationResumeVerificationUrl(REGISTRATION_RESUME_FIXTURE_EMAIL);
    const notBefore = Date.parse('2026-11-17T09:10:15.892Z');

    setGmailPreflightOverride(async () => {});
    setGmailClientOverride({
        listMessages: async () => [{ id: 'fixture-reg-otp-1' }],
        getMessage: async () =>
            gmailOtpMessage(REGISTRATION_RESUME_FIXTURE_EMAIL, verificationUrl, notBefore + 60_000),
    });

    const context = await browser.newContext(newStagingSmokeBrowserContextOptions());
    const page = await context.newPage();
    await installRegistrationResumeFixtureShell(page);

    let initialApplicationSendAttempts = 0;
    let secondPersistApplicationSubmit = 0;

    await runSmokeEmailStateSession({
        repoRoot,
        localBase: DEFAULT_LOCAL_BASE,
        domain: DEFAULT_DOMAIN,
        manualDotPositionRaw: undefined,
        runBody: async (session) => {
            expect(session.resumedAfterApplicationSubmit).toBe(true);
            expect(session.email).toBe(REGISTRATION_RESUME_FIXTURE_EMAIL);
            expect(session.threeDotIndex).toBe(4);
            expect(session.registrationResumeVerificationUrl).toBe(verificationUrl);

            await executeVerificationBoundaries(
                {
                    persistApplicationSubmitPending: () => {
                        secondPersistApplicationSubmit += 1;
                    },
                    clickInitialApplicationSend: async () => {
                        initialApplicationSendAttempts += 1;
                    },
                    prepareOtpVerification: async () => {
                        const url = session.registrationResumeVerificationUrl!;
                        expect(
                            extractRegistrationVerificationUrlFromEmailBody(
                                buildRegistrationOtpEmailHtml(url, REGISTRATION_RESUME_FIXTURE_OTP)
                            )
                        ).toBe(url);
                        await page.goto(url);
                        await expect(page.getByRole('textbox', { name: 'メールアドレス' })).toHaveValue(
                            REGISTRATION_RESUME_FIXTURE_EMAIL
                        );
                        await page.locator('#otp-field').fill(REGISTRATION_RESUME_FIXTURE_OTP);
                    },
                    persistOtpSubmitted: () => {},
                    clickOtpSend: async () => {
                        await page.locator('#otp-send').click();
                    },
                    isAuthVerificationRejected: async () => false,
                    waitForVerificationOutcome: async () => {
                        await expect(page.locator('#session-ok')).toBeVisible();
                    },
                    commitEmailConsumed: () => {},
                    runAfterEmailConsumed: async () => {},
                },
                { resumeAfterApplicationSubmit: true }
            );
        },
    });

    expect(initialApplicationSendAttempts).toBe(0);
    expect(secondPersistApplicationSubmit).toBe(0);

    const after = readEmailState(statePath, DEFAULT_LOCAL_BASE, DEFAULT_DOMAIN, {
        allowUnresolvedPending: true,
    });
    expect(after.pendingVerification?.phase).toBe('application_submit_pending');
    expect(after.nextThreeDotIndex).toBe(4);

    await context.close();
});

test('resume precheck fails when OTP email missing; pending and counters preserved', async () => {
    const repoRoot = initRepo();
    const statePath = stateFilePath(repoRoot);
    const before = pendingThreeDotState();
    writeEmailStateAtomic(statePath, before);
    const beforeRaw = fs.readFileSync(statePath, 'utf8');

    setGmailPreflightOverride(async () => {});
    setGmailClientOverride({
        listMessages: async () => [],
        getMessage: async (id: string) => {
            throw new Error(`unexpected getMessage ${id}`);
        },
    });

    await expect(
        runSmokeEmailStateSession({
            repoRoot,
            localBase: DEFAULT_LOCAL_BASE,
            domain: DEFAULT_DOMAIN,
            manualDotPositionRaw: undefined,
            runBody: async () => {
                throw new Error('runBody must not run when resume OTP precheck fails');
            },
        })
    ).rejects.toThrow(new RegExp(REGISTRATION_RESUME_ABORT_PREFIX));

    expect(fs.readFileSync(statePath, 'utf8')).toBe(beforeRaw);
});

test('expired OTP session: verification rejects; pending preserved (fixture)', async ({ page }) => {
    const verificationUrl = buildRegistrationResumeVerificationUrl(REGISTRATION_RESUME_FIXTURE_EMAIL);
    await installRegistrationResumeFixtureShell(page, { rejectOtp: true });
    await page.goto(verificationUrl);
    await page.locator('#otp-field').fill(REGISTRATION_RESUME_FIXTURE_OTP);
    await page.locator('#otp-send').click();
    await expect(page.locator('#session-ok')).toBeHidden();
});