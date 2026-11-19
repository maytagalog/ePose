import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    finalizeAnalysisReportDeletionResumeDeleteOnce,
    resolveResumeDeleteOnceCustomerId,
    resolveResumeDeleteOncePlanId,
    resolveResumeDeleteOnceTargetAnalysisId,
    runAnalysisReportDeletionResumeDeleteOnce,
} from './analysisReportDeletionResumeDeleteOnce';

/**
 * Deletion-only resume: login → history-order pinned revalidation → guarded delete-once → fresh absence.
 * No report view, display settings, email, PDF, or new deletion plan.
 */
test.describe.configure({ mode: 'serial', retries: 0, timeout: 600000 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportDeletionResumeDeleteOnce', async ({ page, browser }, testInfo) => {
    test.skip(
        browser.browserType().name() !== 'chromium',
        'Deletion resume is Chromium-only for this session.'
    );

    const planId = resolveResumeDeleteOncePlanId();
    const customerId = resolveResumeDeleteOnceCustomerId();
    const targetAnalysisId = resolveResumeDeleteOnceTargetAnalysisId();
    const account = resolvePart2LoginAccount();

    const { evidence, primaryError } = await runAnalysisReportDeletionResumeDeleteOnce({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        planId,
        customerId,
        targetAnalysisId,
    });

    await finalizeAnalysisReportDeletionResumeDeleteOnce(testInfo, evidence, primaryError);

    expect(evidence.mode).toBe('delete-once');
    expect(evidence.planId).toBe(planId);
    expect(evidence.customerId).toBe(customerId);
    expect(evidence.analysisId).toBe(targetAnalysisId);
    expect(evidence.stages.oldestTargetSelection).toBe('Skipped');
    expect(evidence.actualDeletionReported).toBe(true);
    expect(evidence.plan?.lifecycle).toBe('completed');
});
