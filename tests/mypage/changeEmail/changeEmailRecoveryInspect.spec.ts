import { test, expect, type TestInfo, type Page } from '@playwright/test';
import { login } from '../../../utils/login';
import { stripHtmlForVerificationText } from '../../../utils/gmail';
import {
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    changeEmailStateFilePath,
    readChangeEmailState,
} from './changeEmailState';
import { assertRecoverableOtpRequestPending } from './changeEmailRecovery';
import { CHANGE_EMAIL_OTP_UI_VALIDITY_COPY } from './changeEmailOtpInstructions';
import {
    assertChangeEmailOtpConfirmationPageReady,
    CHANGE_EMAIL_CONFIRMATION_FLOW_UNAVAILABLE_DIAGNOSTIC,
} from './myPageChangeEmailFlow';
import { waitForAuthProfilePost, waitForMyPageReadOnlyReady } from '../profile/myPageProfileFlow';

const STG_MY_PAGE = 'https://app-stg.epose.com/my-page';
const CHANGE_EMAIL_CONFIRMATION_PATH =
    'https://app-stg.epose.com/my-page/change-email-confirmation-code';

test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 30000,
    navigationTimeout: 60000,
});

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(
            `Missing ${name}. Set credentials before running Change Email recovery inspection.`
        );
    }
    return value;
}

async function attachInspectFailure(
    page: Page,
    testInfo: TestInfo,
    label: string,
    context: Record<string, unknown>
): Promise<void> {
    await testInfo.attach(`${label}-context`, {
        body: JSON.stringify(context, null, 2),
        contentType: 'application/json',
    });
    const png = await page.screenshot({ fullPage: true }).catch(() => null);
    if (png) {
        await testInfo.attach(`${label}-screenshot`, {
            body: png,
            contentType: 'image/png',
        });
    }
    const html = await page.content().catch(() => '');
    if (html) {
        await testInfo.attach(`${label}-dom`, {
            body: html,
            contentType: 'text/html',
        });
    }
}

/**
 * Read-only staging/Gmail checks before existingAccountChangeEmailRecovery.spec.ts.
 * Does not submit OTP, persist confirmation, or mutate allocation state.
 */
test('read-only: login, profile email, OTP confirmation UI for pending recovery', async ({
    page,
}, testInfo) => {
    test.setTimeout(180000);
    const envCurrentEmail = requireEnv('EPOSE_CHANGE_EMAIL_CURRENT_EMAIL');
    const password = requireEnv('EPOSE_CHANGE_EMAIL_PASSWORD');

    const state = readChangeEmailState(
        changeEmailStateFilePath(process.cwd()),
        CHANGE_EMAIL_LOCAL_BASE,
        CHANGE_EMAIL_DOMAIN,
        { allowUnresolvedPending: true }
    );
    const pending = assertRecoverableOtpRequestPending(state, envCurrentEmail);

    const inspectContext = {
        targetIndex: pending.targetIndex,
        currentEmail: pending.currentEmail,
        targetEmail: pending.targetEmail,
        pendingRunId: pending.runId,
        otpRequestSubmittedAt: pending.otpRequestSubmittedAt,
        uiStatedValidityPeriod: CHANGE_EMAIL_OTP_UI_VALIDITY_COPY,
        uiValidityNote:
            'UI-stated validity only; not proof of backend TTL or cross-session resumability.',
    };

    try {
        await test.step('login', async () => {
            await login(page, { email: pending.currentEmail, password });
            await page.waitForURL(/\/customers/, { timeout: 30000 });
        });

        await test.step('POST auth/profile current email matches pending', async () => {
            const profileResponsePromise = waitForAuthProfilePost(page);
            await page.goto(STG_MY_PAGE, { waitUntil: 'domcontentloaded' });
            await waitForMyPageReadOnlyReady(page);
            const profile = await profileResponsePromise;
            expect(profile.email).toBe(pending.currentEmail);
        });

        await test.step('OTP confirmation route without new Send', async () => {
            await page.goto(CHANGE_EMAIL_CONFIRMATION_PATH, {
                waitUntil: 'domcontentloaded',
            });
            const landedPath = new URL(page.url()).pathname;
            if (landedPath.replace(/\/$/, '') === '/my-page/change-email-address') {
                const diagnostic = {
                    outcome: 'not_resumable_via_fresh_session_ui',
                    message: CHANGE_EMAIL_CONFIRMATION_FLOW_UNAVAILABLE_DIAGNOSTIC,
                    landedUrl: page.url(),
                    note: 'Redirect does not prove OTP expiry.',
                };
                console.log(JSON.stringify(diagnostic, null, 2));
                throw new Error(CHANGE_EMAIL_CONFIRMATION_FLOW_UNAVAILABLE_DIAGNOSTIC);
            }
            await assertChangeEmailOtpConfirmationPageReady(page, pending.targetEmail);
        });

        await test.step('Gmail message age for pending target (read-only)', async () => {
            const { google } = await import('googleapis');
            const fs = await import('node:fs');
            const path = await import('node:path');
            const repoRoot = path.resolve(import.meta.dirname, '../../..');
            const credentials = JSON.parse(
                fs.readFileSync(path.join(repoRoot, 'credentials', 'credentials.json'), 'utf8')
            );
            const token = JSON.parse(fs.readFileSync(path.join(repoRoot, 'token.json'), 'utf8'));
            const { client_secret, client_id } = credentials.installed;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
            oAuth2Client.setCredentials(token);
            const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
            const res = await gmail.users.messages.list({
                userId: 'me',
                q: `to:${pending.targetEmail} subject:認証コードをお送りします`,
                maxResults: 5,
            });
            const notBefore = Date.parse(pending.otpRequestSubmittedAt!);
            const now = Date.now();
            const summaries = [];
            for (const brief of res.data.messages ?? []) {
                const msg = await gmail.users.messages.get({
                    userId: 'me',
                    id: brief.id!,
                    format: 'full',
                });
                const internalDate = Number(msg.data.internalDate ?? 0);
                const payload = msg.data.payload;
                const part = payload?.parts?.find((p) => p.mimeType === 'text/html') ?? payload;
                const data = part?.body?.data;
                const html = data
                    ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
                          'utf8'
                      )
                    : '';
                const text = stripHtmlForVerificationText(html);
                summaries.push({
                    id: brief.id,
                    internalDateIso: new Date(internalDate).toISOString(),
                    afterOtpRequest: internalDate >= notBefore,
                    ageMinutes: Math.round((now - internalDate) / 60_000),
                    expirationHintsInEmailBody: ['有効期限', '期限', '分以内'].filter((k) =>
                        text.includes(k)
                    ),
                });
            }
            expect(
                summaries.some((s) => s.afterOtpRequest),
                'Expected at least one Gmail message after pending otpRequestSubmittedAt'
            ).toBe(true);
            console.log(
                JSON.stringify(
                    {
                        ...inspectContext,
                        gmailSummaries: summaries,
                    },
                    null,
                    2
                )
            );
        });
    } catch (err) {
        await attachInspectFailure(page, testInfo, 'change-email-recovery-inspect', {
            ...inspectContext,
            landedUrl: page.url(),
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
});
