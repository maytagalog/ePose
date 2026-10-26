import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { runChangeEmailStateSession } from './changeEmailOrchestration';
import {
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
} from './changeEmailState';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import {
    runMyPageChangeEmailAndVerify,
    type SmokeAccountRef,
} from './myPageChangeEmailFlow';

/**
 * Continuation: login → Change Email only (two-dot allocator; no registration/booking/customers/profile).
 *
 * Permanently changes the account email on staging when successful.
 *
 * Required env (password is not logged):
 *   EPOSE_CHANGE_EMAIL_CURRENT_EMAIL
 *   EPOSE_CHANGE_EMAIL_PASSWORD
 *
 * Requires repo-root e2e-change-email-state.json (see changeEmailState.ts init example).
 *
 * Run (after you initialize allocation):
 *   EPOSE_CHANGE_EMAIL_CURRENT_EMAIL='you@example.com' EPOSE_CHANGE_EMAIL_PASSWORD='***' \\
 *     npx playwright test tests/mypage/changeEmail/existingAccountChangeEmail.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing ${name} for Change Email continuation.`);
    }
    return value;
}

function createEvidence(
    page: import('@playwright/test').Page,
    testInfo: TestInfo
): CustomerFlowEvidence {
    return {
        attachJson: async (name, data) => {
            await testInfo.attach(name, {
                body: JSON.stringify(data, null, 2),
                contentType: 'application/json',
            });
        },
        attachScreenshot: async (name) => {
            const png = await page.screenshot({ fullPage: true }).catch(() => null);
            if (png) {
                await testInfo.attach(name, { body: png, contentType: 'image/png' });
            }
        },
        attachPageHtml: async (name) => {
            const html = await page.content().catch(() => '');
            if (html) {
                await testInfo.attach(name, {
                    body: html,
                    contentType: 'text/html',
                });
            }
        },
    };
}

test('Existing account: My Page Change Email (two-dot target)', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_CHANGE_EMAIL_CURRENT_EMAIL');
    requireEnv('EPOSE_CHANGE_EMAIL_PASSWORD');
    const account: SmokeAccountRef = {
        email,
        password: process.env.EPOSE_CHANGE_EMAIL_PASSWORD!,
    };
    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await runChangeEmailStateSession({
        repoRoot: process.cwd(),
        localBase: CHANGE_EMAIL_LOCAL_BASE,
        domain: CHANGE_EMAIL_DOMAIN,
        currentEmail: account.email,
        runBody: async (ctx) => {
            await runMyPageChangeEmailAndVerify(page, account, ctx, evidence);
        },
    });
});
