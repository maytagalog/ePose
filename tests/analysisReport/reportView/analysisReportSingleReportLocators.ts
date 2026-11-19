import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { VERIFIED_FETCH_ANALYSIS_REPORT_PATH } from '../reportDeletion/analysisReportStagingContracts';
import { parseCustomerIdFromUrl } from '../../CIRS/cirsRecord/cirsRecordFlow';
import {
    ANALYSIS_ID_ATTR,
    ANALYSIS_REPORT_AUTOMATION_GAPS,
    ANALYSIS_REPORT_BOTTOM_HISTORY_LABEL_SUFFIX,
    ANALYSIS_REPORT_HEADER_FIELDS,
    ANALYSIS_REPORT_LOAD_STATES,
    ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE,
    ANALYSIS_REPORT_SECTION_HELP_IMG_SRC_FRAGMENT,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
    ANALYSIS_REPORT_TOP_HELP_DIALOG_TITLE,
    CUSTOMER_ID_ATTR,
    REPORT_LOAD_STATE_ATTR,
    analysisReportDetailUrlPattern,
    parseAnalysisIdFromReportUrl,
} from '../analysisReportTestIds';
import { AnalysisReportViewFlowError } from './analysisReportViewErrors';
import { expectAnalysisReportDisplaySettingsModalDialog } from '../displaySettings/analysisReportDisplaySettingsModal';

/** Matches Playwright `navigationTimeout` on combined smoke config and report-detail `page.goto`. */
export const ANALYSIS_REPORT_NAVIGATION_TIMEOUT_MS = 30000;
const NAVIGATION_TIMEOUT_MS = ANALYSIS_REPORT_NAVIGATION_TIMEOUT_MS;
const ACTION_TIMEOUT_MS = 15000;
const PHOTO_READY_TIMEOUT_MS = 20000;
const REPORT_LOAD_STATE_POLL_INTERVALS_MS = [50, 100, 200, 500] as const;

export function shouldAwaitVerifiedFetchAnalysisReport(appOrigin: string): boolean {
    return /^https:\/\/app-stg\./i.test(appOrigin);
}

export function isFetchAnalysisReportResponse(
    response: Response,
    customerId: string,
    analysisId: string
): boolean {
    if (response.request().method() !== 'GET') {
        return false;
    }
    let url: URL;
    try {
        url = new URL(response.url());
    } catch {
        return false;
    }
    if (!url.pathname.endsWith(VERIFIED_FETCH_ANALYSIS_REPORT_PATH)) {
        return false;
    }
    return url.searchParams.get('customerId') === customerId && url.searchParams.get('analysisId') === analysisId;
}

async function assertAnalysisReportLoadStateReady(report: Locator, phase: string): Promise<void> {
    const initial = await report.getAttribute(REPORT_LOAD_STATE_ATTR);
    if (initial === ANALYSIS_REPORT_LOAD_STATES.error) {
        throw new AnalysisReportViewFlowError(
            'analysis-report data-load-state="error" — report request failed or returned no report.'
        );
    }

    let lastState: string | null = initial;
    try {
        await expect
            .poll(
                async () => {
                    lastState = await report.getAttribute(REPORT_LOAD_STATE_ATTR);
                    if (lastState === ANALYSIS_REPORT_LOAD_STATES.error) {
                        throw new AnalysisReportViewFlowError(
                            'analysis-report data-load-state="error" — report request failed or returned no report.'
                        );
                    }
                    return lastState;
                },
                {
                    timeout: NAVIGATION_TIMEOUT_MS,
                    intervals: [...REPORT_LOAD_STATE_POLL_INTERVALS_MS],
                    message: `analysis-report data-load-state ready (phase=${phase})`,
                }
            )
            .toBe(ANALYSIS_REPORT_LOAD_STATES.ready);
    } catch (error) {
        if (lastState === ANALYSIS_REPORT_LOAD_STATES.loading) {
            throw new AnalysisReportViewFlowError(
                `analysis-report data-load-state remained loading through bounded wait (phase=${phase}).`
            );
        }
        throw error;
    }
}

export function analysisReportRoot(page: Page): Locator {
    return page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.report);
}

/** Trace 20261104-131549: header is a sibling of analysis-report, not nested inside it. */
export function analysisReportVisibleHeader(page: Page): Locator {
    return page
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.header)
        .locator('visible=true');
}

