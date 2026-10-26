import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import {
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    changeEmailStateFilePath,
    readChangeEmailState,
} from './changeEmailState';
import { assertRecoverableOtpRequestPending } from './changeEmailRecovery';
import { runChangeEmailRecoverySession } from './changeEmailRecoveryOrchestration';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import {
    runMyPageChangeEmailRecoveryAndVerify,
    type SmokeAccountRef,
} from './myPageChangeEmailFlow';

/**
 * Resume a failed Change Email run stuck at otp_request_submitted.
 * Does not send a new OTP request or allocate another target.
 *
 * Required env (password is not logged):
 *   EPOSE_CHANGE_EMAIL_CURRENT_EMAIL  — must match pendingChange.currentEmail
 *   EPOSE_CHANGE_EMAIL_PASSWORD
 *
 * Run after fixing Gmail extraction and confirming staging still accepts the pending OTP flow:
 *   EPOSE_CHANGE_EMAIL_CURRENT_EMAIL='aa.rdvarkomonstrosesquip1230000@gmail.com' \\
 *   EPOSE_CHANGE_EMAIL_PASSWORD='***' \\
 *     npx playwright test tests/mypage/changeEmail/existingAccountChangeEmailRecovery.spec.ts --workers=1
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
        throw new Error(`Missing ${name} for Change Email recovery.`);
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

test('Existing account: Change Email recovery (otp_request_submitted resume)', async ({
    page,
}, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_CHANGE_EMAIL_CURRENT_EMAIL');
    requireEnv('EPOSE_CHANGE_EMAIL_PASSWORD');
    const account: SmokeAccountRef = {
        email,
        password: process.env.EPOSE_CHANGE_EMAIL_PASSWORD!,
    };

    const state = readChangeEmailState(
        changeEmailStateFilePath(process.cwd()),
        CHANGE_EMAIL_LOCAL_BASE,
        CHANGE_EMAIL_DOMAIN,
        { allowUnresolvedPending: true }
    );
    assertRecoverableOtpRequestPending(state, email);

    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await runChangeEmailRecoverySession({
        repoRoot: process.cwd(),
        localBase: CHANGE_EMAIL_LOCAL_BASE,
        domain: CHANGE_EMAIL_DOMAIN,
        currentEmail: account.email,
        runBody: async (ctx) => {
            const updated = await runMyPageChangeEmailRecoveryAndVerify(
                page,
                account,
                ctx,
                evidence
            );
            account.email = updated.email;
        },
    });
});
