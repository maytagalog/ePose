import { expect, type Locator } from '@playwright/test';
import { TakeoverFlowError } from './takeoverErrors';
import {
    CUSTOMER_SERVICE_ID_ATTR,
    HANDOVER_ID_ATTR,
    HANDOVER_TEST_IDS,
} from './takeoverTestIds';

export type HandoverIdentitySource = 'handover_preview_item';

export type HandoverCreateIdentity = {
    handoverId: string;
    source: HandoverIdentitySource;
};

export function handoverItem(container: Locator, handoverId: string): Locator {
    return container.locator(
        `[data-testid="${HANDOVER_TEST_IDS.item}"][${HANDOVER_ID_ATTR}="${handoverId}"]`
    );
}

/** @deprecated Use {@link handoverItem}. */
export const handoverPreviewItem = handoverItem;

export async function captureHandoverIdsInSection(section: Locator): Promise<string[]> {
    const items = section.locator(`[data-testid="${HANDOVER_TEST_IDS.item}"]`);
    const count = await items.count();
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
        const handoverId = (await items.nth(index).getAttribute(HANDOVER_ID_ATTR))?.trim() ?? '';
        if (handoverId.length > 0) {
            ids.push(handoverId);
        }
    }
    return ids;
}

/**
 * Handover rows (preview and full list) include date, body copy, and author.
 * Content is verified with an exact in-row text match — not whole-row text and
 * not row-level content test IDs (editor-only per contract).
 */
export async function assertHandoverRowDisplaysContent(
    container: Locator,
    handoverId: string,
    recordId: string,
    expectedContent: string,
    timeoutMs = 15000
): Promise<void> {
    const item = handoverItem(container, handoverId);
    await expect(item, `handover row for handoverId=${handoverId}`).toHaveCount(1, { timeout: timeoutMs });
    await expect(item).toBeVisible({ timeout: timeoutMs });
    await expect(item).toHaveAttribute(CUSTOMER_SERVICE_ID_ATTR, recordId, { timeout: timeoutMs });
    await expect(
        item.getByText(expectedContent, { exact: true }),
        `handover row content for handoverId=${handoverId}`
    ).toBeVisible({ timeout: timeoutMs });
}

/** @deprecated Use {@link assertHandoverRowDisplaysContent}. */
export const assertHandoverPreviewDisplaysContent = assertHandoverRowDisplaysContent;

export async function resolveNewHandoverIdFromSection(
    section: Locator,
    recordId: string,
    idsBeforeCreate: Set<string>,
    expectedContent: string
): Promise<HandoverCreateIdentity> {
    const idsAfter = await captureHandoverIdsInSection(section);
    const newIds: string[] = [];
    for (const handoverId of idsAfter) {
        if (idsBeforeCreate.has(handoverId)) {
            continue;
        }
        const item = handoverItem(section, handoverId);
        const serviceId = (await item.getAttribute(CUSTOMER_SERVICE_ID_ATTR))?.trim() ?? '';
        if (serviceId !== recordId) {
            throw new TakeoverFlowError(
                `New handover item ${CUSTOMER_SERVICE_ID_ATTR} mismatch (expected=${recordId}, received=${serviceId}).`
            );
        }
        newIds.push(handoverId);
    }
    if (newIds.length === 0) {
        throw new TakeoverFlowError(
            'No new cirs-handover-item with data-handover-id appeared in the 引き継ぎ preview after create success.'
        );
    }
    if (newIds.length > 1) {
        throw new TakeoverFlowError(
            `Multiple new handover preview items after create (${newIds.join(', ')}); cannot identify run handover by ID.`
        );
    }
    const handoverId = newIds[0];
    await assertHandoverRowDisplaysContent(section, handoverId, recordId, expectedContent);
    return { handoverId, source: 'handover_preview_item' };
}