function assertParseableIsoTimestamp(value: string, context: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new AnalysisReportViewFlowError(`${context}: measuredAt data-value is empty.`);
    }
    if (Number.isNaN(Date.parse(trimmed))) {
        throw new AnalysisReportViewFlowError(
            `${context}: measuredAt data-value is not a parseable date (value=${trimmed}).`
        );
    }
}

export type GotoAnalysisReportDetailOptions = {
    /** Staging: wait for GET fetch_analysis_report for the pinned ids before DOM readiness (bounded). */
    awaitVerifiedReportFetch?: boolean;
};

export async function gotoAnalysisReportDetail(
    page: Page,
    appOrigin: string,
    customerId: string,
    analysisId: string,
    options?: GotoAnalysisReportDetailOptions
): Promise<void> {
    const url = `${appOrigin}/customers/${customerId}/reports/${analysisId}`;
    const awaitFetch =
        options?.awaitVerifiedReportFetch ??
        shouldAwaitVerifiedFetchAnalysisReport(appOrigin);
    // Register the response waiter before navigation can issue fetch_analysis_report.
    const fetchPromise: Promise<Response> | null = awaitFetch
        ? page.waitForResponse(
              (response) => isFetchAnalysisReportResponse(response, customerId, analysisId),
              { timeout: NAVIGATION_TIMEOUT_MS }
          )
        : null;

    const drainFetchWaiter = async (): Promise<void> => {
        if (!fetchPromise) {
            return;
        }
        await fetchPromise.catch(() => undefined);
    };

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    } catch (navigationError) {
        await drainFetchWaiter();
        throw navigationError;
    }

    if (!fetchPromise) {
        return;
    }

    let response: Response;
    try {
        response = await fetchPromise;
    } catch (fetchWaitError) {
        const detail =
            fetchWaitError instanceof Error ? fetchWaitError.message : String(fetchWaitError);
        throw new AnalysisReportViewFlowError(
            `fetch_analysis_report did not complete within ${NAVIGATION_TIMEOUT_MS}ms for ${customerId}/${analysisId} (${detail}).`
        );
    }

    const status = response.status();
    if (status < 200 || status >= 300) {
        throw new AnalysisReportViewFlowError(
            `fetch_analysis_report HTTP ${status} for ${customerId}/${analysisId}.`
        );
    }
}

/**
 * After Report View ends on the customer page, downstream features must reopen the pinned report route
 * before touching actions menus (combined smoke pin).
 */
export async function navigateToPinnedAnalysisReport(
    page: Page,
    appOrigin: string,
    customerId: string,
    analysisId: string
): Promise<Locator> {
    await gotoAnalysisReportDetail(page, appOrigin, customerId, analysisId, {
        awaitVerifiedReportFetch: shouldAwaitVerifiedFetchAnalysisReport(appOrigin),
    });
    await assertAnalysisReportRouteIdentity(page, appOrigin, customerId, analysisId);
    return assertAnalysisReportReady(page, customerId, analysisId);
}

function reportDetailPathname(page: Page): string {
    return new URL(page.url()).pathname.replace(/\/$/, '') || '/';
}

/** Fail immediately when the current URL cannot be the pinned report detail route. */
export function assertPinnedReportRouteNow(page: Page, customerId: string, analysisId: string): void {
    const pathname = reportDetailPathname(page);
    const expectedPath = `/customers/${customerId}/reports/${analysisId}`;
    if (pathname === expectedPath) {
        return;
    }
    const routeCustomer = parseCustomerIdFromUrl(page.url());
    const routeAnalysis = parseAnalysisIdFromReportUrl(page.url());
    if (routeAnalysis) {
        throw new AnalysisReportViewFlowError(
            `Report route identity mismatch (customer=${routeCustomer}, analysis=${routeAnalysis}).`
        );
    }
    throw new AnalysisReportViewFlowError(
        `Report route identity mismatch: expected ${expectedPath}, got ${pathname}.`
    );
}

export async function assertAnalysisReportRouteIdentity(
    page: Page,
    appOrigin: string,
    customerId: string,
    analysisId: string
): Promise<void> {
    const pathname = reportDetailPathname(page);
    const onDetailRoute = /\/customers\/[0-9a-f-]{36}\/reports\/[0-9a-f-]{36}/i.test(pathname);
    const onNonReportRoute =
        /\/posture-analysis-report(?:\/|$)/i.test(pathname) || /^\/customers\/[0-9a-f-]{36}$/i.test(pathname);
    if (onDetailRoute || onNonReportRoute) {
        assertPinnedReportRouteNow(page, customerId, analysisId);
    } else {
        await expect(page).toHaveURL(analysisReportDetailUrlPattern(customerId, analysisId), {
            timeout: NAVIGATION_TIMEOUT_MS,
        });
        assertPinnedReportRouteNow(page, customerId, analysisId);
    }
    if (new URL(page.url()).origin !== appOrigin) {
        throw new AnalysisReportViewFlowError(
            `Report origin ${new URL(page.url()).origin} != expected ${appOrigin}.`
        );
    }
}

