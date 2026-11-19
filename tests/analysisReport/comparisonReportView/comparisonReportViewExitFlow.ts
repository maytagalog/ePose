import { expect, type Page } from '@playwright/test';
import { parseCustomerIdFromUrl } from '../../CIRS/cirsRecord/cirsRecordFlow';
import {
    ANALYSIS_REPORT_COMPARISON_TEST_IDS,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
    parseAnalysisIdFromReportUrl,
} from '../analysisReportTestIds';
import {
    assertAnalysisReportReady,
    assertAnalysisReportRouteIdentity,
} from '../reportView/analysisReportSingleReportLocators';
import { comparisonReportRoot } from './comparisonReportViewLocators';
import { ComparisonReportViewFlowError } from './comparisonReportViewErrors';
import {
    ComparisonReportViewExitStageTracker,
    failEnteredComparisonExitStages,
} from './comparisonReportViewExitStageTracker';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

export type ComparisonReportViewExitResult = {
    customerId: string;
    returnedAnalysisId: string;
    stages: ReturnType<ComparisonReportViewExitStageTracker['toRecord']>;
};

/**
 * Leaves comparison via 終了 (analysis-report-compare-exit) on the current staff page and
 * asserts single-report readiness without re-running comparison section scroll checks.
 */
export async function exitComparisonReportViewToSingleReport(
    page: Page,
    appOrigin: string,
    expectedCustomerId: string,
    tracker: ComparisonReportViewExitStageTracker
): Promise<ComparisonReportViewExitResult> {
    try {
        await expect(
            comparisonReportRoot(page),
            'comparison view visible before exit'
        ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

        tracker.enter('compareExitClick');
        const exit = page.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.compareExit);
        await expect(exit, 'analysis-report-compare-exit visible').toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        await exit.click({ timeout: ACTION_TIMEOUT_MS });
        tracker.pass('compareExitClick');

        tracker.enter('comparisonViewAbsent');
        const comparisonRoot = comparisonReportRoot(page);
        const comparisonCount = await comparisonRoot.count();
        if (comparisonCount === 0) {
            await expect(comparisonRoot).toHaveCount(0);
        } else {
            await expect(comparisonRoot, 'analysis-report-comparison not visible after exit').toBeHidden({
                timeout: NAVIGATION_TIMEOUT_MS,
            });
        }
        await expect(
            page.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.compareExit),
            'compare-exit not visible after exit'
        ).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        tracker.pass('comparisonViewAbsent');

        tracker.enter('singleReportRouteIdentity');
        const customerIdFromRoute = parseCustomerIdFromUrl(page.url());
        const returnedAnalysisId = parseAnalysisIdFromReportUrl(page.url());
        if (!customerIdFromRoute) {
            throw new ComparisonReportViewFlowError(
                'After compare exit, route is missing /customers/{customerId}.'
            );
        }
        if (customerIdFromRoute !== expectedCustomerId) {
            throw new ComparisonReportViewFlowError(
                `After compare exit, customer id mismatch (expected ${expectedCustomerId}, got ${customerIdFromRoute}).`
            );
        }
        if (!returnedAnalysisId) {
            throw new ComparisonReportViewFlowError(
                'After compare exit, route is missing analysis id (/customers/.../reports/...).'
            );
        }
        await assertAnalysisReportRouteIdentity(
            page,
            appOrigin,
            expectedCustomerId,
            returnedAnalysisId
        );
        tracker.pass('singleReportRouteIdentity');

        tracker.enter('singleReportReady');
        await assertAnalysisReportReady(page, expectedCustomerId, returnedAnalysisId);
        await expect(page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.report)).toHaveCount(1);
        tracker.pass('singleReportReady');

        return {
            customerId: expectedCustomerId,
            returnedAnalysisId,
            stages: tracker.toRecord(),
        };
    } catch (error) {
        failEnteredComparisonExitStages(tracker);
        throw error;
    }
}