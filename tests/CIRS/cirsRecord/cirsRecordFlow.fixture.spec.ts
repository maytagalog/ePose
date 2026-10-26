import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    assertCustomerDetailsCollapsedForCirs,
    assertUniqueInteractionRecordsSection,
    CREATE_CUSTOMER_INTERACTION_RECORD_URL,
    interactionRecordArrowWrapperMislocator,
    interactionRecordRowsInCustomerSection,
    interactionRecordSectionListControl,
    interactionRecordsSectionCandidates,
    INTERACTION_RECORD_SECTION_LIST_BUTTON_NAME,
    runCirsRecordCreationAndListNavigation,
    runCirsRecordListNavigationVerification,
} from './cirsRecordFlow';
import { countInteractionRecordRows } from './cirsRecordInteractionRows';
import {
    FETCH_CUSTOMER_SERVICES_URL,
    parseFetchCustomerServicesResponse,
    resolveCustomerServiceIndex,
} from './cirsRecordCustomerServices';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures');
const FIXTURE_ORIGIN = 'https://cirs-fixture.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type ShellOptions = {
    failCreatePost?: boolean;
    apiResponseRecordId?: string;
    apiMalformedBody?: boolean;
    appendNewRecord?: boolean;
    wrongCustomerOnReopen?: boolean;
    fireWrongCustomerFetch?: boolean;
    /** Pre-seed this record link for verification-only runs (no create click). */
    seedRecordId?: string;
    /** Navigate to a different record id than the create API returned (route vs API mismatch). */
    forceRouteRecordId?: string;
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsRecordCustomerShell.html'), 'utf8');
}

async function installCirsShell(page: import('@playwright/test').Page, options?: ShellOptions): Promise<void> {
    let fetchServicesBody = '[]';
    await page.exposeBinding('syncCirsServicesPayload', (_source, json: string) => {
        fetchServicesBody = json;
    });
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.route(`${FETCH_CUSTOMER_SERVICES_URL}*`, async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: fetchServicesBody,
        });
    });
    await page.route(CREATE_CUSTOMER_INTERACTION_RECORD_URL, async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        if (options?.failCreatePost) {
            await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fixture"}' });
            return;
        }
        if (options?.apiMalformedBody) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: 'not-a-valid-uuid-body',
            });
            return;
        }
        const recordId = options?.apiResponseRecordId ?? crypto.randomUUID();
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: recordId,
        });
    });
    await page.addInitScript((cfg) => {
        const flags = cfg as ShellOptions;
        (window as unknown as { __cirsFailCreate?: boolean }).__cirsFailCreate = flags.failCreatePost ?? false;
        (window as unknown as { __cirsAppendNewRecord?: boolean }).__cirsAppendNewRecord =
            flags.appendNewRecord ?? false;
        (window as unknown as { __cirsWrongCustomerOnReopen?: boolean }).__cirsWrongCustomerOnReopen =
            flags.wrongCustomerOnReopen ?? false;
        (window as unknown as { __cirsSeedRecordId?: string | null }).__cirsSeedRecordId =
            flags.seedRecordId ?? null;
        (window as unknown as { __cirsForceRouteRecordId?: string | null }).__cirsForceRouteRecordId =
            flags.forceRouteRecordId ?? null;
        (window as unknown as { __cirsFireWrongCustomerFetch?: boolean }).__cirsFireWrongCustomerFetch =
            flags.fireWrongCustomerFetch ?? false;
    }, {
        failCreatePost: options?.failCreatePost ?? false,
        appendNewRecord: options?.appendNewRecord ?? false,
        wrongCustomerOnReopen: options?.wrongCustomerOnReopen ?? false,
        fireWrongCustomerFetch: options?.fireWrongCustomerFetch ?? false,
        seedRecordId: options?.seedRecordId,
        forceRouteRecordId: options?.forceRouteRecordId,
    });
}

test('creates one record, lists it, reopens detail (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    const ctx = await runCirsRecordCreationAndListNavigation(page, {
        env: { createRecordApiUrl: CREATE_CUSTOMER_INTERACTION_RECORD_URL },
    });
    expect(ctx.customerId).toBe(CUSTOMER_ID);
    expect(ctx.recordId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(ctx.recordUrl).toContain(ctx.recordId);
    expect(ctx.recordIdentitySource).toBe('api_and_route');
    expect(await page.evaluate(() => (window as unknown as { __cirsCreatePostCount?: number }).__cirsCreatePostCount)).toBe(1);
});