export async function assertAnalysisReportReady(
    page: Page,
    customerId: string,
    analysisId: string
): Promise<Locator> {
    assertPinnedReportRouteNow(page, customerId, analysisId);

    const report = analysisReportRoot(page);
    await expect(report, 'exactly one analysis-report').toHaveCount(1, {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect(report, 'analysis-report visible').toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });

    await assertAnalysisReportLoadStateReady(report, 'assertAnalysisReportReady');

    await expect(report).toHaveAttribute(CUSTOMER_ID_ATTR, customerId);
    await expect(report).toHaveAttribute(ANALYSIS_ID_ATTR, analysisId);

    const header = analysisReportVisibleHeader(page);
    await expect(
        header,
        `exactly one visible analysis-report-header (${ANALYSIS_REPORT_AUTOMATION_GAPS.reportHeaderPlacement})`
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    for (const field of Object.values(ANALYSIS_REPORT_HEADER_FIELDS)) {
        const fieldEl = header
            .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.headerField)
            .and(header.locator(`[data-field="${field}"]`));
        await expect(fieldEl, `header field ${field}`).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        if (field === ANALYSIS_REPORT_HEADER_FIELDS.measuredAt) {
            const measuredAtValue = await fieldEl.getAttribute('data-value');
            assertParseableIsoTimestamp(
                measuredAtValue ?? '',
                ANALYSIS_REPORT_AUTOMATION_GAPS.measuredAtHeaderField
            );
        } else if (
            field === ANALYSIS_REPORT_HEADER_FIELDS.height ||
            field === ANALYSIS_REPORT_HEADER_FIELDS.age ||
            field === ANALYSIS_REPORT_HEADER_FIELDS.sex
        ) {
            await expect(fieldEl).toHaveAttribute('data-value', /.+/);
        } else {
            await expect(fieldEl).not.toHaveText(/^$/);
        }
    }

    const summary = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.summary);
    await expect(summary).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(summary).not.toHaveText(/^$/);

    const score = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.score);
    await expect(score).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect
        .poll(async () => (await score.textContent())?.trim() ?? '', {
            timeout: NAVIGATION_TIMEOUT_MS,
            message: 'analysis-report-score populated',
        })
        .toMatch(/\d+/);

    return report;
}

/**
 * Top-of-report help buttons (staging: ant-modal; title exact per ANALYSIS_REPORT_TOP_HELP_DIALOG_TITLE).
 */
export async function exerciseHelpDialogCycle(
    page: Page,
    report: Locator,
    helpTestId: string,
    exactDialogTitle: string
): Promise<void> {
    const help = report.getByTestId(helpTestId);
    await expect(help).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await help.click({ timeout: ACTION_TIMEOUT_MS });
    const dialog = page.getByRole('dialog').filter({
        has: page.getByText(exactDialogTitle, { exact: true }),
    });
    await expect(dialog.locator('visible=true')).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}

