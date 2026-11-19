import { test, expect, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
    STG_APP_ORIGIN,
} from '../../login/existingUserLoginFlow';
import { resolveAnalysisReportViewFromEnv } from '../reportView/analysisReportViewFlow';
import {
    AnalysisReportDisplayItemSettingsSkipError,
    runAnalysisReportDisplayItemSettingsFlow,
    type AnalysisReportDisplayItemSettingsEvidence,
} from './analysisReportDisplayItemSettingsFlow';

/**
 * Standalone Analysis Report Display Item Settings (Part 2 login only; no full viewing flow).
 *
 * Required env:
 * - ANALYSIS_REPORT_VIEW_CUSTOMER_ID
 * - ANALYSIS_REPORT_VIEW_ANALYSIS_ID
 * - EPOSE_SMOKE_PART2_EMAIL / EPOSE_SMOKE_PART2_PASSWORD
 *
 * Run (staging):
 * npx playwright test tests/analysisReport/displaySettings/analysisReportDisplayItemSettings.spec.ts --project=chromium --workers=1
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

function evidenceAttachmentBody(payload: AnalysisReportDisplayItemSettingsEvidence): string {
    return JSON.stringify(payload, null, 2);
}

async function attachEvidence(testInfo: TestInfo, payload: AnalysisReportDisplayItemSettingsEvidence): Promise<void> {
    try {
        await testInfo.attach('analysis-report-display-item-settings', {
            body: evidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach analysis-report-display-item-settings evidence:', error);
    }
}

test('standalone: Display Item Settings flow', async ({ page }, testInfo) => {
    test.skip(
        !hasEnv,
        'Set ANALYSIS_REPORT_VIEW_CUSTOMER_ID and ANALYSIS_REPORT_VIEW_ANALYSIS_ID for staging runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const input = resolveAnalysisReportViewFromEnv();
    let latest: AnalysisReportDisplayItemSettingsEvidence | null = null;

    await test.step('login existing Part 2 account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    try {
        const evidence = await test.step('display item settings', async () => {
            return runAnalysisReportDisplayItemSettingsFlow(page, input.customerId, input.analysisId, STG_APP_ORIGIN);
        });
        latest = evidence;
        await attachEvidence(testInfo, evidence);
        expect(evidence.savedToggleReverified).toBe(true);
        expect(evidence.failureStep).toBeNull();
    } catch (error) {
        if (latest) {
            await attachEvidence(testInfo, latest);
        }
        if (error instanceof AnalysisReportDisplayItemSettingsSkipError) {
            await attachEvidence(testInfo, error.evidenceSnapshot);
            test.skip(true, error.skipReason);
        }
        throw error;
    }
});
