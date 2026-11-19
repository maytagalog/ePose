import { test, expect } from '@playwright/test';
import {
    analysisReportAllListContainer,
    analysisReportCustomerHistoryList,
    assertGlobalAnalysisReportListRoute,
    openGlobalAnalysisReportListFromMainMenu,
} from '../../../../analysisReport/reportView/analysisReportAllListLocators';
import {
    ANALYSIS_REPORT_VIEW_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_VIEW_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_VIEW_FIXTURE_ORIGIN,
    installAnalysisReportViewFixtureShell,
} from './analysisReportViewFixtureShell';
import { runAnalysisReportViewFlow } from '../../../../analysisReport/reportView/analysisReportViewFlow';
import {
    assertAnalysisReportReady,
    exerciseHelpDialogCycle,
    exerciseSectionHelpDialogCycle,
    navigateToPinnedAnalysisReport,
    resolveExercisesStretchesStep,
    singleReportBottomHistoryControl,
} from '../../../../analysisReport/reportView/analysisReportSingleReportLocators';
import { ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE } from '../../../../analysisReport/analysisReportTestIds';
import {
    assertCustomerReportHistoryReady,
    assertHistoryContainsReportRow,
} from '../../../../analysisReport/reportView/analysisReportHistoryNavigation';

const FIXTURE_ORIGIN = ANALYSIS_REPORT_VIEW_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_VIEW_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_VIEW_FIXTURE_ANALYSIS_ID;

const installShell = installAnalysisReportViewFixtureShell;

test.describe.configure({ mode: 'serial' });

/**
 * Regression: title must match trace 20261106-134217 literal — do not use ANALYSIS_REPORT_TOP_HELP_DIALOG_TITLE
 * so a wrong shared constant cannot make this pass alone.
 */
test('generation-rating help uses trace title 世代別評価とは (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    await exerciseHelpDialogCycle(page, report, 'analysis-report-generation-rating-help', '世代別評価とは');
});

test('successful viewing flow (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { __arvMode: 'success', __arvNoRecommendations: false });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const evidence = await runAnalysisReportViewFlow(
        page,
        {
            customerId: CUSTOMER_ID,
            analysisId: ANALYSIS_ID,
            customerName: 'Fixture Customer',
            customerFurigana: 'フィクスチャー',
        },
        { appOrigin: FIXTURE_ORIGIN }
    );

    expect(evidence.stepSummary['history back navigation']).toBe('Passed');
    expect(evidence.stepSummary['exercises and stretches']).toBe('Passed');
    expect(evidence.helpDialogOutcomes).toEqual({
        generationRatingHelp: 'Passed',
        resultsHelp: 'Passed',
        postureTypeHelp: 'Passed',
        legAlignmentHelp: 'Passed',
        muscleConditionHelp: 'Passed',
        exercisesStretchesHelp: 'Passed',
    });

    const order = await page.evaluate(() => (window as unknown as { __arvFlowOrder?: string[] }).__arvFlowOrder ?? []);
    expect(order).toEqual(['muscle_help', 'exercises_help', 'muscle_controls']);
});

test('readiness: page-scoped header outside report and measuredAt uses data-value (fixture)', async ({
    page,
}) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    await expect(report.locator('[data-testid="analysis-report-header"]')).toHaveCount(0);

    const header = page.getByTestId('analysis-report-header').locator('visible=true');
    await expect(header).toHaveCount(1);
    const measuredAt = header
        .getByTestId('analysis-report-header-field')
        .and(header.locator('[data-field="measuredAt"]'));
    await expect(measuredAt).toHaveAttribute('data-value', '2026-03-13T08:22:38.000Z');
    await expect(report.getByTestId('analysis-report-summary')).toBeVisible();
    await expect(report.getByTestId('analysis-report-score')).toBeVisible();
});

test('readiness: measuredAt without parseable data-value fails (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await page.evaluate(() => {
        const field = document.querySelector('[data-field="measuredAt"]');
        field?.removeAttribute('data-value');
        field?.setAttribute('data-datetime', '2026-01-01T10:00:00.000Z');
    });

    await expect(assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID)).rejects.toThrow(
        /measuredAt data-value|data-value is empty/i
    );
});

test('wrong customer/report identity fails readiness (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success', __arvWrongCustomer: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID)
    ).rejects.toThrow(/data-customer-id|data-analysis-id|identity|route identity|mismatch/i);
});

test('report load error fails explicitly (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'load_error' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID)
    ).rejects.toThrow(/data-load-state="error"/i);
});

test('photo unavailable does not require loaded image (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success', __arvPhotoMode: 'unavailable' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    const photo = report
        .getByTestId('analysis-report-photo')
        .and(report.locator('[data-view="side"]'));
    await expect(photo).toHaveAttribute('data-image-state', 'unavailable');
});

test('photo error fails (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success', __arvPhotoMode: 'error' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportViewFlow(
            page,
            { customerId: CUSTOMER_ID, analysisId: ANALYSIS_ID },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/data-image-state=error|photo/i);
});

test('empty muscle groups disable global controls (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success', __arvMuscleEmpty: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    await expect(report.getByTestId('analysis-report-muscles-show-all')).toBeDisabled();
    await expect(report.getByTestId('analysis-report-muscles-hide-all')).toBeDisabled();
});

