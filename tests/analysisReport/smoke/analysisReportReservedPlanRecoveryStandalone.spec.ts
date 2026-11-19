import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    resolveReservedRecoveryCustomerId,
    resolveReservedRecoveryPlanId,
    resolveReservedRecoveryTargetAnalysisId,
    runReservedPlanAbandonedBeforeSubmissionRecovery,
} from './analysisReportReservedPlanRecovery';

/**
 * Staging read-only: verify target still present, mark abandoned_before_submission, release lock.
 * No delete POST or other feature mutations.
 */
test.describe.configure({ mode: 'serial', retries: 0, timeout: 600000 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportReservedPlanAbandonedBeforeSubmissionRecovery', async ({ page, browser }, testInfo) => {
    test.skip(browser.browserType().name() !== 'chromium', 'Reserved-plan recovery is Chromium-only.');
    const account = resolvePart2LoginAccount();
    const planId = resolveReservedRecoveryPlanId();
    const customerId = resolveReservedRecoveryCustomerId();
    const expectedTargetAnalysisId = resolveReservedRecoveryTargetAnalysisId();
    const tieBreakAnalysisId =
        process.env.ANALYSIS_REPORT_DELETION_TIE_BREAK_ANALYSIS_ID?.trim() || null;

    const evidence = await runReservedPlanAbandonedBeforeSubmissionRecovery({
        page,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        planId,
        customerId,
        expectedTargetAnalysisId,
        tieBreakAnalysisId,
    });

    await testInfo.attach('analysis-report-reserved-plan-recovery.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
    });

    expect(evidence.stagingReadOnly).toBe(true);
    expect(evidence.localLedgerWrites).toBe(true);
    expect(evidence.planId).toBe(planId);
    expect(evidence.recovery.reconciliationVerified).toBe(true);
    expect(evidence.recovery.targetAnalysisId).toBe(expectedTargetAnalysisId);
    expect(evidence.recovery.lockReleased).toBe(true);
    expect(evidence.recovery.reconciliation.pinnedRowPresent).toBe('yes');
    expect(evidence.recovery.reconciliation.domRowCheck).toBe('present');
});
