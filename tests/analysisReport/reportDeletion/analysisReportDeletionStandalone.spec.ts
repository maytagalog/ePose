import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    finalizeAnalysisReportDeletionRun,
    runAnalysisReportDeletionStandalone,
} from './analysisReportDeletionRunOrchestrator';
import { resolveAnalysisReportDeletionRunConfig } from './analysisReportDeletionConfig';

test.describe.configure({ mode: 'serial', retries: 0, timeout: 600000 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportDeletionStandalone', async ({ page, browser }, testInfo) => {
    test.skip(
        browser.browserType().name() !== 'chromium',
        'Destructive deletion review is Chromium-only for this session.'
    );

    const config = resolveAnalysisReportDeletionRunConfig(STG_APP_ORIGIN);
    const account = resolvePart2LoginAccount();

    const { evidence, primaryError } = await runAnalysisReportDeletionStandalone({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        config,
    });

    await finalizeAnalysisReportDeletionRun(testInfo, evidence, primaryError);

    if (config.mode === 'off') {
        expect(evidence.stages.login).toBe('Skipped');
        expect(evidence.actualDeletionReported).toBe(false);
        return;
    }

    if (config.mode === 'cancel') {
        expect(evidence.plan?.planId).toBeTruthy();
        expect(evidence.plan?.lifecycle).toBe('cancel_verified');
        expect(evidence.actualDeletionReported).toBe(false);
        return;
    }

    expect(evidence.actualDeletionReported).toBe(true);
    expect(evidence.plan?.lifecycle).toBe('completed');
});
