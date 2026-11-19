import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../../../login/existingUserLoginFlow';
import {
    finalizeComparisonReportShareQrRun,
    runComparisonReportShareQrStandalone,
} from './comparisonReportShareQrRunOrchestrator';

/**
 * Standalone Comparison Report Share QR (login → comparison flow → ellipsis → QR open/close).
 *
 * Run (headed):
 * EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' npm run pw:ar:comparison-qr -- --headed
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('comparisonReportShareQrStandalone', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const { evidence, primaryError } = await runComparisonReportShareQrStandalone({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
    });

    await finalizeComparisonReportShareQrRun(testInfo, evidence, primaryError);

    expect(evidence.stages.terminalComparisonView).toBe('Passed');
    expect(evidence.shareQrStages.ellipsisMenuOpen).toBe('Passed');
    expect(evidence.shareQrStages.shareQrDialogVisible).toBe('Passed');
    expect(evidence.shareQrStages.shareQrContentVisible).toBe('Passed');
    expect(evidence.shareQrStages.shareQrDialogClosed).toBe('Passed');
    expect(evidence.shareQrStages.comparisonPairPreserved).toBe('Passed');
    expect(evidence.comparisonPairPreserved).toBe(true);
});