async function sectionHelpTriggerIcon(section: Locator): Promise<Locator> {
    const icons = section.locator(`img[src*="${ANALYSIS_REPORT_SECTION_HELP_IMG_SRC_FRAGMENT}"]`).locator('visible=true');
    await expect(
        icons,
        'exactly one visible section help img under data-testid section'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    return icons;
}

/** Section-scoped staging help: img help_black under section; dialog title exact; Close within dialog. */
export async function exerciseSectionHelpDialogCycle(
    page: Page,
    section: Locator,
    exactDialogTitle: string
): Promise<void> {
    const icon = await sectionHelpTriggerIcon(section);
    await icon.click({ timeout: ACTION_TIMEOUT_MS });
    const dialog = page.getByRole('dialog').filter({
        has: page.getByText(exactDialogTitle, { exact: true }),
    });
    await expect(dialog.locator('visible=true')).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await dialog.getByRole('button', { name: 'Close', exact: true }).click({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}

export async function exerciseExercisesStretchesSectionHelpCycleIfVisible(
    page: Page,
    report: Locator
): Promise<boolean> {
    const section = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretches);
    const visible = (await section.count()) > 0 && (await section.isVisible().catch(() => false));
    if (!visible) {
        return false;
    }
    await exerciseSectionHelpDialogCycle(
        page,
        section,
        ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.exercisesStretches
    );
    return true;
}

export async function exerciseMuscleConditionHelpCycle(page: Page, report: Locator): Promise<void> {
    const section = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleCondition);
    await expect(section).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(section).toHaveAttribute(REPORT_LOAD_STATE_ATTR, ANALYSIS_REPORT_LOAD_STATES.ready);
    await exerciseSectionHelpDialogCycle(
        page,
        section,
        ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.muscleCondition
    );
}

export async function assertPosturePhotosAndMetrics(report: Locator): Promise<void> {
    const side = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.sideStanding);
    const front = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.frontStanding);
    await expect(side).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(front).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    await assertPhotoInSection(report, side, 'side');
    await assertPhotoInSection(report, front, 'front');

    await assertMetricsPresent(side, [
        'WholeBodyBFTilt',
        'UpperBodyBFTilt',
        'LowerBodyBFTilt',
        'HeadBFTilt',
        'HeadGap',
        'DegreeOfHunchBack',
        'PelvicTilt',
        'WaistOffset',
        'KneeBendDegree',
    ]);
    await assertMetricsPresent(front, [
        'WholeBodyLRTilt',
        'UpperBodyLRTilt',
        'LowerBodyLRTilt',
        'HeadLRTilt',
        'NeckLRPositionalGap',
        'ShoulderLRTilt',
        'ChestLRPositionalGap',
        'WaistLRTilt',
        'WaistLRPositionalGap',
    ]);
}

async function assertPhotoInSection(
    report: Locator,
    section: Locator,
    view: 'side' | 'front'
): Promise<void> {
    const photo = section.locator(
        `[data-testid="${ANALYSIS_REPORT_SINGLE_TEST_IDS.photo}"][data-view="${view}"]`
    );
    await expect(photo).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const state = await photo.getAttribute('data-image-state');
    if (state === 'error') {
        throw new AnalysisReportViewFlowError(`analysis-report-photo data-view=${view} data-image-state=error.`);
    }
    if (state === 'unavailable') {
        return;
    }
    if (state === 'loading') {
        await expect
            .poll(async () => photo.getAttribute('data-image-state'), {
                timeout: PHOTO_READY_TIMEOUT_MS,
                message: `photo ${view} loading → ready`,
            })
            .toMatch(/ready|unavailable/);
        const after = await photo.getAttribute('data-image-state');
        if (after === 'error') {
            throw new AnalysisReportViewFlowError(`analysis-report-photo ${view} failed while loading.`);
        }
        if (after === 'ready') {
            await expect(photo).toHaveAttribute('data-image-state', 'ready');
        }
        return;
    }
    if (state === 'ready') {
        await expect(photo).toHaveAttribute('data-image-state', 'ready');
    }
}

async function assertMetricsPresent(section: Locator, metricKeys: string[]): Promise<void> {
    for (const key of metricKeys) {
        const row = section.locator(
            `[data-testid="${ANALYSIS_REPORT_SINGLE_TEST_IDS.metric}"][data-metric-key="${key}"]`
        );
        await expect(row, `metric ${key}`).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await expect(row).toHaveAttribute('data-value', /.+/);
        const unit = await row.getAttribute('data-unit');
        if (key !== 'DegreeOfHunchBack' && unit !== null) {
            expect(unit?.length).toBeGreaterThan(0);
        }
        await expect(row.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.metricChart)).toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
    }
}

export async function assertPostureTypeLegsBalance(page: Page, report: Locator): Promise<void> {
    const postureSection = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.postureType);
    await expect(postureSection).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const poseValue = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.postureTypeValue);
    await expect(poseValue).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(poseValue).toHaveAttribute('data-pose-type', /.+/);
    await exerciseSectionHelpDialogCycle(page, postureSection, ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.postureType);

    const legSection = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.legAlignment);
    await expect(legSection).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.legImage)).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.balanceChart)).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const balanceValue = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.balanceValue);
    await expect(balanceValue).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(balanceValue).toHaveAttribute('data-balance', /.+/);
    await expect(balanceValue).toHaveAttribute('data-balance-depth', /.+/);
    await exerciseSectionHelpDialogCycle(page, legSection, ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.legAlignment);
}

