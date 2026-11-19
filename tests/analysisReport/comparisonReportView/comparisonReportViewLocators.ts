import { expect, type Locator, type Page } from '@playwright/test';
import {
    ANALYSIS_ID_ATTR,
    ANALYSIS_REPORT_COMPARISON_ATTRS,
    ANALYSIS_REPORT_COMPARISON_SECTION_LABELS,
    ANALYSIS_REPORT_COMPARISON_TEST_IDS,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
    type AnalysisReportComparisonSectionLabelKey,
    CUSTOMER_ID_ATTR,
} from '../analysisReportTestIds';
import { ComparisonReportViewFlowError } from './comparisonReportViewErrors';

const ACTION_TIMEOUT_MS = 15000;
const READINESS_TIMEOUT_MS = 30000;

const COMPARISON_COLUMN_SECTION_KEYS = Object.keys(
    ANALYSIS_REPORT_COMPARISON_SECTION_LABELS
) as AnalysisReportComparisonSectionLabelKey[];

function comparisonColumnSectionHeading(
    column: Locator,
    sectionKey: AnalysisReportComparisonSectionLabelKey
): Locator {
    return column.getByText(ANALYSIS_REPORT_COMPARISON_SECTION_LABELS[sectionKey], { exact: true });
}

export function comparisonReportRoot(page: Page): Locator {
    return page.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.root);
}

export function comparisonReportSelectorSearchInput(page: Page): Locator {
    return comparisonReportRoot(page).getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.selectorInput);
}

function comparisonReportSelectorAntSelect(page: Page): Locator {
    return comparisonReportRoot(page).locator(
        `.ant-select:has([data-testid="${ANALYSIS_REPORT_COMPARISON_TEST_IDS.selectorInput}"])`
    );
}

function comparisonReportSelectorSurface(page: Page): Locator {
    return comparisonReportSelectorAntSelect(page).locator('.ant-select-selector');
}

function visibleComparisonOptionsPopup(page: Page): Locator {
    return page
        .locator(`.${ANALYSIS_REPORT_COMPARISON_TEST_IDS.optionsPopup}`)
        .locator('visible=true');
}

async function prepareComparisonReportSelectorForOpen(page: Page): Promise<{
    searchInput: Locator;
    selectorSurface: Locator;
}> {
    const searchInput = comparisonReportSelectorSearchInput(page);
    await expect(searchInput, 'comparison selector search input visible').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });

    const selectorSurface = comparisonReportSelectorSurface(page);
    await expect(selectorSurface, 'comparison ant-select selector surface visible').toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(selectorSurface).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });

    await selectorSurface.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
    await selectorSurface.evaluate((el) => {
        const header = document.querySelector('header.ant-layout-header');
        const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
        const margin = 12;
        const rect = el.getBoundingClientRect();
        const targetTop = headerBottom + margin;
        if (rect.top < targetTop) {
            window.scrollBy(0, rect.top - targetTop);
        }
    });

    await expect(selectorSurface).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const box = await selectorSurface.boundingBox();
    if (!box) {
        throw new ComparisonReportViewFlowError('Comparison selector surface has no layout box.');
    }
    const headerBottom = await page.evaluate(() => {
        const header = document.querySelector('header.ant-layout-header');
        return header ? header.getBoundingClientRect().bottom : 0;
    });
    if (box.y < headerBottom) {
        throw new ComparisonReportViewFlowError(
            'Comparison selector remains under the fixed header after repositioning.'
        );
    }

    return { searchInput, selectorSurface };
}

export function comparisonColumn(
    page: Page,
    slot: typeof ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft | typeof ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotRight
): Locator {
    return comparisonReportRoot(page)
        .getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.column)
        .and(page.locator(`[${ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlot}="${slot}"]`));
}

async function requireComparisonColumn(
    page: Page,
    slot: typeof ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft | typeof ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotRight
): Promise<Locator> {
    const column = comparisonColumn(page, slot);
    await expect(column, `one comparison column for slot ${slot}`).toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(column, `comparison column ${slot} visible`).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    return column;
}

