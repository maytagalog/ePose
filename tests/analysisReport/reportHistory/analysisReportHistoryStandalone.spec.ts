import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    finalizeAnalysisReportHistoryRun,
    runAnalysisReportHistoryStandalone,
} from './analysisReportHistoryRunOrchestrator';
import { resolveAnalysisReportHistorySmokeTarget } from './analysisReportHistorySmokeConfig';

/**
 * Standalone Analysis Report History (ellipsis menu → verified customer history list; stops on list).
 *
 * Run:
 * EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' \
 *   npm run pw:ar:history
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('analysisReportHistoryStandalone', async ({ page, browser }, testInfo) => {
    test.setTimeout(600000);

    const account = resolvePart2LoginAccount();
    const target = resolveAnalysisReportHistorySmokeTarget();

    const { evidence, primaryError } = await runAnalysisReportHistoryStandalone({
        page,
        browser,
        testInfo,
        account,
        appOrigin: STG_APP_ORIGIN,
        target,
    });

    await finalizeAnalysisReportHistoryRun(testInfo, evidence, primaryError);

    expect(evidence.stages.ellipsisHistoryAction).toBe('Passed');
    expect(evidence.stages.customerHistoryListTerminal).toBe('Passed');
    expect(evidence.sourceIdentity).not.toBeNull();
});
