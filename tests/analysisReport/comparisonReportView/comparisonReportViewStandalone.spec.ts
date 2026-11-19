import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    finalizeComparisonReportViewRun,
    runComparisonReportViewStandalone,
} from './comparisonReportViewRunOrchestrator';

/**
 * Standalone Comparison Report View smoke (login → Nikolas customer → first posture card → compare → switch report).
 *
 * Run (headed):
 * EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' npm run pw:ar:comparison -- --headed
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('comparisonReportViewStandalone', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { evidence, primaryError } = await runComparisonReportViewStandalone({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
    });

    await finalizeComparisonReportViewRun(testInfo, evidence, primaryError);

    expect(evidence.stages.comparisonOpen).toBe('Passed');
    expect(evidence.stages.reportSelectionSwitch).toBe('Passed');
    expect(evidence.stages.terminalComparisonView).toBe('Passed');
    expect(evidence.selectedComparisonAnalysisId).toBeTruthy();
});