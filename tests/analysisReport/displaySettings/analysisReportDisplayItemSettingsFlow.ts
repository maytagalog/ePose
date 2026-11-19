import { expect, type Locator, type Page } from '@playwright/test';
import {
    ANALYSIS_REPORT_LOAD_STATES,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
    REPORT_LOAD_STATE_ATTR,
} from '../analysisReportTestIds';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import { AnalysisReportViewFlowError } from '../reportView/analysisReportViewErrors';
import {
    analysisReportRoot,
    navigateToPinnedAnalysisReport,
} from '../reportView/analysisReportSingleReportLocators';
import { expectAnalysisReportDisplaySettingsModalDialog } from './analysisReportDisplaySettingsModal';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

export class AnalysisReportDisplayItemSettingsSkipError extends Error {
    readonly skipReason: string;
    readonly evidenceSnapshot: AnalysisReportDisplayItemSettingsEvidence;
    constructor(reason: string, evidenceSnapshot: AnalysisReportDisplayItemSettingsEvidence) {
        super(reason);
        this.name = 'AnalysisReportDisplayItemSettingsSkipError';
        this.skipReason = reason;
        this.evidenceSnapshot = evidenceSnapshot;
    }
}

export type AnalysisReportDisplayItemSettingsEvidence = {
    customerId: string;
    analysisId: string;
    initialToggleAriaChecked: 'true' | 'false';
    intendedToggleAriaChecked: 'true' | 'false';
    savedToggleReverified: boolean;
    exercisesSectionOutcome: 'hidden' | 'visible_ready' | 'skipped_prerequisites';
    failureStep: string | null;
};

async function eligibleForExercisesOnVerification(
    page: Page,
    report: Locator
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const pose =
        (
            await report
                .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.postureTypeValue)
                .getAttribute('data-pose-type')
        )
            ?.trim()
            .toLowerCase() ?? '';
    const lang = (await page.locator('html').getAttribute('lang'))?.trim().toLowerCase() ?? '';
    if (!pose || pose === 'normal') {
        return {
            ok: false,
            reason: `Unsupported prerequisite for ON visibility check: data-pose-type=${pose || 'missing'} (need non-normal).`,
        };
    }
    if (lang.startsWith('en')) {
        return {
            ok: false,
            reason: `Unsupported prerequisite for ON visibility check: html lang=${lang} (need non-English).`,
        };
    }
    return { ok: true };
}

export async function openAnalysisReportActionsMenu(page: Page): Promise<void> {
    const toggle = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsToggle);
    await expect(toggle).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await toggle.click({ timeout: ACTION_TIMEOUT_MS });
}

/**
 * Screenshot-confirmed: menu visible with data-report-view=single; 表示項目の設定 via test id (DIV allowed).
 */
export async function openAnalysisReportDisplayItemSettingsDialog(page: Page): Promise<Locator> {
    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(menu).toHaveAttribute('data-report-view', 'single');
    const displaySettings = menu.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsOpen);
    await expect(displaySettings).toHaveCount(1);
    await displaySettings.click({ timeout: ACTION_TIMEOUT_MS });

    return expectAnalysisReportDisplaySettingsModalDialog(page);
}

async function readExercisesToggleAria(dialog: Locator): Promise<'true' | 'false'> {
    const toggle = dialog.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretchesToggle);
    await expect(toggle).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const v = await toggle.getAttribute('aria-checked');
    if (v !== 'true' && v !== 'false') {
        throw new AnalysisReportViewFlowError(
            `Invalid analysis-report-exercises-stretches-toggle aria-checked=${v ?? 'null'} (need true or false).`
        );
    }
    return v;
}