export type MuscleSwitchSnapshot = { id: string; checked: boolean }[];

export async function snapshotMuscleSwitchStates(report: Locator): Promise<MuscleSwitchSnapshot> {
    const items = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleItem);
    const count = await items.count();
    const snapshot: MuscleSwitchSnapshot = [];
    for (let i = 0; i < count; i += 1) {
        const item = items.nth(i);
        const id = (await item.getAttribute('data-muscle-id')) ?? `index-${i}`;
        const checked = (await item.getAttribute('aria-checked')) === 'true';
        snapshot.push({ id, checked });
    }
    return snapshot;
}

export async function restoreMuscleSwitchStates(
    report: Locator,
    snapshot: MuscleSwitchSnapshot
): Promise<void> {
    for (const entry of snapshot) {
        const item = report
            .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleItem)
            .and(report.locator(`[data-muscle-id="${entry.id}"]`));
        if ((await item.count()) === 0) {
            continue;
        }
        const current = (await item.getAttribute('aria-checked')) === 'true';
        if (current !== entry.checked) {
            await item.click({ timeout: ACTION_TIMEOUT_MS });
            await expect(item).toHaveAttribute('aria-checked', entry.checked ? 'true' : 'false');
        }
    }
}

export async function exerciseMuscleConditionControls(report: Locator): Promise<void> {
    const section = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleCondition);
    await expect(section).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(section).toHaveAttribute(REPORT_LOAD_STATE_ATTR, ANALYSIS_REPORT_LOAD_STATES.ready);

    const showAll = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.musclesShowAll);
    const hideAll = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.musclesHideAll);
    const emptyGroups = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleGroupEmpty);
    const emptyCount = await emptyGroups.count();
    if (emptyCount >= 2) {
        await expect(showAll).toBeDisabled();
        await expect(hideAll).toBeDisabled();
        return;
    }

    const snapshot = await snapshotMuscleSwitchStates(report);
    if (await showAll.isEnabled().catch(() => false)) {
        await showAll.click({ timeout: ACTION_TIMEOUT_MS });
    }
    if (await hideAll.isEnabled().catch(() => false)) {
        await hideAll.click({ timeout: ACTION_TIMEOUT_MS });
    }
    for (const group of ['shortening', 'stretching'] as const) {
        const groupEl = report
            .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleGroup)
            .and(report.locator(`[data-muscle-group="${group}"]`));
        if ((await groupEl.count()) === 0) {
            continue;
        }
        const groupShow = groupEl.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleGroupShow);
        const groupHide = groupEl.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.muscleGroupHide);
        if (await groupShow.isEnabled().catch(() => false)) {
            await groupShow.click({ timeout: ACTION_TIMEOUT_MS });
        }
        if (await groupHide.isEnabled().catch(() => false)) {
            await groupHide.click({ timeout: ACTION_TIMEOUT_MS });
        }
    }
    await restoreMuscleSwitchStates(report, snapshot);
}

export type ExercisesStretchesStepOutcome =
    | { status: 'verified' }
    | { status: 'skipped'; reason: string };

async function readExercisesStretchesDisplayToggleWithoutSaving(page: Page): Promise<'true' | 'false'> {
    const toggle = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsToggle);
    await expect(toggle, 'analysis-report-actions-toggle').toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await toggle.click({ timeout: ACTION_TIMEOUT_MS });

    const menu = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.actionsMenu);
    await expect(menu, 'analysis-report-actions-menu').toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const openSettings = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsOpen);
    await expect(openSettings, 'analysis-report-display-settings-open').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await openSettings.click({ timeout: ACTION_TIMEOUT_MS });

    const dialog = await expectAnalysisReportDisplaySettingsModalDialog(page);

    const exercisesToggle = dialog.getByTestId(
        ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretchesToggle
    );
    await expect(
        exercisesToggle,
        'analysis-report-exercises-stretches-toggle in display settings dialog'
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const ariaChecked = await exercisesToggle.getAttribute('aria-checked');
    if (ariaChecked !== 'true' && ariaChecked !== 'false') {
        throw new AnalysisReportViewFlowError(
            `Could not read analysis-report-exercises-stretches-toggle aria-checked (got ${ariaChecked ?? 'null'}).`
        );
    }

    const cancel = dialog.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.displaySettingsCancel);
    await expect(cancel, 'analysis-report-display-settings-cancel').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await cancel.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog, 'display settings dialog closed after cancel').toBeHidden({
        timeout: ACTION_TIMEOUT_MS,
    });

    return ariaChecked;
}

