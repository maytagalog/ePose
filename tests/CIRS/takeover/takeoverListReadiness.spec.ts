import { test, expect } from '@playwright/test';
import {
    assertHandoverFullListReady,
    assertHandoverPreviewListReady,
    HANDOVER_FULL_LIST_READY_TIMEOUT_MS,
    HANDOVER_PREVIEW_LIST_READY_TIMEOUT_MS,
} from './takeoverListReadiness';
import {
    HANDOVER_SECTION_LOAD_STATE_ATTR,
    HANDOVER_SECTION_LOAD_STATES,
    HANDOVER_TEST_IDS,
} from './takeoverTestIds';

const FIXTURE_ORIGIN = 'https://cirs-handover-list-readiness.test';

type HarnessOptions = {
    target: 'preview' | 'fullList';
    initialLoadState?: string;
    loadDelayMs?: number;
    stuckLoading?: boolean;
    loadError?: boolean;
    missingLoadState?: boolean;
    itemCount?: number;
};

function harnessHtml(options: HarnessOptions): string {
    const loadDelayMs = options.loadDelayMs ?? 0;
    const stuckLoading = options.stuckLoading ?? false;
    const loadError = options.loadError ?? false;
    const itemCount = options.itemCount ?? 0;
    const initialLoadState = options.initialLoadState ?? HANDOVER_SECTION_LOAD_STATES.loading;
    const missingAttr = options.missingLoadState ?? false;
    const loadStateAttr = missingAttr ? '' : `${HANDOVER_SECTION_LOAD_STATE_ATTR}="${initialLoadState}"`;

    if (options.target === 'preview') {
        const missingScript = missingAttr
            ? ''
            : `
    setTimeout(function () {
      if (failLoad) {
        setState('${HANDOVER_SECTION_LOAD_STATES.error}');
        return;
      }
      if (stuck) {
        setState('${HANDOVER_SECTION_LOAD_STATES.loading}');
        return;
      }
      for (let i = 0; i < itemCount; i += 1) {
        const item = document.createElement('div');
        item.setAttribute('data-testid', '${HANDOVER_TEST_IDS.item}');
        item.setAttribute('data-handover-id', String(210 + i));
        item.setAttribute('data-customer-service-id', 'record-id');
        itemsHost.appendChild(item);
      }
      setState('${HANDOVER_SECTION_LOAD_STATES.loaded}');
    }, delayMs);`;

        return `<!DOCTYPE html>
<html lang="ja"><body style="margin:0">
  <section style="display:block;min-height:48px;padding:8px" data-testid="${HANDOVER_TEST_IDS.section}" ${loadStateAttr}>
    <div id="items"></div>
  </section>
  <script>
    const section = document.querySelector('[data-testid="${HANDOVER_TEST_IDS.section}"]');
    const itemsHost = document.getElementById('items');
    const delayMs = ${loadDelayMs};
    const stuck = ${stuckLoading ? 'true' : 'false'};
    const failLoad = ${loadError ? 'true' : 'false'};
    const itemCount = ${itemCount};

    function setState(state) {
      section.setAttribute('${HANDOVER_SECTION_LOAD_STATE_ATTR}', state);
    }
${missingScript}
  </script>
</body></html>`;
    }

    return `<!DOCTYPE html>
<html lang="ja"><body style="margin:0">
  <div style="display:block;min-height:48px;padding:8px" data-testid="${HANDOVER_TEST_IDS.list}" ${loadStateAttr}>
    <div id="items"></div>
  </div>
  <script>
    const list = document.querySelector('[data-testid="${HANDOVER_TEST_IDS.list}"]');
    const itemsHost = document.getElementById('items');
    const delayMs = ${loadDelayMs};
    const stuck = ${stuckLoading ? 'true' : 'false'};
    const failLoad = ${loadError ? 'true' : 'false'};
    const itemCount = ${itemCount};

    function setState(state) {
      list.setAttribute('${HANDOVER_SECTION_LOAD_STATE_ATTR}', state);
    }

    setTimeout(function () {
      if (failLoad) {
        setState('${HANDOVER_SECTION_LOAD_STATES.error}');
        return;
      }
      if (stuck) {
        setState('${HANDOVER_SECTION_LOAD_STATES.loading}');
        return;
      }
      for (let i = 0; i < itemCount; i += 1) {
        const item = document.createElement('div');
        item.setAttribute('data-testid', '${HANDOVER_TEST_IDS.item}');
        item.setAttribute('data-handover-id', '210');
        item.setAttribute('data-customer-service-id', 'r1');
        const content = document.createElement('p');
        content.textContent = 'list-row-' + i;
        item.appendChild(content);
        itemsHost.appendChild(item);
      }
      setState('${HANDOVER_SECTION_LOAD_STATES.loaded}');
    }, delayMs);
  </script>
</body></html>`;
}

async function openHarness(
    page: import('@playwright/test').Page,
    options: HarnessOptions
): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: harnessHtml(options) });
    });
    await page.goto(`${FIXTURE_ORIGIN}/record`);
}

test.describe('handover preview list readiness', () => {
    test.describe.configure({ timeout: HANDOVER_PREVIEW_LIST_READY_TIMEOUT_MS + 5000 });

    test('waits through delayed loading then accepts loaded with numeric-string items', async ({ page }) => {
        await openHarness(page, { target: 'preview', loadDelayMs: 400, itemCount: 2 });
        await assertHandoverPreviewListReady(page, 'before_create_baseline');
        const section = page.getByTestId(HANDOVER_TEST_IDS.section);
        await expect(section.getByTestId(HANDOVER_TEST_IDS.item).first()).toHaveAttribute(
            'data-handover-id',
            '210'
        );
    });

    test('fails clearly when preview load state is error', async ({ page }) => {
        await openHarness(page, { target: 'preview', loadDelayMs: 50, loadError: true });
        await expect(assertHandoverPreviewListReady(page, 'after_create_preview')).rejects.toThrow(
            /data-load-state="error"/
        );
    });

    test('fails clearly when preview load state attribute is missing', async ({ page }) => {
        await openHarness(page, { target: 'preview', missingLoadState: true });
        await expect(assertHandoverPreviewListReady(page, 'before_create_baseline')).rejects.toThrow(
            /Missing data-load-state/
        );
    });

    test('fails clearly on preview loading timeout', async ({ page }) => {
        test.setTimeout(HANDOVER_PREVIEW_LIST_READY_TIMEOUT_MS + 10000);
        await openHarness(page, { target: 'preview', stuckLoading: true, loadDelayMs: 0 });
        await expect(assertHandoverPreviewListReady(page, 'before_create_baseline')).rejects.toThrow(
            /data-load-state="loaded"/
        );
    });
});

test.describe('handover full list readiness', () => {
    test.describe.configure({ timeout: HANDOVER_FULL_LIST_READY_TIMEOUT_MS + 5000 });

    test('waits for cirs-handover-list data-load-state loaded', async ({ page }) => {
        await openHarness(page, { target: 'fullList', loadDelayMs: 400, itemCount: 1 });
        await assertHandoverFullListReady(page, 'read_full_list');
        await expect(page.getByTestId(HANDOVER_TEST_IDS.list)).toHaveAttribute(
            HANDOVER_SECTION_LOAD_STATE_ATTR,
            HANDOVER_SECTION_LOAD_STATES.loaded
        );
    });

    test('fails clearly when full list load state is error', async ({ page }) => {
        await openHarness(page, { target: 'fullList', loadDelayMs: 50, loadError: true });
        await expect(assertHandoverFullListReady(page, 'read_full_list')).rejects.toThrow(/data-load-state="error"/);
    });
});