export async function readSingleReportAnalysisId(page: Page): Promise<string> {
    const report = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.report).first();
    await expect(report).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const analysisId = (await report.getAttribute(ANALYSIS_ID_ATTR))?.trim();
    if (!analysisId) {
        throw new ComparisonReportViewFlowError(
            'Single analysis-report missing data-analysis-id before opening comparison.'
        );
    }
    return analysisId;
}

export async function clickComparisonOpenFromSingleReport(page: Page): Promise<void> {
    const btn = page.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.compareOpen);
    await expect(btn).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await btn.click({ timeout: ACTION_TIMEOUT_MS });
}

export async function assertComparisonReportViewReady(
    page: Page,
    customerId: string
): Promise<Locator> {
    const root = comparisonReportRoot(page);
    await expect(root, 'analysis-report-comparison visible').toBeVisible({
        timeout: READINESS_TIMEOUT_MS,
    });
    await expect(root).toHaveAttribute(CUSTOMER_ID_ATTR, customerId, { timeout: ACTION_TIMEOUT_MS });

    const loading = root
        .getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.loading)
        .locator('visible=true');
    await expect(loading, 'comparison loading hooks finished').toHaveCount(0, {
        timeout: READINESS_TIMEOUT_MS,
    });

    for (const slot of [
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft,
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotRight,
    ] as const) {
        const column = await requireComparisonColumn(page, slot);
        await expect(column).toHaveAttribute(ANALYSIS_ID_ATTR, /.+/);
    }

    const selector = comparisonReportSelectorSearchInput(page);
    await expect(selector).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(selector).toHaveAttribute(
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlot,
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft
    );
    await expect(comparisonReportSelectorSurface(page)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    return root;
}

export type ComparisonSlotAnalysisIds = {
    leftAnalysisId: string;
    rightAnalysisId: string;
};

export async function readComparisonSlotAnalysisIds(page: Page): Promise<ComparisonSlotAnalysisIds> {
    const leftColumn = await requireComparisonColumn(page, ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft);
    const rightColumn = await requireComparisonColumn(page, ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotRight);
    const left = (await leftColumn.getAttribute(ANALYSIS_ID_ATTR))?.trim();
    const right = (await rightColumn.getAttribute(ANALYSIS_ID_ATTR))?.trim();
    if (!left || !right) {
        throw new ComparisonReportViewFlowError(
            'Comparison column missing data-analysis-id on left or right slot.'
        );
    }
    return { leftAnalysisId: left, rightAnalysisId: right };
}

async function assertLocatorIntersectsViewport(locator: Locator, label: string): Promise<void> {
    await locator.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
    const intersects = await locator.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const vw = window.innerWidth || document.documentElement.clientWidth;
        return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
    });
    if (!intersects) {
        throw new ComparisonReportViewFlowError(`${label} did not intersect the viewport after scroll.`);
    }
}

export async function scrollComparisonViewAndAssertSectionsVisible(page: Page): Promise<Record<string, boolean>> {
    const outcomes: Record<string, boolean> = {};

    await page.evaluate(() => window.scrollTo(0, 0));

    const slots = [
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft,
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotRight,
    ] as const;

    for (const slot of slots) {
        const column = comparisonColumn(page, slot);
        const columnKey = `${slot}:${ANALYSIS_REPORT_COMPARISON_TEST_IDS.column}`;
        await assertLocatorIntersectsViewport(column, columnKey);
        outcomes[columnKey] = true;

        for (const sectionKey of COMPARISON_COLUMN_SECTION_KEYS) {
            const section = comparisonColumnSectionHeading(column, sectionKey);
            const outcomeKey = `${slot}:${sectionKey}`;
            if ((await section.count()) === 0) {
                throw new ComparisonReportViewFlowError(
                    `Comparison column ${slot} missing section ${sectionKey} (${ANALYSIS_REPORT_COMPARISON_SECTION_LABELS[sectionKey]}).`
                );
            }
            await assertLocatorIntersectsViewport(section.first(), outcomeKey);
            outcomes[outcomeKey] = true;
        }
    }

    return outcomes;
}

