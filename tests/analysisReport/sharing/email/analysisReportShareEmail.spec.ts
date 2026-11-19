import { test, expect, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
    STG_APP_ORIGIN,
} from '../../../login/existingUserLoginFlow';
import {
    AnalysisReportShareEmailRunTracker,
    allShareEmailVerificationsPassed,
    analysisReportShareEmailEvidenceAttachmentBody,
    type AnalysisReportShareEmailRunEvidence,
} from './analysisReportShareEmailReporting';
import { runAnalysisReportShareEmailFlow } from './analysisReportShareEmailFlow';
import { resolveAnalysisReportShareEmailSmokeTarget } from './analysisReportShareEmailSmokeConfig';

/**
 * Standalone Analysis Report Share Email (Part 2 login; sends one live email when env/staging enabled).
 *
 * Defaults (smoke configuration):
 * - Customer: Nikolas Samuel — ce3f36fd-07c3-4eda-ad87-35631acc39cc
 * - Analysis: a871ea8f-c5e8-4fbd-b933-75fe8e2a144f
 * - Recipient: aardvarkomonstrosesquip1230000@gmail.com (Gmail OAuth inbox)
 *
 * Gmail read access (inbox aardvarkomonstrosesquip1230000@gmail.com):
 * - credentials/credentials.json (OAuth client) + repo-root token.json (refresh token)
 * - Reauthorize when refresh fails with invalid_grant: remove token.json, then from repo root
 *   run `npx ts-node utils/google.ts`, sign in as the mailbox above, paste the OAuth code.
 *
 * Optional env overrides:
 * - ANALYSIS_REPORT_VIEW_CUSTOMER_ID
 * - ANALYSIS_REPORT_VIEW_ANALYSIS_ID
 * - ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT
 * - EPOSE_SMOKE_PART2_EMAIL / EPOSE_SMOKE_PART2_PASSWORD
 *
 * Run (staging, sends email once; line + JUnit via smoke config):
 * EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' \
 *   npm run pw:ar:share-email
 *
 * Combine into results.xml after Part 1/2 JUnit files exist:
 * node scripts/combineSmokeResults.mjs --with-share-email
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

async function attachEvidence(testInfo: TestInfo, payload: AnalysisReportShareEmailRunEvidence): Promise<void> {
    try {
        await testInfo.attach('analysis-report-share-email', {
            body: analysisReportShareEmailEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach analysis-report-share-email evidence:', error);
    }
}

test('analysisReportShareEmailStandalone', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const target = resolveAnalysisReportShareEmailSmokeTarget();
    const tracker = new AnalysisReportShareEmailRunTracker({
        accountEmail: account.email,
        customerId: target.customerId,
        analysisId: target.analysisId,
        recipientEmail: target.recipientEmail,
    });
    tracker.logRunStarted();

    await test.step('login existing Part 2 account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    const evidence = await test.step('share report email', async () => {
        return runAnalysisReportShareEmailFlow(
            page,
            browser,
            target.customerId,
            target.analysisId,
            target.recipientEmail,
            STG_APP_ORIGIN,
            { tracker }
        );
    });

    await attachEvidence(testInfo, evidence);
    expect(allShareEmailVerificationsPassed(evidence)).toBe(true);
    expect(evidence.modalRecipientVerified).toBe(true);
    expect(evidence.sendAttemptedOnce).toBe(true);
    expect(evidence.sendSuccessToastVerified).toBe(true);
    expect(evidence.gmailMessageId).toBeTruthy();
    expect(evidence.sharedReportUrl).toMatch(/\/shared-report\?/);
    expect(evidence.sharedReportUrl).toMatch(/(?:\?|&)token=/);
    expect(evidence.sharedReportAnalysisVerified).toBe(true);
    expect(evidence.failureStep).toBeNull();
});
