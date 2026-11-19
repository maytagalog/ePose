import { test, expect } from '@playwright/test';
import {
    assertHandoverRowDisplaysContent,
    handoverItem,
    resolveNewHandoverIdFromSection,
} from './takeoverCreateIdentity';
import { HANDOVER_TEST_IDS } from './takeoverTestIds';
import { TakeoverFlowError } from './takeoverErrors';

const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_RECORD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function rowHtml(handoverId: string, recordId: string, content: string): string {
    return `
    <div
      data-testid="${HANDOVER_TEST_IDS.item}"
      data-handover-id="${handoverId}"
      data-customer-service-id="${recordId}"
    >
      <time>2026-11-02</time>
      <p>${content}</p>
      <span>Staging Author</span>
    </div>`;
}

test('assertHandoverRowDisplaysContent matches body copy inside multi-field row', async ({ page }) => {
    await page.setContent(`
      <section data-testid="${HANDOVER_TEST_IDS.section}">
        ${rowHtml('210', RECORD_ID, 'Staging Smoke Automation')}
      </section>
    `);
    const section = page.getByTestId(HANDOVER_TEST_IDS.section);
    await assertHandoverRowDisplaysContent(section, '210', RECORD_ID, 'Staging Smoke Automation');
    const rowText = (await handoverItem(section, '210').innerText()).trim();
    expect(rowText).toContain('Staging Smoke Automation');
    expect(rowText).toContain('2026-11-02');
    expect(rowText).not.toBe('Staging Smoke Automation');
});

test('resolveNewHandoverIdFromSection rejects new row bound to a different record', async ({ page }) => {
    await page.setContent(`
      <section data-testid="${HANDOVER_TEST_IDS.section}">
        ${rowHtml('208', RECORD_ID, 'seed-208')}
        ${rowHtml('210', OTHER_RECORD_ID, 'Staging Smoke Automation')}
      </section>
    `);
    const section = page.getByTestId(HANDOVER_TEST_IDS.section);
    await expect(
        resolveNewHandoverIdFromSection(
            section,
            RECORD_ID,
            new Set(['208']),
            'Staging Smoke Automation'
        )
    ).rejects.toThrow(TakeoverFlowError);
    await expect(
        resolveNewHandoverIdFromSection(
            section,
            RECORD_ID,
            new Set(['208']),
            'Staging Smoke Automation'
        )
    ).rejects.toThrow(/data-customer-service-id mismatch/);
});

test('full-list row structure accepts exact in-row content without list container identity attrs', async ({
    page,
}) => {
    await page.setContent(`
      <div data-testid="${HANDOVER_TEST_IDS.list}" data-load-state="loaded">
        ${rowHtml('210', RECORD_ID, 'Staging Smoke Automation Updated')}
      </div>
    `);
    const list = page.getByTestId(HANDOVER_TEST_IDS.list);
    await expect(list).not.toHaveAttribute('data-customer-id');
    await expect(list).not.toHaveAttribute('data-customer-service-id');
    await assertHandoverRowDisplaysContent(list, '210', RECORD_ID, 'Staging Smoke Automation Updated');
});