export async function openComparisonReportSelectorDropdown(page: Page): Promise<Locator> {
    const { searchInput, selectorSurface } = await prepareComparisonReportSelectorForOpen(page);
    await selectorSurface.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(searchInput).toHaveAttribute('aria-expanded', 'true', { timeout: ACTION_TIMEOUT_MS });
    const popup = visibleComparisonOptionsPopup(page);
    await expect(popup, 'comparison options popup visible').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    return popup;
}

export type ComparisonReportOptionMeta = {
    analysisId: string;
    index: number;
};

export async function listEnabledComparisonOptions(
    popup: Locator
): Promise<ComparisonReportOptionMeta[]> {
    const options = popup.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.option);
    const count = await options.count();
    const list: ComparisonReportOptionMeta[] = [];
    for (let index = 0; index < count; index += 1) {
        const option = options.nth(index);
        if (!(await option.isVisible().catch(() => false))) {
            continue;
        }
        if ((await option.getAttribute('aria-disabled')) === 'true') {
            continue;
        }
        const className = (await option.getAttribute('class')) ?? '';
        if (className.includes('option-disabled')) {
            continue;
        }
        const analysisId = (await option.getAttribute(ANALYSIS_ID_ATTR))?.trim();
        if (!analysisId) {
            continue;
        }
        list.push({ analysisId, index });
    }
    return list;
}

/**
 * Pick the first enabled option whose analysis id differs from both comparison slots (deterministic sort by id).
 * Returns the chosen analysis id from the dropdown metadata (not from post-click DOM reads).
 */
export async function selectDifferentComparisonReportOption(
    page: Page,
    current: ComparisonSlotAnalysisIds
): Promise<string> {
    const popup = await openComparisonReportSelectorDropdown(page);
    const options = await listEnabledComparisonOptions(popup);
    const blocked = new Set([current.leftAnalysisId, current.rightAnalysisId]);
    const candidates = options
        .filter((o) => !blocked.has(o.analysisId))
        .sort((a, b) => a.analysisId.localeCompare(b.analysisId));
    if (candidates.length === 0) {
        throw new ComparisonReportViewFlowError(
            'Prerequisite failed: no second enabled report in comparison dropdown (need at least two distinct reports for this customer).'
        );
    }
    const chosen = candidates[0]!;
    const option = popup.getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.option).nth(chosen.index);
    await option.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
    await option.click({ timeout: ACTION_TIMEOUT_MS });
    return chosen.analysisId;
}

export async function assertComparisonLeftReportSwitchApplied(
    page: Page,
    customerId: string,
    expectedLeftAnalysisId: string,
    expectedUnchangedRightAnalysisId: string
): Promise<void> {
    const root = comparisonReportRoot(page);
    const loading = root
        .getByTestId(ANALYSIS_REPORT_COMPARISON_TEST_IDS.loading)
        .locator('visible=true');
    await expect(loading, 'comparison loading hooks finished after switch').toHaveCount(0, {
        timeout: READINESS_TIMEOUT_MS,
    });

    const leftColumn = await requireComparisonColumn(
        page,
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotLeft
    );
    await expect(leftColumn, 'left column analysis id after switch').toHaveAttribute(
        ANALYSIS_ID_ATTR,
        expectedLeftAnalysisId,
        { timeout: READINESS_TIMEOUT_MS }
    );

    const rightColumn = await requireComparisonColumn(
        page,
        ANALYSIS_REPORT_COMPARISON_ATTRS.comparisonSlotRight
    );
    await expect(rightColumn, 'right comparison column unchanged').toHaveAttribute(
        ANALYSIS_ID_ATTR,
        expectedUnchangedRightAnalysisId,
        { timeout: ACTION_TIMEOUT_MS }
    );

    await expect(root).toHaveAttribute(CUSTOMER_ID_ATTR, customerId);
    await expect(
        comparisonColumnSectionHeading(
            leftColumn,
            'standingSagittalPlane'
        ),
        'left column sagittal section visible after switch'
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}