test('section help: Close leaves prior ant-modal-root mounted and hidden (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    const posture = report.getByTestId('analysis-report-posture-type');
    const leg = report.getByTestId('analysis-report-leg-alignment');
    await exerciseSectionHelpDialogCycle(page, posture, ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.postureType);
    await exerciseSectionHelpDialogCycle(page, leg, ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.legAlignment);
    const roots = page.locator('.ant-modal-root');
    await expect(roots).toHaveCount(2);
    await expect(roots.nth(0)).toBeHidden();
    await expect(roots.nth(1)).toBeHidden();
});

test('bottom history control: DIV with header name + suffix navigates to customer history (fixture)', async ({
    page,
}) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    const bottom = await singleReportBottomHistoryControl(page, report);
    await bottom.scrollIntoViewIfNeeded();
    await bottom.click();

    await assertCustomerReportHistoryReady(page, CUSTOMER_ID);
    await assertHistoryContainsReportRow(page, CUSTOMER_ID, ANALYSIS_ID);
});

test('bottom history: wrong customer route rejects assertCustomerReportHistoryReady (fixture)', async ({ page }) => {
    test.setTimeout(60000);
    await installShell(page, {
        __arvMode: 'success',
        __arvBottomHistoryWrongCustomer: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    const bottom = await singleReportBottomHistoryControl(page, report);
    await bottom.click();

    await expect(assertCustomerReportHistoryReady(page, CUSTOMER_ID)).rejects.toThrow();
});

test('global list route keeps cirs-analysis-list with coexistent analysis-report-history-list hook (fixture)', async ({
    page,
}) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openGlobalAnalysisReportListFromMainMenu(page);
    await assertGlobalAnalysisReportListRoute(page);
    await expect(analysisReportAllListContainer(page)).toBeVisible();
    await expect(analysisReportCustomerHistoryList(page).locator('visible=true')).toHaveCount(1);
});

test('recommendations legitimately absent skips step when posture is normal (fixture)', async ({ page }) => {
    await installShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: true,
        __arvPoseType: 'normal',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const evidence = await runAnalysisReportViewFlow(
        page,
        { customerId: CUSTOMER_ID, analysisId: ANALYSIS_ID, customerName: 'Fixture Customer' },
        { appOrigin: FIXTURE_ORIGIN }
    );
    expect(evidence.stepSummary['exercises and stretches']).toBe('Skipped');
    expect(evidence.skipReasons['exercises and stretches']).toMatch(/normal posture/i);
    expect(evidence.helpDialogOutcomes.exercisesStretchesHelp).toBe('Skipped');

    const order = await page.evaluate(() => (window as unknown as { __arvFlowOrder?: string[] }).__arvFlowOrder ?? []);
    expect(order).toEqual(['muscle_help', 'muscle_controls']);
});

test('exercises absent: display setting confirmed off skips (fixture)', async ({ page }) => {
    await installShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: true,
        __arvPoseType: 'hunchback',
        __arvExercisesDisplayToggle: 'false',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    const outcome = await resolveExercisesStretchesStep(page, report);
    expect(outcome).toEqual(
        expect.objectContaining({
            status: 'skipped',
            reason: expect.stringMatching(/Display setting confirmed off/i),
        })
    );
});

test('exercises absent: display setting on fails (fixture)', async ({ page }) => {
    await installShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: true,
        __arvPoseType: 'hunchback',
        __arvExercisesDisplayToggle: 'true',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    await expect(resolveExercisesStretchesStep(page, report)).rejects.toThrow(
        /Expected analysis-report-exercises-stretches section while display setting is on/i
    );
});

test('exercises absent: unreadable display toggle fails (fixture)', async ({ page }) => {
    await installShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: true,
        __arvPoseType: 'hunchback',
        __arvOmitDisplaySettingsUi: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    const report = await assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID);
    await expect(resolveExercisesStretchesStep(page, report)).rejects.toThrow(
        /analysis-report-actions-toggle|Could not read analysis-report-exercises-stretches-toggle/i
    );
});

test('readiness: stuck loading fails with bounded load-state message (fixture)', async ({ page }) => {
    test.setTimeout(45000);
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await page.evaluate(() => {
        const report = document.querySelector('[data-testid="analysis-report"]');
        report?.setAttribute('data-load-state', 'loading');
    });
    await expect(assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID)).rejects.toThrow(
        /remained loading through bounded wait/i
    );
});

test('readiness: off-route posture-analysis-report fails before load-state poll (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await page.evaluate(
        ({ customerId }) => {
            history.replaceState({}, '', `/customers/${customerId}/posture-analysis-report`);
        },
        { customerId: CUSTOMER_ID }
    );
    await expect(assertAnalysisReportReady(page, CUSTOMER_ID, ANALYSIS_ID)).rejects.toThrow(/route identity|mismatch/i);
});

test('navigateToPinnedAnalysisReport from customer page opens pinned report (fixture)', async ({ page }) => {
    await installShell(page, { __arvMode: 'success' });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
    await navigateToPinnedAnalysisReport(page, FIXTURE_ORIGIN, CUSTOMER_ID, ANALYSIS_ID);
    await expect(page).toHaveURL(new RegExp(`/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`));
});