async function verifyVisibleExercisesStretchesSection(report: Locator): Promise<void> {
    const section = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretches);
    const exercises = section.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercises);
    const stretches = section.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.stretches);
    if ((await exercises.count()) > 0) {
        const expand = section.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesExpand);
        if (await expand.isVisible().catch(() => false)) {
            await expand.click({ timeout: ACTION_TIMEOUT_MS });
            await expect(expand).toHaveAttribute('aria-expanded', 'true');
            await expand.click({ timeout: ACTION_TIMEOUT_MS });
            await expect(expand).toHaveAttribute('aria-expanded', 'false');
        }
        const rec = exercises.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.recommendation).first();
        await expect(rec).toHaveAttribute('data-recommendation-type', 'exercise');
        await expect(rec).toHaveAttribute('data-recommendation-id', /.+/);
    }
    if ((await stretches.count()) > 0) {
        const expand = section.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.stretchesExpand);
        if (await expand.isVisible().catch(() => false)) {
            await expand.click({ timeout: ACTION_TIMEOUT_MS });
            await expect(expand).toHaveAttribute('aria-expanded', 'true');
            await expand.click({ timeout: ACTION_TIMEOUT_MS });
            await expect(expand).toHaveAttribute('aria-expanded', 'false');
        }
        const rec = stretches.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.recommendation).first();
        await expect(rec).toHaveAttribute('data-recommendation-type', 'stretch');
        await expect(rec).toHaveAttribute('data-recommendation-id', /.+/);
    }
}

export async function resolveExercisesStretchesStep(
    page: Page,
    report: Locator
): Promise<ExercisesStretchesStepOutcome> {
    const section = report.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.exercisesStretches);
    const sectionVisible =
        (await section.count()) > 0 && (await section.isVisible().catch(() => false));
    if (sectionVisible) {
        await verifyVisibleExercisesStretchesSection(report);
        return { status: 'verified' };
    }

    const poseType = (
        await report
            .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.postureTypeValue)
            .getAttribute('data-pose-type')
    )?.trim();
    if (poseType?.toLowerCase() === 'normal') {
        return {
            status: 'skipped',
            reason:
                'Normal posture (data-pose-type=normal); analysis-report-exercises-stretches legitimately absent per contract §8.',
        };
    }

    const lang = (await page.locator('html').getAttribute('lang'))?.trim().toLowerCase() ?? '';
    if (lang.startsWith('en')) {
        return {
            status: 'skipped',
            reason: `English UI (html lang=${lang}); analysis-report-exercises-stretches legitimately absent per contract §8.`,
        };
    }

    const toggleChecked = await readExercisesStretchesDisplayToggleWithoutSaving(page);
    if (toggleChecked === 'false') {
        return {
            status: 'skipped',
            reason:
                'Display setting confirmed off (analysis-report-exercises-stretches-toggle aria-checked=false).',
        };
    }

    throw new AnalysisReportViewFlowError(
        'Expected analysis-report-exercises-stretches section while display setting is on (analysis-report-exercises-stretches-toggle aria-checked=true).'
    );
}

/**
 * Trace 20261106-081420: clickable DIV under analysis-report, full label "{header name} 姿勢分析レポート一覧".
 */
export async function customerNameFromAnalysisReportHeader(page: Page): Promise<string> {
    const header = analysisReportVisibleHeader(page);
    const nameField = header
        .getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.headerField)
        .and(header.locator(`[data-field="${ANALYSIS_REPORT_HEADER_FIELDS.name}"]`));
    const text = (await nameField.textContent())?.trim() ?? '';
    if (!text) {
        throw new AnalysisReportViewFlowError(
            'analysis-report-header-field[name] has no text; cannot build bottom history control label.'
        );
    }
    return text;
}

export async function singleReportBottomHistoryControl(page: Page, report: Locator): Promise<Locator> {
    const customerName = await customerNameFromAnalysisReportHeader(page);
    const fullLabel = `${customerName} ${ANALYSIS_REPORT_BOTTOM_HISTORY_LABEL_SUFFIX}`;
    const control = report.getByText(fullLabel, { exact: true }).locator('visible=true');
    await expect(
        control,
        ANALYSIS_REPORT_AUTOMATION_GAPS.singleReportBottomHistoryLink
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    return control;
}
