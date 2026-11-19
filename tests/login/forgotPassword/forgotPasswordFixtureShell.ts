import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures');

export const FORGOT_PASSWORD_FIXTURE_ORIGIN = 'https://forgot-password-fixture.test';

export const FORGOT_PASSWORD_FIXTURE_OTP = '042913';

function loadForgotPasswordShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'forgotPasswordFlow.html'), 'utf8');
}

export async function installForgotPasswordFixtureShell(
    page: Page,
    flags: { suppressSuccess?: boolean; otp?: string } = {}
): Promise<void> {
    await page.route(`${FORGOT_PASSWORD_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadForgotPasswordShellHtml() });
    });
    await page.addInitScript((cfg) => {
        Object.assign(window as unknown as Record<string, unknown>, cfg);
    }, {
        __fixtureOtp: flags.otp ?? FORGOT_PASSWORD_FIXTURE_OTP,
        __suppressSuccess: flags.suppressSuccess ?? false,
    });
}