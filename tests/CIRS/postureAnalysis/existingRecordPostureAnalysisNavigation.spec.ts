import { test, expect, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import {
    runLogoutAndVerify,
    type LogoutRunEvidence,
} from '../../logout/logoutFlow';
import type { PostureAnalysisRunEvidence } from './postureAnalysisReporting';
import {
    openExistingCirsRecordForPostureAnalysis,
    postureAnalysisEvidenceAttachmentBody,
    resolvePostureAnalysisRecordFromEnv,
    runCirsPostureAnalysisNavigationFlow,
    type PostureAnalysisNavigationResult,
} from './postureAnalysisFlow';

/**
 * Standalone CIRS posture analysis navigation on an existing staging record.
 *
 * Required env:
 * - CIRS_POSTURE_ANALYSIS_CUSTOMER_ID
 * - CIRS_POSTURE_ANALYSIS_RECORD_ID
 * - EPOSE_SMOKE_PART2_EMAIL / EPOSE_SMOKE_PART2_PASSWORD (same as Part 2)
 *
 * Optional (strict customerId/recordId checks always apply):
 * - CIRS_POSTURE_ANALYSIS_CUSTOMER_NAME — 氏名 on /customers/{customerId} after full-list back; when omitted,
 *   the flow uses customer-name text from the matching customer-row.
 * - CIRS_POSTURE_ANALYSIS_CUSTOMER_FURIGANA — フリガナ on selected customer page; defaults to customer name when omitted.
 *
 * Run: npx playwright test tests/CIRS/postureAnalysis/existingRecordPostureAnalysisNavigation.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const hasEnv =
    Boolean(process.env.CIRS_POSTURE_ANALYSIS_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.CIRS_POSTURE_ANALYSIS_RECORD_ID?.trim());

async function attachEvidence(
    testInfo: TestInfo,
    payload: PostureAnalysisNavigationResult | PostureAnalysisRunEvidence | Record<string, unknown>
): Promise<void> {
    try {
        await testInfo.attach('cirs-posture-analysis-navigation', {
            body: postureAnalysisEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach cirs-posture-analysis-navigation:', error);
    }
}

test('existing record: CIRS posture analysis navigation', async ({ page }, testInfo) => {
    test.skip(
        !hasEnv,
        'Set CIRS_POSTURE_ANALYSIS_CUSTOMER_ID and CIRS_POSTURE_ANALYSIS_RECORD_ID for staging runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { customerId, recordId } = resolvePostureAnalysisRecordFromEnv();
    const customerName = process.env.CIRS_POSTURE_ANALYSIS_CUSTOMER_NAME?.trim() || null;
    const customerFurigana = process.env.CIRS_POSTURE_ANALYSIS_CUSTOMER_FURIGANA?.trim() || null;
    let latestEvidence: PostureAnalysisRunEvidence | null = null;

    await test.step('login existing account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    await test.step('open existing record', async () => {
        await openExistingCirsRecordForPostureAnalysis(page, { customerId, recordId });
    });

    try {
        const result = await test.step('posture analysis navigation', async () => {
            return runCirsPostureAnalysisNavigationFlow(
                page,
                { customerId, recordId, customerName, customerFurigana },
                {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestEvidence = evidence;
                    },
                }
            );
        });
        await attachEvidence(testInfo, result);

        await test.step('logout', async () => {
            const logoutEvidence: LogoutRunEvidence[] = [];
            await runLogoutAndVerify(page, {
                onEvidence: (evidence) => {
                    logoutEvidence.push(evidence);
                },
            });
            expect(logoutEvidence.length).toBeGreaterThan(0);
        });
    } catch (error) {
        if (latestEvidence) {
            await attachEvidence(testInfo, latestEvidence);
        }
        throw error;
    }
});
