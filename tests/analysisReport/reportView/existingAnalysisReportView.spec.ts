import { test, expect, type TestInfo } from '@playwright/test';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../../login/existingUserLoginFlow';
import {
    analysisReportViewEvidenceAttachmentBody,
    resolveAnalysisReportViewFromEnv,
    runAnalysisReportViewFlow,
    type AnalysisReportViewRunEvidence,
} from './analysisReportViewFlow';

/**
 * Standalone Analysis Report viewing (Part 2 account, no Part 2 wiring).
 *
 * Required env:
 * - ANALYSIS_REPORT_VIEW_CUSTOMER_ID
 * - ANALYSIS_REPORT_VIEW_ANALYSIS_ID
 * - EPOSE_SMOKE_PART2_EMAIL / EPOSE_SMOKE_PART2_PASSWORD
 *
 * Optional:
 * - ANALYSIS_REPORT_VIEW_CUSTOMER_NAME / ANALYSIS_REPORT_VIEW_CUSTOMER_FURIGANA (history back identity)
 *
 * Run:
 * npx playwright test tests/analysisReport/reportView/existingAnalysisReportView.spec.ts --project=chromium --workers=1
 */
test.describe.configure({ retries: 0 });

/** Match normal Chrome layout window (inner 1404×856, DPR 2); spec-local only. */
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

async function attachEvidence(testInfo: TestInfo, payload: AnalysisReportViewRunEvidence): Promise<void> {
    try {
        await testInfo.attach('analysis-report-view', {
            body: analysisReportViewEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach analysis-report-view evidence:', error);
    }
}

test('standalone: Analysis Report viewing flow', async ({ page }, testInfo) => {
    test.skip(
        !hasEnv,
        'Set ANALYSIS_REPORT_VIEW_CUSTOMER_ID and ANALYSIS_REPORT_VIEW_ANALYSIS_ID for staging runs.'
    );
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const input = resolveAnalysisReportViewFromEnv();
    let latestEvidence: AnalysisReportViewRunEvidence | null = null;

    await test.step('login existing Part 2 account', async () => {
        await loginExistingUserForPart2(page, account);
    });

    try {
        const evidence = await test.step('analysis report viewing', async () => {
            return runAnalysisReportViewFlow(page, input, {
                accountEmail: account.email,
                onEvidence: (evidence) => {
                    latestEvidence = evidence;
                },
            });
        });
        await attachEvidence(testInfo, evidence);
        expect(evidence.stepSummary['single report readiness']).toBe('Passed');
    } catch (error) {
        if (latestEvidence) {
            await attachEvidence(testInfo, latestEvidence);
        }
        throw error;
    }
});
