import { test, expect, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
    STG_APP_ORIGIN,
} from '../../../login/existingUserLoginFlow';
import { resolveAnalysisReportViewFromEnv } from '../../reportView/analysisReportViewFlow';
import {
    analysisReportShareQrEvidenceAttachmentBody,
    type AnalysisReportShareQrRunEvidence,
} from './analysisReportShareQrReporting';
import { runAnalysisReportShareQrOpenCloseFlow } from './analysisReportShareQrFlow';

/**
 * Standalone Analysis Report Share QR dialog open/close (Part 2 login only).
 *
 * Required env:
 * - ANALYSIS_REPORT_VIEW_CUSTOMER_ID
 * - ANALYSIS_REPORT_VIEW_ANALYSIS_ID
 * - EPOSE_SMOKE_PART2_EMAIL
 * - EPOSE_SMOKE_PART2_PASSWORD
 *
 * Run (staging):
 * Fixture regressions: tests/e2e/fixtures/analysisReport/sharing/qrCode/analysisReportShareQr.fixture.spec.ts
 * npx playwright test tests/analysisReport/sharing/qrCode/analysisReportShareQr.spec.ts --project=chromium --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

const hasEnv =
    Boolean(process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID?.trim()) &&
    Boolean(process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID?.trim());

async function attachEvidence(testInfo: TestInfo, payload: AnalysisReportShareQrRunEvidence): Promise<void> {
    try {
        await testInfo.attach('analysis-report-share-qr', {
            body: analysisReportShareQrEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach analysis-report-share-qr evidence:', error);
    }
}

test('standalone: Share QR dialog open and close', async ({ page }, testInfo) => {
    test.skip(
        !hasEnv,
        'Set ANALYSIS_REPORT_VIEW_CUSTOMER_ID and ANALYSIS_REPORT_VIEW_ANALYSIS_ID for staging runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const input = resolveAnalysisReportViewFromEnv();

    await test.step('login existing Part 2 account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    const evidence = await test.step('share QR open close', async () => {
        return runAnalysisReportShareQrOpenCloseFlow(page, input.customerId, input.analysisId, STG_APP_ORIGIN);
    });

    await attachEvidence(testInfo, evidence);
    expect(evidence.qrDialogOpened).toBe(true);
    expect(evidence.qrDialogClosed).toBe(true);
    expect(evidence.reportStillReady).toBe(true);
    expect(evidence.failureStep).toBeNull();
});
