import { test, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../login/existingUserLoginFlow';
import { runLimitDialogFlowAfterLogin } from '../limitDialog/limitDialogFlow';
import {
    logoutEvidenceAttachmentBody,
    runLogoutAndVerify,
    type LogoutRunEvidence,
} from './logoutFlow';

/**
 * Standalone: Part 2 login → Limit Dialog → Logout (same session).
 *
 * Run: npx playwright test tests/logout/existingAccountLogout.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

async function attachLogoutEvidence(testInfo: TestInfo, evidence: LogoutRunEvidence): Promise<void> {
    try {
        await testInfo.attach('logout-evidence', {
            body: logoutEvidenceAttachmentBody(evidence),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

test('Existing account: Part 2 login + Limit Dialog + Logout', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    let latestEvidence: LogoutRunEvidence | null = null;

    const loginReadiness = await test.step('login existing account', async () => {
        return loginExistingUserForPart2(page, account);
    });

    await test.step('limit dialog checks', async () => {
        await runLimitDialogFlowAfterLogin(page, account, loginReadiness, {
            authProfileBody: loginReadiness.authProfile ?? null,
        });
    });

    try {
        await test.step('logout', async () => {
            await runLogoutAndVerify(page, {
                onEvidence: (evidence) => {
                    latestEvidence = evidence;
                },
            });
        });
    } catch (error) {
        if (latestEvidence) {
            await attachLogoutEvidence(testInfo, latestEvidence);
        }
        const png = await page.screenshot({ fullPage: true }).catch(() => null);
        if (png) {
            await testInfo.attach('logout-failure-screenshot', {
                body: png,
                contentType: 'image/png',
            }).catch(() => {});
        }
        throw error;
    }
});
