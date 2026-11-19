import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CirsRecordContext } from '../../../../CIRS/cirsRecord/cirsRecordFlow';
import {
    beginResponseDetailCapture,
    type ResponseDetailLoadResult,
} from '../../../../CIRS/responseDetails/responseDetailsApi';
import {
    buildStagingSmokeResponseText,
    runCirsResponseDetailsFlow,
    type RunCirsResponseDetailsOptions,
} from '../../../../CIRS/responseDetails/responseDetailsFlow';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-response-fixture.test';
const FIXTURE_API_ORIGIN = FIXTURE_ORIGIN;
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MANILA_DATE = '2026-10-27';

type ShellOptions = {
    autosaveDelayMs?: number;
    autosaveError?: boolean;
    hangAutosaveSaving?: boolean;
    staleSavedTimestamp?: boolean;
    timestampWithoutSavedState?: boolean;
    wrongCustomerOnDetail?: boolean;
    responseDetailBody?: 'null' | 'from_storage' | 'malformed' | 'wrong_record';
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsResponseDetailsShell.html'), 'utf8');
}

function recordContext(): CirsRecordContext {
    return {
        customerId: CUSTOMER_ID,
        customerName: 'Fixture Customer',
        customerFurigana: 'フィクスチャ',
        recordId: RECORD_ID,
        recordUrl: `${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`,
        createAttempted: false,
        createConfirmed: true,
        recordIdentitySource: 'route_only',
        customerIdFromApi: null,
        apiParseNotes: ['fixture'],
    };
}

async function installResponseDetailsShell(
    page: import('@playwright/test').Page,
    options?: ShellOptions
): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        if (route.request().url().includes('/customer_interaction_record/response_detail')) {
            return route.fallback();
        }
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.route(`${FIXTURE_API_ORIGIN}/customer_interaction_record/response_detail**`, async (route) => {
        const mode = options?.responseDetailBody ?? 'from_storage';
        if (mode === 'malformed') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: '"not-an-object"' });
            return;
        }
        if (mode === 'wrong_record') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    customerServiceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                    details: 'wrong',
                }),
            });
            return;
        }
        if (mode === 'null') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
            return;
        }
        const details = await page.evaluate(() => sessionStorage.getItem('cirs-response-fixture-value') || '');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ customerServiceId: RECORD_ID, details }),
        });
    });
    await page.addInitScript((cfg) => {
        const flags = cfg as ShellOptions;
        (window as unknown as { __rdMirrorResponseDetailApi?: boolean }).__rdMirrorResponseDetailApi = true;
        (window as unknown as { __rdAutosaveDelayMs?: number }).__rdAutosaveDelayMs =
            flags.autosaveDelayMs ?? 80;
        (window as unknown as { __rdAutosaveError?: boolean }).__rdAutosaveError =
            flags.autosaveError ?? false;
        (window as unknown as { __rdHangAutosaveSaving?: boolean }).__rdHangAutosaveSaving =
            flags.hangAutosaveSaving ?? false;
        (window as unknown as { __rdStaleSavedTimestamp?: boolean }).__rdStaleSavedTimestamp =
            flags.staleSavedTimestamp ?? false;
        (window as unknown as { __rdTimestampWithoutSavedState?: boolean }).__rdTimestampWithoutSavedState =
            flags.timestampWithoutSavedState ?? false;
        (window as unknown as { __rdWrongCustomerOnDetail?: boolean }).__rdWrongCustomerOnDetail =
            flags.wrongCustomerOnDetail ?? false;
    }, options ?? {});
}

async function openFixtureRecordWithCapture(
    page: import('@playwright/test').Page
): Promise<ResponseDetailLoadResult> {
    const capture = beginResponseDetailCapture(page, RECORD_ID, { apiOrigin: FIXTURE_API_ORIGIN });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
    return await capture;
}

function flowOptions(load: ResponseDetailLoadResult): RunCirsResponseDetailsOptions {
    return { manilaDateIso: MANILA_DATE, responseDetailLoad: load };
}

async function inputEventCount(page: import('@playwright/test').Page): Promise<number> {
    return page.evaluate(() => {
        const fn = (window as unknown as { __rdGetInputEventCount?: () => number }).__rdGetInputEventCount;
        return fn ? fn() : 0;
    });
}

test('response_detail completes before flow starts (navigation capture)', async ({ page }) => {
    await installResponseDetailsShell(page, { responseDetailBody: 'null' });
    const load = await openFixtureRecordWithCapture(page);
    expect(load).toEqual({ kind: 'no_details', recordId: RECORD_ID });
    const result = await runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load));
    expect(result.saveOutcome).toBe('saved_after_edit');
    expect(await inputEventCount(page)).toBe(1);
});

test('null response_detail: empty textbox fills and autosaves (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page, { responseDetailBody: 'null', autosaveDelayMs: 400 });
    const load = await openFixtureRecordWithCapture(page);
    const result = await runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load));
    expect(result.saveOutcome).toBe('saved_after_edit');
    expect(result.savedTimestamp).toBeTruthy();
});