async function closeDisplaySettingsCancel(page: Page, dialog: Locator): Promise<void> {
    const cancel = dialog.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsCancel);
    await expect(cancel).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await cancel.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toBeHidden({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function submitDisplayItemSettingsSave(page: Page, dialog: Locator): Promise<void> {
    const saveButton = dialog.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsSave);
    await expect(saveButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await saveButton.click({ timeout: ACTION_TIMEOUT_MS });
}

async function assertExercisesSectionMatchesToggle(report: Locator, on: boolean): Promise<void> {
    const section = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretches);
    if (!on) {
        await expect(section).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        return;
    }
    await expect(section).toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });
    await expect(section).toHaveAttribute(REPORT_LOAD_STATE_ATTR, ANALYSIS_REPORT_LOAD_STATES.ready, {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
}

/**
 * Standalone: open actions → 表示項目の設定 → toggle once → 保存 → verify report → reopen → verify persisted toggle → キャンセル.
 * Leaves the new setting applied (does not toggle back).
 */
export async function runAnalysisReportDisplayItemSettingsFlow(
    page: Page,
    customerId: string,
    analysisId: string,
    appOrigin?: string
): Promise<AnalysisReportDisplayItemSettingsEvidence> {
    const evidence: AnalysisReportDisplayItemSettingsEvidence = {
        customerId,
        analysisId,
        initialToggleAriaChecked: 'false',
        intendedToggleAriaChecked: 'true',
        savedToggleReverified: false,
        exercisesSectionOutcome: 'skipped_prerequisites',
        failureStep: null,
    };

    const origin = appOrigin ?? STG_APP_ORIGIN;

    const report = await navigateToPinnedAnalysisReport(page, origin, customerId, analysisId);

    const stepOpenMenu = async (): Promise<void> => {
        await openAnalysisReportActionsMenu(page);
    };

    const stepOpenDialog = async (): Promise<Locator> => {
        return openAnalysisReportDisplayItemSettingsDialog(page);
    };

    try {
        await stepOpenMenu();
        const dialog1 = await stepOpenDialog();

        let initial: 'true' | 'false';
        try {
            initial = await readExercisesToggleAria(dialog1);
        } catch (e) {
            evidence.failureStep = 'read_initial_toggle';
            throw e;
        }
        evidence.initialToggleAriaChecked = initial;

        const intended: 'true' | 'false' = initial === 'true' ? 'false' : 'true';
        evidence.intendedToggleAriaChecked = intended;

        if (intended === 'true') {
            const elig = await eligibleForExercisesOnVerification(page, report);
            if (!elig.ok) {
                await closeDisplaySettingsCancel(page, dialog1);
                throw new AnalysisReportDisplayItemSettingsSkipError(elig.reason, {
                    ...evidence,
                    exercisesSectionOutcome: 'skipped_prerequisites',
                    failureStep: null,
                });
            }
        }

        const toggleEl = dialog1.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretchesToggle);
        await toggleEl.click({ timeout: ACTION_TIMEOUT_MS });
        try {
            await expect(toggleEl).toHaveAttribute('aria-checked', intended, { timeout: ACTION_TIMEOUT_MS });
        } catch (e) {
            evidence.failureStep = 'assert_toggle_after_click';
            throw e;
        }

        try {
            await submitDisplayItemSettingsSave(page, dialog1);
            await expect(dialog1).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        } catch (e) {
            evidence.failureStep = 'save_or_modal_close';
            throw e;
        }

        try {
            if (intended === 'false') {
                await assertExercisesSectionMatchesToggle(report, false);
                evidence.exercisesSectionOutcome = 'hidden';
            } else {
                await assertExercisesSectionMatchesToggle(report, true);
                evidence.exercisesSectionOutcome = 'visible_ready';
            }
        } catch (e) {
            evidence.failureStep = 'exercises_section_visibility_or_load_state';
            throw e;
        }

        await openAnalysisReportActionsMenu(page);
        const dialog2 = await openAnalysisReportDisplayItemSettingsDialog(page);
        try {
            await expect(
                dialog2.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretchesToggle)
            ).toHaveAttribute('aria-checked', intended, { timeout: ACTION_TIMEOUT_MS });
        } catch (e) {
            evidence.failureStep = 'persisted_toggle_mismatch';
            throw e;
        }
        evidence.savedToggleReverified = true;

        await closeDisplaySettingsCancel(page, dialog2);

        return evidence;
    } catch (e) {
        if (e instanceof AnalysisReportDisplayItemSettingsSkipError) {
            throw e;
        }
        if (evidence.failureStep === null) {
            evidence.failureStep = 'unknown';
        }
        throw e;
    }
}