test('new record is API index 0; same-date rows stay distinct by customerServiceId (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    const ctx = await runCirsRecordCreationAndListNavigation(page);
    const payload = await page.evaluate(() => {
        const fn = (window as unknown as { __cirsServicesPayload?: () => unknown[] }).__cirsServicesPayload;
        return fn ? fn() : [];
    });
    const snapshot = parseFetchCustomerServicesResponse(payload);
    expect(snapshot.customerServiceIdsInApiOrder[0]).toBe(ctx.recordId);
    expect(resolveCustomerServiceIndex(snapshot, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBe(1);
    expect(resolveCustomerServiceIndex(snapshot, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toBe(2);
});

test('API lists older record first fails top-of-list verification (fixture)', async ({ page }) => {
    await installCirsShell(page, { appendNewRecord: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await expect(runCirsRecordCreationAndListNavigation(page)).rejects.toThrow(
        /fetch_customer_services first entry|rendered row count/i
    );
});

test('row locator selects full record row, not nested arrow wrapper (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
    const main = page.getByRole('main');
    await assertCustomerDetailsCollapsedForCirs(main);
    const section = await assertUniqueInteractionRecordsSection(main);
    expect(await countInteractionRecordRows(section)).toBe(2);
    const rows = interactionRecordRowsInCustomerSection(section);
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveClass(/interaction-record-row/);
    await expect(rows.first().locator('.interaction-record-date-column')).toHaveText('2026/10/25');
    await expect(rows.first().locator('.interaction-record-author-column')).toHaveText('Fixture Author');
    await expect(section.locator('.interaction-record-arrow-wrapper')).toHaveCount(2);
    const mislocator = interactionRecordArrowWrapperMislocator(section);
    await expect(mislocator).toHaveCount(0);
});

test('same date and author rows open distinct customerServiceId routes (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
    const main = page.getByRole('main');
    await assertCustomerDetailsCollapsedForCirs(main);
    const section = await assertUniqueInteractionRecordsSection(main);
    const rows = interactionRecordRowsInCustomerSection(section);
    await expect(rows).toHaveCount(2);
    await rows.nth(1).click();
    await expect(page).toHaveURL(/interaction-records\/cccccccc-cccc-4ccc-8ccc-cccccccccccc/i);
});

test('collapsed customer details after back from record/list are expected (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    const ctx = await runCirsRecordCreationAndListNavigation(page);
    expect(ctx.createConfirmed).toBe(true);
    expect(ctx.recordUrl).toMatch(/\/interaction-records\/[0-9a-f-]{36}/i);
});

test('CIRS does not expand profile; create flow runs with collapsed details (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.locator('.customer-record-row').click();
    const main = page.getByRole('main');
    await assertCustomerDetailsCollapsedForCirs(main);
    await runCirsRecordCreationAndListNavigation(page, {
        existingCustomer: {
            customerId: CUSTOMER_ID,
            name: 'Fixture CIRS Customer',
            furigana: 'フィクスチャシーアイアールエス',
        },
    });
});

test('wrong customer on reopen fails (fixture)', async ({ page }) => {
    await installCirsShell(page, { wrongCustomerOnReopen: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await expect(runCirsRecordCreationAndListNavigation(page)).rejects.toThrow(
        /same customer id|not under the same customer id/i
    );
});

test('API UUID mismatch with route fails (fixture)', async ({ page }) => {
    await installCirsShell(page, {
        apiResponseRecordId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        forceRouteRecordId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await expect(runCirsRecordCreationAndListNavigation(page)).rejects.toThrow(/did not match route id/i);
});

test('malformed create response body fails (fixture)', async ({ page }) => {
    await installCirsShell(page, { apiMalformedBody: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.locator('#phonebook-list-wrapper .customer-record-row').click();
    await expect(
        runCirsRecordCreationAndListNavigation(page, {
            existingCustomer: {
                customerId: CUSTOMER_ID,
                name: 'Fixture CIRS Customer',
                furigana: 'フィクスチャシーアイアールエス',
            },
        })
    ).rejects.toThrow(/not a single UUID/i);
});

test('verification-only: existing record list navigation without 新規応対 (fixture)', async ({ page }) => {
    const seedRecordId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await installCirsShell(page, { seedRecordId });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);

    const ctx = await runCirsRecordListNavigationVerification(
        page,
        {
            customerId: CUSTOMER_ID,
            recordId: seedRecordId,
            customerName: 'Fixture CIRS Customer',
            customerFurigana: 'フィクスチャシーアイアールエス',
            appOrigin: FIXTURE_ORIGIN,
        }
    );
    expect(ctx.createAttempted).toBe(false);
    expect(ctx.recordId).toBe(seedRecordId);
    expect(await page.evaluate(() => (window as unknown as { __cirsCreatePostCount?: number }).__cirsCreatePostCount ?? 0)).toBe(0);
});

test('scoped 一覧 opens list; header decoy 一覧 does not (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await runCirsRecordCreationAndListNavigation(page);
    expect(page.url()).toContain('/interaction-records/');
});

test('creation POST failure stops without a second create (fixture)', async ({ page }) => {
    await installCirsShell(page, { failCreatePost: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.locator('#phonebook-list-wrapper .customer-record-row').click();
    await expect(page).toHaveURL(new RegExp(`/customers/${CUSTOMER_ID}(?:/|$|\\?)`));
    let lastEvidence: unknown = null;
    await expect(
        runCirsRecordCreationAndListNavigation(page, {
            existingCustomer: {
                customerId: CUSTOMER_ID,
                name: 'Fixture CIRS Customer',
                furigana: 'フィクスチャシーアイアールエス',
            },
            onEvidence: (evidence) => {
                lastEvidence = evidence;
            },
        })
    ).rejects.toThrow(/Create record POST failed/i);
    expect(lastEvidence).toMatchObject({
        customerId: CUSTOMER_ID,
        createAttempted: true,
        createConfirmed: false,
        recordId: null,
    });
    expect(await page.evaluate(() => (window as unknown as { __cirsCreatePostCount?: number }).__cirsCreatePostCount ?? 0)).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/customers/${CUSTOMER_ID}(?:/|$|\\?)`));
});

test('section 一覧 control is scoped under 応対記録 (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.locator('.customer-record-row').click();
    const main = page.getByRole('main');
    const section = await assertUniqueInteractionRecordsSection(main);
    await expect(interactionRecordSectionListControl(section)).toBeVisible();
    await expect(main.locator('#decoy-list-customer-toolbar')).toBeVisible();
    await expect(section.getByRole('button', { name: /list posture report/i })).toHaveCount(0);
});

test('exactly one 応対記録 section; header-only decoy is hidden (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
    const main = page.getByRole('main');
    await expect(interactionRecordsSectionCandidates(main)).toHaveCount(1);
    await expect(main.locator('.interaction-records-header-only')).toBeHidden();
});

test('一覧 accessible name includes list response report icon alt (fixture)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
    const main = page.getByRole('main');
    const section = await assertUniqueInteractionRecordsSection(main);
    await expect(section.getByRole('button', { name: INTERACTION_RECORD_SECTION_LIST_BUTTON_NAME })).toBeVisible();
});

test('rows render after fetch completes (fixture delayed render)', async ({ page }) => {
    await installCirsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
    const main = page.getByRole('main');
    const section = await assertUniqueInteractionRecordsSection(main);
    await page.evaluate(() => {
        const host = document.getElementById('interaction-record-rows');
        if (host) host.innerHTML = '';
    });
    expect(await countInteractionRecordRows(section)).toBe(0);
    await page.evaluate(async () => {
        const refresh = (window as unknown as { __cirsRefreshSectionFromApi?: () => Promise<void> })
            .__cirsRefreshSectionFromApi;
        if (typeof refresh === 'function') {
            await refresh();
        }
    });
    await expect.poll(async () => countInteractionRecordRows(section)).toBe(2);
});

test('wrong-customer fetch responses are ignored by capture (fixture)', async ({ page }) => {
    await installCirsShell(page, { fireWrongCustomerFetch: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
    const { beginFetchCustomerServicesCapture } = await import('./cirsRecordCustomerServices');
    const capture = beginFetchCustomerServicesCapture(page, CUSTOMER_ID, 5000);
    try {
        const snapshotPromise = capture.waitForSnapshot({ fresh: true, kind: 'customer_preview' });
        await page.evaluate(async () => {
            const refresh = (window as unknown as { __cirsRefreshSectionFromApi?: () => Promise<void> })
                .__cirsRefreshSectionFromApi;
            if (typeof refresh === 'function') {
                await refresh();
            }
            const wrong = (window as unknown as { __cirsFetchWrongCustomer?: () => Promise<unknown> })
                .__cirsFetchWrongCustomer;
            if (typeof wrong === 'function') {
                await wrong();
            }
        });
        const snapshot = await snapshotPromise;
        expect(snapshot.customerServiceIdsInApiOrder.length).toBeGreaterThan(0);
        expect(snapshot.requestUrl).toContain(`customerId=${CUSTOMER_ID}`);
    } finally {
        capture.dispose();
    }
});