test('empty textbox: delayed autosave completes without reload (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page, { autosaveDelayMs: 400, responseDetailBody: 'null' });
    const load = await openFixtureRecordWithCapture(page);
    const result = await runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load));
    expect(result.saveOutcome).toBe('saved_after_edit');
    expect(result.expectedText).toBe(buildStagingSmokeResponseText(MANILA_DATE));
    expect(await inputEventCount(page)).toBe(1);
});

test('stale saved marker cannot pass as a new save (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page, { staleSavedTimestamp: true, responseDetailBody: 'null' });
    const load = await openFixtureRecordWithCapture(page);
    await page.evaluate(() => {
        const saveStatus = document.querySelector('[data-testid="cirs-response-save-status"]');
        saveStatus?.setAttribute('data-last-saved-at', '2020-01-01T00:00:00.000Z');
    });
    await expect(runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load))).rejects.toThrow(
        /data-save-state=saved with nonempty data-last-saved-at/i
    );
});

test('autosave error state fails without a second fill (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page, { autosaveError: true, responseDetailBody: 'null' });
    const load = await openFixtureRecordWithCapture(page);
    const expectedText = buildStagingSmokeResponseText(MANILA_DATE);
    await expect(runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load))).rejects.toThrow(
        /data-save-state=saved with nonempty data-last-saved-at/i
    );
    await expect(page.getByTestId('cirs-response-input')).toHaveValue(expectedText);
    await expect(page.getByTestId('cirs-response-save-status')).toHaveAttribute('data-save-state', 'error');
    expect(await inputEventCount(page)).toBe(1);
});

test('permanently saving state times out without a second fill (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page, {
        hangAutosaveSaving: true,
        autosaveDelayMs: 50,
        responseDetailBody: 'null',
    });
    const load = await openFixtureRecordWithCapture(page);
    const expectedText = buildStagingSmokeResponseText(MANILA_DATE);
    await expect(runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load))).rejects.toThrow(
        /data-save-state=saved with nonempty data-last-saved-at/i
    );
    await expect(page.getByTestId('cirs-response-input')).toHaveValue(expectedText);
    await expect(page.getByTestId('cirs-response-save-status')).toHaveAttribute('data-save-state', 'saving');
    expect(await inputEventCount(page)).toBe(1);
});

test('timestamp changes without saved state fails (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page, { timestampWithoutSavedState: true, responseDetailBody: 'null' });
    const load = await openFixtureRecordWithCapture(page);
    await expect(runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load))).rejects.toThrow(
        /data-save-state=saved with nonempty data-last-saved-at/i
    );
});

test('wrong record customer fails before editing (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page, { wrongCustomerOnDetail: true, responseDetailBody: 'null' });
    const load = await openFixtureRecordWithCapture(page);
    await expect(runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load))).rejects.toThrow(
        /cirs-record-detail customer id|Route customer id/i
    );
    expect(await inputEventCount(page)).toBe(0);
});

test('existing non-whitespace content skips edit (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
    const expectedText = buildStagingSmokeResponseText(MANILA_DATE);
    await page.evaluate((text) => {
        const seed = (window as unknown as { __rdSeedValue?: (t: string) => void }).__rdSeedValue;
        seed?.(text);
    }, expectedText);
    const load: ResponseDetailLoadResult = {
        kind: 'loaded',
        recordId: RECORD_ID,
        details: expectedText,
    };
    const result = await runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load));
    expect(result.saveOutcome).toBe('skipped_existing_content');
    expect(result.savedTimestamp).toBeNull();
    expect(await inputEventCount(page)).toBe(0);
});

test('idle save state with existing content skips without autosave (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
    const expectedText = buildStagingSmokeResponseText(MANILA_DATE);
    await page.evaluate((text) => {
        const seed = (window as unknown as { __rdSeedIdlePersistedValue?: (t: string) => void })
            .__rdSeedIdlePersistedValue;
        seed?.(text);
    }, expectedText);
    const load: ResponseDetailLoadResult = {
        kind: 'loaded',
        recordId: RECORD_ID,
        details: expectedText,
    };
    const result = await runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load));
    expect(result.saveOutcome).toBe('skipped_existing_content');
    expect(await inputEventCount(page)).toBe(0);
});

test('existing content different from smoke text still skips (fixture)', async ({ page }) => {
    await installResponseDetailsShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
    const existing = 'Prior customer note from an earlier session';
    await page.evaluate((text) => {
        const seed = (window as unknown as { __rdSeedIdlePersistedValue?: (t: string) => void })
            .__rdSeedIdlePersistedValue;
        seed?.(text);
    }, existing);
    const load: ResponseDetailLoadResult = { kind: 'loaded', recordId: RECORD_ID, details: existing };
    const result = await runCirsResponseDetailsFlow(page, recordContext(), flowOptions(load));
    expect(result.saveOutcome).toBe('skipped_existing_content');
    await expect(page.getByTestId('cirs-response-input')).toHaveValue(existing);
});
