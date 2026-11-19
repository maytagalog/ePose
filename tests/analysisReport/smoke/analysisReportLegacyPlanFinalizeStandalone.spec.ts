import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    defaultLegacyFinalizePlanId,
    resolveLegacyFinalizeExpectedTargetAnalysisId,
    runAnalysisReportLegacyPlanFinalizeStandalone,
} from './analysisReportLegacyPlanFinalizeRun';

/**
 * Legacy plan finalization only (staging read-only reconcile + local ledger).
 * No display settings, email, PDF, history capture, or deletion POST.
 */
test.describe.configure({ mode: 'serial', retries: 0, timeout: 600000 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportLegacyPlanFinalizeStandalone', async ({ page, browser }, testInfo) => {
    test.skip(browser.browserType().name() !== 'chromium', 'Legacy plan finalization is Chromium-only.');
    const customerId = process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID?.trim() ?? '';
    test.skip(!customerId, 'Set ANALYSIS_REPORT_DELETION_CUSTOMER_ID for customer history reconcile.');
    const account = resolvePart2LoginAccount();
    const planId = defaultLegacyFinalizePlanId();
    const tieBreakAnalysisId =
        process.env.ANALYSIS_REPORT_DELETION_TIE_BREAK_ANALYSIS_ID?.trim() || null;

    const evidence = await runAnalysisReportLegacyPlanFinalizeStandalone({
        page,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        planId,
        customerId,
        tieBreakAnalysisId,
    });

    await testInfo.attach('analysis-report-legacy-plan-finalize.json', {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json',
    });

    expect(evidence.stagingReadOnly).toBe(true);
    expect(evidence.localLedgerWrites).toBe(true);
    expect(evidence.planId).toBe(planId);
    expect(evidence.finalization.targetAnalysisId).toBe(
        resolveLegacyFinalizeExpectedTargetAnalysisId(planId)
    );
    expect(evidence.finalization.reconciliationVerified).toBe(true);
});
