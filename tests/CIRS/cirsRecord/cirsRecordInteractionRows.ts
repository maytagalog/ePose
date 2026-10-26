import { expect, type Locator, type Page } from '@playwright/test';

/** Visible date text inside a 応対記録 row (not unique — pair with API index + route UUID). */
export const INTERACTION_RECORD_ROW_DATE_PATTERN = /\d{4}\/\d{1,2}\/\d{1,2}/;

/** Screenshot/trace: 一覧 button icon alt inside .record-btn-wrapper (accessible name includes this + 一覧). */
export const INTERACTION_RECORD_LIST_ICON_ALT = 'list response report';

/**
 * Row roots inside a section or list scope (Playwright-native clicks — no evaluate clicks).
 * Fixture: `.interaction-record-row` under `.interaction-record-rows-host`.
 * Staging: same structural row (date + author columns + arrow img); exact production row class unverified — host/id selectors are fixture-oriented fallbacks.
 */
export function interactionRecordRowLocators(rowScope: Locator): Locator {
    return rowScope
        .locator(
            'div.interaction-record-row, .interaction-record-rows-host > div, #interaction-record-rows > div, #list-record-rows > div'
        )
        .filter({ hasText: INTERACTION_RECORD_ROW_DATE_PATTERN })
        .locator('visible=true');
}

export async function expectInteractionRecordRowCount(
    rowScope: Locator,
    expected: number,
    contextLabel: string
): Promise<void> {
    await expect
        .poll(async () => interactionRecordRowLocators(rowScope).count(), {
            timeout: 15000,
            message: `${contextLabel}: waiting for ${expected} visible record row(s) after list API`,
        })
        .toBe(expected);
}

export async function countInteractionRecordRows(rowScope: Locator): Promise<number> {
    return interactionRecordRowLocators(rowScope).count();
}

/** Same row definition used for count, visibility, and Playwright clicks. */
export function interactionRecordRowsInCustomerSection(section: Locator): Locator {
    return interactionRecordRowLocators(section);
}

export async function clickInteractionRecordRowAtIndex(rowScope: Locator, index: number): Promise<void> {
    const row = interactionRecordRowLocators(rowScope).nth(index);
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click({ timeout: 15000 });
}

/** @deprecated Fixture/regression only — targets nested arrow wrapper, not the row root. */
export function interactionRecordArrowWrapperMislocator(scope: Locator): Locator {
    return scope
        .locator('div:has(img):not(:has(div:has(img)))')
        .filter({ hasText: INTERACTION_RECORD_ROW_DATE_PATTERN });
}

/**
 * Production full-list row scope is UNVERIFIED (screenshot shows customer-page 一覧 only).
 * Fixture: rows under #record-list-panel. Staging: best-effort main region containing 応対記録一覧 title.
 */
export function interactionRecordRowScopeOnFullListPage(page: Page): Locator {
    const main = page.getByRole('main');
    const fixturePanel = main.locator('#record-list-panel');
    const titleScoped = main
        .locator('div')
        .filter({ has: main.getByText(/応対記録一覧/, { exact: false }) })
        .filter({ hasText: INTERACTION_RECORD_ROW_DATE_PATTERN });
    return fixturePanel.or(titleScoped);
}

export const FULL_LIST_ROW_DOM_EVIDENCE = {
    customerPageListButton: 'confirmed (screenshot): img alt list response report + 一覧 in 応対記録 section',
    populatedFullListDom: 'unverified_no_trace_snapshot_or_frontend_source',
    fixtureListPanelId: 'fixture_only_not_a_production_selector',
} as const;
