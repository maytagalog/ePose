import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { runMyPageProfileFuriganaUpdateAndVerify } from './myPageProfileFlow';

/**
 * Continuation: login → My Page Profile Furigana-only smoke (no registration, booking, customers, email state).
 *
 * Required env (password is not logged):
 *   EPOSE_MY_PAGE_EMAIL
 *   EPOSE_MY_PAGE_PASSWORD
 *
 * Run:
 *   EPOSE_MY_PAGE_EMAIL='you@example.com' EPOSE_MY_PAGE_PASSWORD='***' \\
 *     npx playwright test tests/mypage/profile/existingAccountMyPageProfile.spec.ts --workers=1
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
        throw new Error(
            `Missing ${name}. Set it for existing-account My Page profile continuation.`
        );
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

test('Existing account: My Page profile Furigana-only update', async ({
    page,
}, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_MY_PAGE_EMAIL');
    requireEnv('EPOSE_MY_PAGE_PASSWORD');

    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, {
            email,
            password: process.env.EPOSE_MY_PAGE_PASSWORD!,
        });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await runMyPageProfileFuriganaUpdateAndVerify(page, email, evidence);
});
