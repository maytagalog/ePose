import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../../../login/existingUserLoginFlow';
import {
    finalizeComparisonReportShareEmailRun,
    runComparisonReportShareEmailStandalone,
} from './comparisonReportShareEmailRunOrchestrator';

/**
 * Standalone Comparison Report Share Email (login → comparison → ellipsis → email → Gmail → guest).
 *
 * Run (headed, sends one live email when staging credentials + Gmail token are configured):
 * EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' npm run pw:ar:comparison-email -- --headed
 *
 * Gmail: credentials/credentials.json + repo-root token.json for ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_RECIPIENT.
 * Optional env: ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT, EPOSE_SMOKE_PART2_EMAIL, EPOSE_SMOKE_PART2_PASSWORD.
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('comparisonReportShareEmailStandalone', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { evidence, primaryError } = await runComparisonReportShareEmailStandalone({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
    });

    await finalizeComparisonReportShareEmailRun(testInfo, evidence, primaryError);

    expect(evidence.stages.terminalComparisonView).toBe('Passed');
    expect(evidence.shareEmailStages.shareEmailDialogVisible).toBe('Passed');
    expect(evidence.shareEmailStages.sendSuccessConfirmation).toBe('Passed');
    expect(evidence.sendAttemptedOnce).toBe(true);
    expect(evidence.gmailMessageId).toBeTruthy();
    expect(evidence.sharedComparisonUrlRedacted).toMatch(/\/shared-report-comparison\?/);
    expect(evidence.guestComparisonVerified).toBe(true);
    expect(evidence.comparisonPairPreserved).toBe(true);
});