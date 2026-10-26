import { test, type TestInfo } from '@playwright/test';
import { runLimitDialogFlowAfterLogin } from '../limitDialog/limitDialogFlow';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../login/existingUserLoginFlow';
import {
    logoutEvidenceAttachmentBody,
    runLogoutAndVerify,
    type LogoutRunEvidence,
} from '../logout/logoutFlow';
import { SmokePart2RunTracker } from './shared/smokePart2Reporting';

/**
 * Full E2E smoke Part 2 (existing account).
 *
 * Current coverage: Login → Limit Dialog checks → Logout.
 *
 * Deferred (pending developer automation attributes — not covered or passed here):
 * - CIRS record create/list navigation (implementation remains under tests/CIRS/)
 * - Analysis Report
 *
 * Independent of Part 1 account allocation, state files, and execution order.
 * Uses dedicated credentials from tests/e2e/shared/smokePart2Config.ts only.
 *
 * Structured console lines (PART2_*) are captured in JUnit <system-out> via the junit reporter.
 *
 * Run: npx playwright test tests/e2e/fullE2ESmokePart2.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

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

test('fullE2ESmokePart2', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const report = new SmokePart2RunTracker(account.email);
    let latestLogoutEvidence: LogoutRunEvidence | null = null;

    report.logRunStarted();

    try {
        report.stepStarted('login existing account');
        const loginReadiness = await test.step('login existing account', async () => {
            return loginExistingUserForPart2(page, account);
        });
        report.logLoginVerified(loginReadiness);
        report.stepCompleted('login existing account');

        report.stepStarted('limit dialog checks');
        const limitResult = await test.step('limit dialog checks', async () => {
            return runLimitDialogFlowAfterLogin(page, account, loginReadiness, {
                authProfileBody: loginReadiness.authProfile ?? null,
            });
        });
        report.logLimitDialogVerified(limitResult);
        report.stepCompleted('limit dialog checks');

        report.stepStarted('logout');
        try {
            await test.step('logout', async () => {
                await runLogoutAndVerify(page, {
                    onEvidence: (evidence) => {
                        latestLogoutEvidence = evidence;
                    },
                });
            });
            if (!latestLogoutEvidence) {
                throw new Error('Logout completed without captured evidence.');
            }
            report.logLogoutVerified(latestLogoutEvidence);
            report.stepCompleted('logout');
        } catch (error) {
            if (latestLogoutEvidence) {
                await attachLogoutEvidence(testInfo, latestLogoutEvidence);
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

        report.logRunCompleted(page.url());
    } catch (error) {
        report.logRunFailed(error, page.url());
        throw error;
    }
});
