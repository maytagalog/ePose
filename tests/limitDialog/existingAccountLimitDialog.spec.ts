import { test, type TestInfo } from '@playwright/test';
import { type CustomerFlowEvidence } from '../accountRegistration/customerFlow';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../login/existingUserLoginFlow';
import { runLimitDialogFlowAfterLogin } from './limitDialogFlow';

/**
 * Standalone: Part 2 login + Limit Dialog checks (same session, no re-login in helper).
 *
 * Run: npx playwright test tests/limitDialog/existingAccountLimitDialog.spec.ts --workers=1
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

test('Existing account: Part 2 login + Limit Dialog', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const evidence = createEvidence(page, testInfo);

    const loginReadiness = await test.step('login existing account', async () => {
        return loginExistingUserForPart2(page, account);
    });

    const limitResult = await test.step('limit dialog flow', async () => {
        return runLimitDialogFlowAfterLogin(page, account, loginReadiness, {
            authProfileBody: loginReadiness.authProfile ?? null,
        });
    });

    await evidence.attachJson('part2-limit-dialog-result', {
        prerequisites: limitResult.prerequisites,
        automaticOutcome: limitResult.automaticOutcome,
        triggers: limitResult.triggers,
        selectedCustomer: limitResult.selectedCustomer,
        finalPathname: limitResult.finalPathname,
        loginReadinessPreserved: limitResult.loginReadinessPreserved,
    });
});
