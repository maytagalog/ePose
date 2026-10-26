import { test, expect } from '@playwright/test';
import {
    FETCH_CUSTOMER_SERVICES_ORDER_EVIDENCE,
    parseFetchCustomerServicesResponse,
} from './cirsRecordCustomerServices';
import { countInteractionRecordRows } from './cirsRecordInteractionRows';

test('row container query ignores arrow wrapper-only divs', async ({ page }) => {
    await page.setContent(`
      <div id="host">
        <div class="interaction-record-row">
          <div class="interaction-record-date-column">2026/10/25</div>
          <div class="interaction-record-author-column">Author A</div>
          <div class="interaction-record-arrow-column">
            <div class="interaction-record-arrow-wrapper"><img alt="arrow" /></div>
          </div>
        </div>
      </div>
    `);
    expect(await countInteractionRecordRows(page.locator('#host'))).toBe(1);
});

test('FETCH_CUSTOMER_SERVICES_ORDER_EVIDENCE marks UI order unresolved', () => {
    expect(FETCH_CUSTOMER_SERVICES_ORDER_EVIDENCE.uiRenderOrderMapping).toMatch(/unresolved/);
    expect(FETCH_CUSTOMER_SERVICES_ORDER_EVIDENCE.countMatchDoesNotProveOrder).toBe(true);
    const snapshot = parseFetchCustomerServicesResponse([
        { customerServiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id: 2, createdAt: '2026-10-25T13:00:00.000Z' },
        { customerServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', id: 1, createdAt: '2026-10-25T12:00:00.000Z' },
    ]);
    expect(snapshot.customerServiceIdsInApiOrder[0]).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});
