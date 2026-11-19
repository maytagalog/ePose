import { test, expect } from '@playwright/test';
import { resolvePart2LoginAccount, STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import { runLogoutAndVerify } from '../../logout/logoutFlow';
import { runPart2ComparisonReportPhase } from '../../e2e/shared/part2ComparisonReportPhase';
import { resolveComparisonReportViewSmokeTarget } from './comparisonReportViewSmokeConfig';
import { loginAndReachCustomersForComparisonView } from './comparisonReportViewCustomerNavigation';

/**
 * Standalone Part 2 comparison chain (login → comparison view/QR/email/PDF/exit → logout).
 *
 * Run (headed):
 * EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' npm run pw:ar:comparison-part2-chain -- --headed
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    viewport: { width: 1404, height: 856 },
    deviceScaleFactor: 2,
});

test('comparisonReportPart2ChainStandalone', async ({ page, browser }, testInfo) => {
    test.setTimeout(900000);

    const account = resolvePart2LoginAccount();
    const target = resolveComparisonReportViewSmokeTarget();

    await loginAndReachCustomersForComparisonView(page, account);

    const comparisonRun = await runPart2ComparisonReportPhase({
        page,
        browser,
        testInfo,
        appOrigin: STG_APP_ORIGIN,
        identity: {
            customerId: target.customerId,
            customerName: target.expectedFirstCustomerName,
        },
    });

    if (comparisonRun.primaryError) {
        throw comparisonRun.primaryError;
    }
    expect(comparisonRun.evidence.combinedPassed).toBe(true);
    expect(comparisonRun.evidence.returnedSingleReportAnalysisId).toBeTruthy();

    await runLogoutAndVerify(page);
});