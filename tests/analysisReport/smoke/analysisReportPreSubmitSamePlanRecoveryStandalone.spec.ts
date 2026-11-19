import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    resolvePreSubmitSamePlanRecoveryCustomerId,
    resolvePreSubmitSamePlanRecoveryPlanId,
    resolvePreSubmitSamePlanRecoveryTargetAnalysisId,
    runPreSubmitSamePlanCancelVerifiedRecovery,
} from './analysisReportPreSubmitSamePlanRecovery';
import { loadDeletionPlan, readDeletionSubmissionLockRecord } from '../reportDeletion/analysisReportDeletionPlanLedger';

/**
 * Pre-submit same-plan recovery: restore cancel_verified for retry; staging read-only; no delete POST.
 */
test.describe.configure({ mode: 'serial', retries: 0, timeout: 600000 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportPreSubmitSamePlanCancelVerifiedRecovery', async ({ page, browser }, testInfo) => {
    test.skip(browser.browserType().name() !== 'chromium', 'Same-plan recovery is Chromium-only.');
    const account = resolvePart2LoginAccount();
    const planId = resolvePreSubmitSamePlanRecoveryPlanId();
    const customerId = resolvePreSubmitSamePlanRecoveryCustomerId();
    const expectedTargetAnalysisId = resolvePreSubmitSamePlanRecoveryTargetAnalysisId();

    const evidence = await runPreSubmitSamePlanCancelVerifiedRecovery({
        page,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        planId,
        customerId,
        expectedTargetAnalysisId,
    });

    await testInfo.attach('analysis-report-pre-submit-same-plan-recovery.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
    });

    expect(evidence.stagingReadOnly).toBe(true);
    expect(evidence.localLedgerWrites).toBe(true);
    expect(evidence.recovery.historyOrderNewestVerified).toBe(true);
    expect(evidence.recovery.domRowPresent).toBe(true);
    expect(evidence.recovery.lockReleased).toBe(true);
    expect(readDeletionSubmissionLockRecord()).toBeNull();

    const plan = loadDeletionPlan(planId);
    expect(plan.lifecycle).toBe('cancel_verified');
    expect(plan.submittedAt).toBeNull();
    expect(plan.reservedAt).toBeNull();
    expect(plan.cancelVerifiedAt).toBe(evidence.recovery.cancelVerifiedAtRetained);
    expect(plan.recoveryAuditEvents?.length).toBeGreaterThan(0);
    expect(plan.recoveryAuditEvents?.at(-1)?.priorReservedAt).toBe(evidence.recovery.priorReservedAt);
});
