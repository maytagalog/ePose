import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import { loginAndOpenCustomerReportHistory } from './analysisReportDeletionNavigation';
import {
    evaluateReconciliationVerification,
    reconcileDeletionPlanLedgerOnly,
    reconcilePinnedDeletionPlanOnPage,
} from './analysisReportDeletionReconciliation';
import { installAnalysisReportDeletionFixtureShell } from '../../e2e/fixtures/analysisReport/reportDeletion/analysisReportDeletionFixtureShell';
import {
    ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN,
} from '../../e2e/fixtures/analysisReport/reportDeletion/analysisReportDeletionFixtureShell';

test.describe.configure({ mode: 'serial', retries: 0 });

test('reconcile deletion plan ledger only (executable)', () => {
    const planId = process.env.ANALYSIS_REPORT_DELETION_PLAN_ID?.trim();
    test.skip(!planId, 'Set ANALYSIS_REPORT_DELETION_PLAN_ID for read-only ledger reconciliation.');
    const result = reconcileDeletionPlanLedgerOnly(planId!);
    expect(result.plan.planId).toBe(planId);
    console.log(JSON.stringify(result, null, 2));
});

test('reconcile deletion plan on customer history (fixture, read-only)', async ({ page }, testInfo) => {
    const planId = process.env.ANALYSIS_REPORT_DELETION_PLAN_ID?.trim();
    test.skip(!planId, 'Set ANALYSIS_REPORT_DELETION_PLAN_ID from a prior cancel-only run.');

    await installAnalysisReportDeletionFixtureShell(page);
    await page.goto(
        `${ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN}/customers/${ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID}/posture-analysis-report`
    );

    const tieBreak = process.env.ANALYSIS_REPORT_DELETION_TIE_BREAK_ANALYSIS_ID?.trim() ?? null;
    const result = await reconcilePinnedDeletionPlanOnPage(
        page,
        ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN,
        planId!,
        tieBreak
    );
    const verdict = evaluateReconciliationVerification(result);
    await test.info().attach('deletion-reconcile-evidence.json', {
        body: JSON.stringify({ result, verdict }, null, 2),
        contentType: 'application/json',
    });
    console.log(JSON.stringify({ result, verdict }, null, 2));
    expect(result.plan.planId).toBe(planId);
    expect(result.environment).toBe('fixture-synthetic');
    expect(result.provesStagingReportState).toBe(false);
    expect(verdict.passed).toBe(false);
});

test('reconcile deletion plan on staging customer history (manual, read-only)', async ({ page, browser }, testInfo) => {
    test.setTimeout(180000);
    test.skip(browser.browserType().name() !== 'chromium', 'Chromium only.');
    const planId = process.env.ANALYSIS_REPORT_DELETION_PLAN_ID?.trim();
    const customerId = process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID?.trim();
    test.skip(!planId || !customerId, 'Requires ANALYSIS_REPORT_DELETION_PLAN_ID and ANALYSIS_REPORT_DELETION_CUSTOMER_ID.');

    const pinnedPlanId = planId as string;
    const pinnedCustomerId = customerId as string;
    const account = resolvePart2LoginAccount();
    await loginAndOpenCustomerReportHistory(page, account, STG_APP_ORIGIN, pinnedCustomerId);
    const tieBreak = process.env.ANALYSIS_REPORT_DELETION_TIE_BREAK_ANALYSIS_ID?.trim() ?? null;
    const result = await reconcilePinnedDeletionPlanOnPage(page, STG_APP_ORIGIN, pinnedPlanId, tieBreak);
    const verdict = evaluateReconciliationVerification(result);
    await testInfo.attach('deletion-reconcile-evidence.json', {
        body: JSON.stringify({ result, verdict }, null, 2),
        contentType: 'application/json',
    });
    console.log(JSON.stringify({ result, verdict }, null, 2));
    expect(result.plan.customerId).toBe(pinnedCustomerId);
    expect(result.environment).toBe('live-staging');
    expect(verdict.passed, verdict.summary).toBe(true);
});
