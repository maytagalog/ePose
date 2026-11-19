import { test, expect } from '@playwright/test';
import {
    ANALYSIS_REPORT_VIEW_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_VIEW_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_VIEW_FIXTURE_ORIGIN,
    installAnalysisReportViewFixtureShell,
} from '../reportView/analysisReportViewFixtureShell';
import {
    AnalysisReportDisplayItemSettingsSkipError,
    openAnalysisReportActionsMenu,
    runAnalysisReportDisplayItemSettingsFlow,
} from '../../../../analysisReport/displaySettings/analysisReportDisplayItemSettingsFlow';
import { expectAnalysisReportDisplaySettingsModalDialog } from '../../../../analysisReport/displaySettings/analysisReportDisplaySettingsModal';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../../analysisReport/analysisReportTestIds';

const FIXTURE_ORIGIN = ANALYSIS_REPORT_VIEW_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_VIEW_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_VIEW_FIXTURE_ANALYSIS_ID;

test.describe.configure({ mode: 'serial' });

test('display settings: ant-modal root has no visible box while inner dialog is open (fixture)', async ({
    page,
}) => {
    test.setTimeout(60000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvDisplaySettingsRootNoBoundingBox: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsOpen).click();

    const root = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsDialog);
    await expect(root).not.toBeVisible();

    const innerDialog = await expectAnalysisReportDisplaySettingsModalDialog(page);
    await expect(innerDialog).toBeVisible();

    await innerDialog.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsCancel).click();
    await expect(innerDialog).toBeHidden();
});

test('display item settings: initially ON toggles OFF and saves (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: false,
        __arvExercisesDisplayToggle: 'true',
        __arvPoseType: 'hunchback',
        __arvUiLang: 'ja',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const evidence = await runAnalysisReportDisplayItemSettingsFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN);
    expect(evidence.initialToggleAriaChecked).toBe('true');
    expect(evidence.intendedToggleAriaChecked).toBe('false');
    expect(evidence.savedToggleReverified).toBe(true);
    expect(evidence.exercisesSectionOutcome).toBe('hidden');
    expect(evidence.failureStep).toBeNull();

    const section = page.getByTestId('analysis-report-exercises-stretches');
    await expect(section).toBeHidden();
});

test('display item settings: initially OFF toggles ON and section ready (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: false,
        __arvExercisesDisplayToggle: 'false',
        __arvPoseType: 'hunchback',
        __arvUiLang: 'ja',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const evidence = await runAnalysisReportDisplayItemSettingsFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN);
    expect(evidence.initialToggleAriaChecked).toBe('false');
    expect(evidence.intendedToggleAriaChecked).toBe('true');
    expect(evidence.savedToggleReverified).toBe(true);
    expect(evidence.exercisesSectionOutcome).toBe('visible_ready');
    expect(evidence.failureStep).toBeNull();
});

test('display item settings: invalid toggle aria-checked fails before save (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvInvalidExercisesToggleAria: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportDisplayItemSettingsFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN)
    ).rejects.toThrow(/aria-checked|true or false/i);
});

test('display item settings: save control does not close modal fails (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvDisplaySettingsSaveFails: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportDisplayItemSettingsFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN)
    ).rejects.toThrow(/save_or_modal_close|hidden/i);
});

test('display item settings: persisted toggle mismatch after save fails (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvDisplaySettingsPersistMismatch: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportDisplayItemSettingsFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN)
    ).rejects.toThrow(/persisted_toggle_mismatch|aria-checked/i);
});

test('display item settings: exercises visibility mismatch after save fails (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: false,
        __arvExercisesVisibilityMismatchOnSave: true,
        __arvExercisesDisplayToggle: 'false',
        __arvPoseType: 'hunchback',
        __arvUiLang: 'ja',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    await expect(
        runAnalysisReportDisplayItemSettingsFlow(page, CUSTOMER_ID, ANALYSIS_ID, FIXTURE_ORIGIN)
    ).rejects.toThrow(/exercises_section_visibility|visible|load-state/i);
});

test('display item settings: English UI skips ON verification without mutation (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: false,
        __arvExercisesDisplayToggle: 'false',
        __arvPoseType: 'hunchback',
        __arvUiLang: 'en',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const errEn = await runAnalysisReportDisplayItemSettingsFlow(
        page,
        CUSTOMER_ID,
        ANALYSIS_ID,
        FIXTURE_ORIGIN
    ).catch((e: unknown) => e);
    expect(errEn).toBeInstanceOf(AnalysisReportDisplayItemSettingsSkipError);
    const skip = errEn as AnalysisReportDisplayItemSettingsSkipError;
    expect(skip.skipReason).toMatch(/non-English|lang=/i);
    expect(skip.evidenceSnapshot.exercisesSectionOutcome).toBe('skipped_prerequisites');

    const section = page.getByTestId('analysis-report-exercises-stretches');
    await expect(section).toBeHidden();
});

test('display item settings: normal posture skips ON verification without mutation (fixture)', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportViewFixtureShell(page, {
        __arvMode: 'success',
        __arvNoRecommendations: false,
        __arvExercisesDisplayToggle: 'false',
        __arvPoseType: 'normal',
        __arvUiLang: 'ja',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);

    const errPose = await runAnalysisReportDisplayItemSettingsFlow(
        page,
        CUSTOMER_ID,
        ANALYSIS_ID,
        FIXTURE_ORIGIN
    ).catch((e: unknown) => e);
    expect(errPose).toBeInstanceOf(AnalysisReportDisplayItemSettingsSkipError);
    const skipPose = errPose as AnalysisReportDisplayItemSettingsSkipError;
    expect(skipPose.skipReason).toMatch(/non-normal|data-pose-type/i);

    const section = page.getByTestId('analysis-report-exercises-stretches');
    await expect(section).toBeHidden();
});
