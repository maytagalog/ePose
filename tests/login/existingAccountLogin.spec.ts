import { test, type TestInfo } from '@playwright/test';
import { type CustomerFlowEvidence } from '../accountRegistration/customerFlow';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from './existingUserLoginFlow';

/**
 * Standalone Part 2 login (existing account). No registration or allocator use.
 *
 * Credentials: tests/e2e/shared/smokePart2Config.ts (not utils/login defaults).
 *
 * Run: npx playwright test tests/login/existingAccountLogin.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

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

test('Existing account: Part 2 login only', async ({ page }, testInfo) => {
    test.setTimeout(120000);

    const account = resolvePart2LoginAccount();
    const evidence = createEvidence(page, testInfo);

    const readiness = await test.step('login existing account', async () => {
        return loginExistingUserForPart2(page, account);
    });

    await evidence.attachJson('part2-login-readiness', {
        profileEmailVerified: readiness.profileEmailVerified,
        identityEvidenceStatus: readiness.identityEvidence.status,
        takeoverDetected: readiness.takeoverDetected,
        takeoverConfirmed: readiness.takeoverConfirmed,
        customersUrl: page.url(),
    });
});
