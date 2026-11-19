import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures');

export const REGISTRATION_RESUME_FIXTURE_ORIGIN = 'https://registration-resume-fixture.test';

export const REGISTRATION_RESUME_FIXTURE_EMAIL =
    'a.a.rdvar.komonstrosesquip1230000@gmail.com';

export const REGISTRATION_RESUME_FIXTURE_OTP = '739204';

export function buildRegistrationResumeVerificationUrl(accountEmail: string): string {
    const q = new URLSearchParams({ email: accountEmail });
    return `${REGISTRATION_RESUME_FIXTURE_ORIGIN}/application/verification?${q.toString()}`;
}

export function buildRegistrationOtpEmailHtml(verificationUrl: string, otpCode: string): string {
    return `<table><tr><td><a href="${verificationUrl}">メール認証ページはこちら</a></td></tr>
<tr><td><div style="color: rgb(0, 0, 0); font-size: 36px; font-weight: 500;">${otpCode}</div></td></tr></table>`;
}

function loadShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'registrationVerificationFixture.html'), 'utf8');
}

export async function installRegistrationResumeFixtureShell(
    page: Page,
    flags: { rejectOtp?: boolean } = {}
): Promise<void> {
    await page.route(`${REGISTRATION_RESUME_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShellHtml() });
    });
    await page.addInitScript((cfg) => {
        Object.assign(window as unknown as Record<string, unknown>, cfg);
    }, {
        __rejectOtp: flags.rejectOtp ?? false,
    });
}