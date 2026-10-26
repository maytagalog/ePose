import { test, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import { runLimitDialogFlowAfterLogin } from '../../limitDialog/limitDialogFlow';
import {
    cirsEvidenceAttachmentBody,
    runCirsRecordCreationAndListNavigation,
    type CirsRecordContext,
    type CirsRecordRunEvidence,
} from './cirsRecordFlow';

/**
 * Standalone Part 2: login → Limit Dialog handoff → one CIRS record create/list navigation.
 *
 * Side effect: creates ONE interaction record on staging and leaves it in place (no deletion in this phase).
 *
 * Run: npx playwright test tests/CIRS/cirsRecord/existingAccountCirsRecord.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

async function attachCirsEvidence(
    testInfo: TestInfo,
    payload: CirsRecordContext | CirsRecordRunEvidence
): Promise<void> {
    try {
        await testInfo.attach('cirs-record-context', {
            body: cirsEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-record-context:', error);
    }
}

test('existing account: CIRS record creation and list navigation', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();

    const loginReadiness = await test.step('login existing account', async () => {
        return loginExistingUserForPart2(page, account);
    });

    await test.step('limit dialog handoff', async () => {
        await runLimitDialogFlowAfterLogin(page, account, loginReadiness, {
            authProfileBody: loginReadiness.authProfile ?? null,
        });
    });

    let latestEvidence: CirsRecordRunEvidence | null = null;

    try {
        const ctx = await test.step('cirs record creation and list navigation', async () => {
            return runCirsRecordCreationAndListNavigation(page, {
                onEvidence: (evidence) => {
                    latestEvidence = evidence;
                },
            });
        });
        await attachCirsEvidence(testInfo, ctx);
    } catch (error) {
        if (latestEvidence) {
            await attachCirsEvidence(testInfo, latestEvidence);
        }
        throw error;
    }
});
