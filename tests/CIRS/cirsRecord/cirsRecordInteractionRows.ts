import { expect, type Locator, type Page } from '@playwright/test';
import { CIRS_TEST_IDS, CUSTOMER_SERVICE_ID_ATTR } from './cirsRecordTestIds';

/** Visible date text inside a 応対記録 row (not unique — pair with data-customer-service-id). */
export const INTERACTION_RECORD_ROW_DATE_PATTERN = /\d{4}\/\d{1,2}\/\d{1,2}/;

/** Legacy accessible-name evidence for regressions referencing icon alt. */
export const INTERACTION_RECORD_LIST_ICON_ALT = 'list response report';

export function interactionRecordRowsInScope(rowScope: Locator): Locator {
    return rowScope.getByTestId(CIRS_TEST_IDS.recordRow).locator('visible=true');
}

export function interactionRecordRowByServiceId(rowScope: Locator, customerServiceId: string): Locator {
    return rowScope.locator(
        `[data-testid="${CIRS_TEST_IDS.recordRow}"][${CUSTOMER_SERVICE_ID_ATTR}="${customerServiceId}"]`
    );
}

export async function expectInteractionRecordRowCount(
    rowScope: Locator,
    expected: number,
    contextLabel: string
): Promise<void> {
    await expect
        .poll(async () => interactionRecordRowsInScope(rowScope).count(), {
            timeout: 15000,
            message: `${contextLabel}: waiting for ${expected} visible record row(s)`,
        })
        .toBe(expected);
}

export async function countInteractionRecordRows(rowScope: Locator): Promise<number> {
    return interactionRecordRowsInScope(rowScope).count();
}

/** @deprecated Use {@link interactionRecordRowsInScope}. */
export function interactionRecordRowLocators(rowScope: Locator): Locator {
    return interactionRecordRowsInScope(rowScope);
}

/** @deprecated Use {@link interactionRecordRowsInScope}. */
export function interactionRecordRowsInCustomerSection(section: Locator): Locator {
    return interactionRecordRowsInScope(section);
}

export async function clickInteractionRecordRowAtIndex(rowScope: Locator, index: number): Promise<void> {
    const row = interactionRecordRowsInScope(rowScope).nth(index);
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click({ timeout: 15000 });
}

export async function clickInteractionRecordRowByServiceId(
    rowScope: Locator,
    customerServiceId: string
): Promise<void> {
    const row = interactionRecordRowByServiceId(rowScope, customerServiceId);
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click({ timeout: 15000 });
}

export async function expectFirstRecordRowServiceId(
    rowScope: Locator,
    customerServiceId: string,
    contextLabel: string
): Promise<void> {
    const first = interactionRecordRowsInScope(rowScope).first();
    await expect(first, `${contextLabel}: first row should exist`).toBeVisible({ timeout: 15000 });
    await expect
        .poll(async () => first.getAttribute(CUSTOMER_SERVICE_ID_ATTR), {
            timeout: 15000,
            message: `${contextLabel}: waiting for first row data-customer-service-id`,
        })
        .toBe(customerServiceId);
}

/** @deprecated Fixture/regression only — targets nested arrow wrapper, not the row root. */
export function interactionRecordArrowWrapperMislocator(scope: Locator): Locator {
    return scope
        .locator('div:has(img):not(:has(div:has(img)))')
        .filter({ hasText: INTERACTION_RECORD_ROW_DATE_PATTERN });
}

export function interactionRecordRowScopeOnFullListPage(page: Page): Locator {
    return page.getByTestId(CIRS_TEST_IDS.recordList);
}

export const FULL_LIST_ROW_DOM_EVIDENCE = {
    customerPageListButton: 'data-testid cirs-record-list-open in cirs-record-section',
    populatedFullListDom: 'data-testid cirs-record-list with cirs-record-row children',
    fixtureListPanelId: 'legacy #record-list-panel replaced by cirs-record-list test id',
} as const;
