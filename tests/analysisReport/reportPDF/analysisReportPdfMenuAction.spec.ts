import { test, expect } from '@playwright/test';
import {
    resolvePart2LoginAccount,
    STG_APP_ORIGIN,
} from '../../login/existingUserLoginFlow';
import {
    attachAnalysisReportPdfEvidence,
    logAnalysisReportPdfEvent,
} from './analysisReportPdfReporting';
import { resolveAnalysisReportPdfSmokeTarget } from './analysisReportPdfSmokeConfig';
import { runAnalysisReportPdfMenuActionOnly } from './analysisReportPdfRunOrchestrator';

/**
 * A. Report PDF menu action — real analysis-report-print → intercepted window.print (all browsers).
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportPdfMenuAction', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const target = resolveAnalysisReportPdfSmokeTarget();

    logAnalysisReportPdfEvent('run_started', {
        project: testInfo.project.name,
        browserName: browser.browserType().name(),
        customerId: target.customerId,
        analysisId: target.analysisId,
    });

    const { evidence, primaryError } = await runAnalysisReportPdfMenuActionOnly({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        target,
    });

    let attachError: unknown = null;
    try {
        await attachAnalysisReportPdfEvidence(testInfo, evidence, null);
    } catch (error) {
        attachError = error;
        console.warn('Failed to attach menu-action evidence:', error);
    }

    if (primaryError) {
        throw primaryError;
    }
    if (attachError) {
        throw attachError;
    }

    expect(evidence.menuAction?.printInvocationCount).toBe(1);
    expect(evidence.menuAction?.titleRestored).toBe(true);
    expect(evidence.stages.applicationPrintMenuAction).toBe('Passed');
    expect(evidence.stages.a4PdfGeneration).toBe('Not reached');
});
