import { test, expect } from '@playwright/test';
import {
    awaitHandwrittenNoteListSettled,
    HANDWRITTEN_LIST_LOAD_TIMEOUT_MS,
} from './handwrittenNotesListReadiness';
import {
    HANDWRITTEN_SECTION_LOAD_STATE_ATTR,
    HANDWRITTEN_SECTION_LOAD_STATES,
    HANDWRITTEN_TEST_IDS,
} from './handwrittenNotesTestIds';

const FIXTURE_ORIGIN = 'https://cirs-handwritten-list-readiness.test';

type ListHarnessOptions = {
    initialLoadState?: string;
    loadDelayMs?: number;
    stuckLoading?: boolean;
    loadError?: boolean;
    itemCount?: number;
};

function listHarnessHtml(options: ListHarnessOptions): string {
    const loadDelayMs = options.loadDelayMs ?? 0;
    const stuckLoading = options.stuckLoading ?? false;
    const loadError = options.loadError ?? false;
    const itemCount = options.itemCount ?? 0;
    const initialLoadState = options.initialLoadState ?? HANDWRITTEN_SECTION_LOAD_STATES.loading;

    return `<!DOCTYPE html>
<html lang="ja"><body style="margin:0">
  <section style="display:block;min-height:48px;padding:8px" data-testid="${HANDWRITTEN_TEST_IDS.section}" ${HANDWRITTEN_SECTION_LOAD_STATE_ATTR}="${initialLoadState}">
    <div id="items"></div>
  </section>
  <script>
    const section = document.querySelector('[data-testid="${HANDWRITTEN_TEST_IDS.section}"]');
    const itemsHost = document.getElementById('items');
    const delayMs = ${loadDelayMs};
    const stuck = ${stuckLoading ? 'true' : 'false'};
    const failLoad = ${loadError ? 'true' : 'false'};
    const itemCount = ${itemCount};

    function setState(state) {
      section.setAttribute('${HANDWRITTEN_SECTION_LOAD_STATE_ATTR}', state);
    }

    setTimeout(function () {
      if (failLoad) {
        setState('${HANDWRITTEN_SECTION_LOAD_STATES.error}');
        return;
      }
      if (stuck) {
        setState('${HANDWRITTEN_SECTION_LOAD_STATES.loading}');
        return;
      }
      for (let i = 0; i < itemCount; i += 1) {
        const item = document.createElement('div');
        item.setAttribute('data-testid', '${HANDWRITTEN_TEST_IDS.item}');
        item.setAttribute('data-note-id', 'note-' + i);
        item.setAttribute('data-customer-service-id', 'record-id');
        itemsHost.appendChild(item);
      }
      setState('${HANDWRITTEN_SECTION_LOAD_STATES.loaded}');
    }, delayMs);
  </script>
</body></html>`;
}

async function openHarness(
    page: import('@playwright/test').Page,
    options: ListHarnessOptions
): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: listHarnessHtml(options) });
    });
    await page.goto(`${FIXTURE_ORIGIN}/record`);
}

test.describe('handwritten note list readiness', () => {
    test.describe.configure({ timeout: HANDWRITTEN_LIST_LOAD_TIMEOUT_MS + 5000 });

    test('waits through delayed loading then accepts loaded empty', async ({ page }) => {
        await openHarness(page, { loadDelayMs: 400, itemCount: 0 });
        await awaitHandwrittenNoteListSettled(page, 'initial_snapshot');
        const section = page.getByTestId(HANDWRITTEN_TEST_IDS.section);
        await expect(section).toHaveAttribute(
            HANDWRITTEN_SECTION_LOAD_STATE_ATTR,
            HANDWRITTEN_SECTION_LOAD_STATES.loaded
        );
        await expect(section.getByTestId(HANDWRITTEN_TEST_IDS.item)).toHaveCount(0);
    });

    test('waits through delayed loading then accepts loaded populated', async ({ page }) => {
        await openHarness(page, { loadDelayMs: 400, itemCount: 2 });
        await awaitHandwrittenNoteListSettled(page, 'before_create');
        const section = page.getByTestId(HANDWRITTEN_TEST_IDS.section);
        await expect(section.getByTestId(HANDWRITTEN_TEST_IDS.item)).toHaveCount(2);
    });

    test('fails clearly when load state is error', async ({ page }) => {
        await openHarness(page, { loadDelayMs: 50, loadError: true });
        await expect(page.getByTestId(HANDWRITTEN_TEST_IDS.section)).toHaveAttribute(
            HANDWRITTEN_SECTION_LOAD_STATE_ATTR,
            HANDWRITTEN_SECTION_LOAD_STATES.error,
            { timeout: 5000 }
        );
        await expect(awaitHandwrittenNoteListSettled(page, 'after_reload')).rejects.toThrow(
            /data-load-state="error"/
        );
    });

    test('fails clearly when load state attribute is missing', async ({ page }) => {
        await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
            route.fulfill({
                contentType: 'text/html',
                body: `<!DOCTYPE html><body style="margin:0"><section style="display:block;min-height:48px" data-testid="${HANDWRITTEN_TEST_IDS.section}"></section></body></html>`,
            });
        });
        await page.goto(`${FIXTURE_ORIGIN}/record`);
        await expect(awaitHandwrittenNoteListSettled(page, 'initial_snapshot')).rejects.toThrow(
            /Missing data-load-state/
        );
    });

    test('fails clearly on loading timeout', async ({ page }) => {
        test.setTimeout(HANDWRITTEN_LIST_LOAD_TIMEOUT_MS + 10000);
        await openHarness(page, { stuckLoading: true, loadDelayMs: 0 });
        await expect(awaitHandwrittenNoteListSettled(page, 'before_create')).rejects.toThrow(
            /Timed out waiting for handwritten note list data-load-state="loaded"/
        );
    });
});
