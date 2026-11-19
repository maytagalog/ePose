import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    finalizeAnalysisReportFullRun,
    runAnalysisReportFullStandalone,
} from './analysisReportFullRunOrchestrator';
import { resolveAnalysisReportFullSmokeConfig } from './analysisReportFullSmokeConfig';

test.describe.configure({ mode: 'serial', retries: 0, timeout: 900000 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportFullStandalone', async ({ page, browser }, testInfo) => {
    test.skip(browser.browserType().name() !== 'chromium', 'Combined Analysis Report smoke is Chromium-only.');
    const account = resolvePart2LoginAccount();
    const config = resolveAnalysisReportFullSmokeConfig(STG_APP_ORIGIN);

    const { evidence, primaryError } = await runAnalysisReportFullStandalone({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        config,
    });

    await finalizeAnalysisReportFullRun(testInfo, evidence, primaryError);

    expect(evidence.preflight?.sourceAnalysisId).toBeTruthy();
    expect(evidence.sourceAnalysisId).toBe(evidence.preflight?.sourceAnalysisId);
    if (config.deletionMode === 'off') {
        expect(evidence.featureStages.reportDeletion).toBe('Skipped');
    }
    expect(evidence.combinedPassed).toBe(true);
});
