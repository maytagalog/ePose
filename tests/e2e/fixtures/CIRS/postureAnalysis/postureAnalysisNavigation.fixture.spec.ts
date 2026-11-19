import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCirsPostureAnalysisNavigationFlow } from '../../../../CIRS/postureAnalysis/postureAnalysisFlow';
import { POSTURE_ANALYSIS_FULL_LIST_TEST_IDS } from '../../../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import { POSTURE_ANALYSIS_TEST_IDS } from '../../../../CIRS/postureAnalysis/postureAnalysisTestIds';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-posture-analysis-fixture.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECORD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WRONG_CUSTOMER_ID = '99999999-9999-4999-8999-999999999999';
const FIXTURE_FURIGANA = 'フィクスチャー';

test.describe.configure({ mode: 'serial' });

type ShellOptions = {
    listMode?: 'populated' | 'empty';
    stuckListLoading?: boolean;
    wrongCustomerOnFirstItem?: boolean;
    dropPreviewAfterReopen?: boolean;
    delayedListItems?: boolean;
    wrongListItemCustomerId?: boolean;
    wrongListRouteCustomerId?: boolean;
    wrongBackCustomerId?: boolean;
    wrongReportCustomerId?: boolean;
    wrongReportAnalysisId?: boolean;
    reportShellOnly?: boolean;
};

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsPostureAnalysisShell.html'), 'utf8');
}

async function installShell(page: import('@playwright/test').Page, options?: ShellOptions): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.addInitScript((cfg) => {
        const flags = cfg as ShellOptions;
        const w = window as unknown as Record<string, unknown>;
        w.__paListMode = flags.listMode ?? 'populated';
        w.__paStuckListLoading = flags.stuckListLoading ?? false;
        w.__paWrongCustomerOnFirstItem = flags.wrongCustomerOnFirstItem ?? false;
        w.__paDropPreviewAfterReopen = flags.dropPreviewAfterReopen ?? false;
        w.__paDelayedListItems = flags.delayedListItems ?? false;
        w.__paWrongListItemCustomerId = flags.wrongListItemCustomerId ?? false;
        w.__paWrongListRouteCustomerId = flags.wrongListRouteCustomerId ?? false;
        w.__paWrongBackCustomerId = flags.wrongBackCustomerId ?? false;
        w.__paWrongReportCustomerId = flags.wrongReportCustomerId ?? false;
        w.__paWrongReportAnalysisId = flags.wrongReportAnalysisId ?? false;
        w.__paReportShellOnly = flags.reportShellOnly ?? false;
    }, options ?? {});
}

async function openRecord(page: import('@playwright/test').Page): Promise<void> {
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/${RECORD_ID}`);
}

test('populated list: first preview card opens report with matching ids', async ({ page }) => {
    await installShell(page, { listMode: 'populated' });
    await openRecord(page);

    const result = await runCirsPostureAnalysisNavigationFlow(
        page,
        {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            customerName: 'Fixture Customer',
            customerFurigana: FIXTURE_FURIGANA,
        },
        { appOrigin: FIXTURE_ORIGIN }
    );

    expect(result.listLoadOutcome).toBe('populated');
    expect(result.reportOpening).toBe('verified');
    expect(result.analysisId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(result.navSummary.firstReportOpening).toBe('Passed');
    await expect(page).toHaveURL(
        new RegExp(`/customers/${CUSTOMER_ID}/reports/cccccccc-cccc-4ccc-8ccc-cccccccccccc`)
    );
});

test('empty loaded list: skips report opening and finishes on selected customer page', async ({ page }) => {
    await installShell(page, { listMode: 'empty' });
    await openRecord(page);

    const result = await runCirsPostureAnalysisNavigationFlow(
        page,
        {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            customerName: 'Fixture Customer',
            customerFurigana: FIXTURE_FURIGANA,
        },
        { appOrigin: FIXTURE_ORIGIN }
    );

    expect(result.listLoadOutcome).toBe('empty');
    expect(result.reportOpening).toBe('skipped_no_analysis_reports');
    expect(result.navSummary.firstReportOpening).toBe('Skipped');
    expect(result.navSummary.sameRecordReopen).toBe('Not reached');
    await expect(page).toHaveURL(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}`);
});

test('stuck list loading is not treated as empty', async ({ page }) => {
    await installShell(page, { stuckListLoading: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/remained actively loading/i);

    await expect(page.getByTestId(POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList)).toBeVisible();
});

test('wrong data-customer-id on first preview card fails', async ({ page }) => {
    await installShell(page, { wrongCustomerOnFirstItem: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/data-customer-id/i);
});

test('preview cards missing after reopen fails clearly', async ({ page }) => {
    await installShell(page, { dropPreviewAfterReopen: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/first visible cirs-analysis-item/i);
});

test('delayed full-list row rendering reaches populated terminal state', async ({ page }) => {
    await installShell(page, { listMode: 'populated', delayedListItems: true });
    await openRecord(page);

    const result = await runCirsPostureAnalysisNavigationFlow(
        page,
        {
            customerId: CUSTOMER_ID,
            recordId: RECORD_ID,
            customerName: 'Fixture Customer',
            customerFurigana: FIXTURE_FURIGANA,
        },
        { appOrigin: FIXTURE_ORIGIN }
    );

    expect(result.listLoadOutcome).toBe('populated');
});

test('wrong full-list route customer id fails before list success', async ({ page }) => {
    await installShell(page, { listMode: 'populated', wrongListRouteCustomerId: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/Analysis full-list route customer/i);
});

test('wrong back destination customer id fails before same-record reopen', async ({ page }) => {
    await installShell(page, { listMode: 'populated', wrongBackCustomerId: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/route customer \(99999999-9999-4999-8999-999999999999\) != expected aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/i);

    await expect(page).toHaveURL(new RegExp(`/customers/${WRONG_CUSTOMER_ID.replace(/-/g, '\\-')}$`));
});

test('wrong analysis-report data-customer-id fails report opening', async ({ page }) => {
    test.setTimeout(60000);
    await installShell(page, { listMode: 'populated', wrongReportCustomerId: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/analysis-report data-customer-id \(99999999-9999-4999-8999-999999999999\)/i);
});

test('wrong analysis-report data-analysis-id fails report opening', async ({ page }) => {
    test.setTimeout(60000);
    await installShell(page, { listMode: 'populated', wrongReportAnalysisId: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/data-analysis-id|dddddddd-dddd-4ddd-8ddd-dddddddddddd/i);
});

test('wrong full-list row data-customer-id fails before list success', async ({ page }) => {
    await installShell(page, { listMode: 'populated', wrongListItemCustomerId: true });
    await openRecord(page);

    await expect(
        runCirsPostureAnalysisNavigationFlow(
            page,
            {
                customerId: CUSTOMER_ID,
                recordId: RECORD_ID,
                customerName: 'Fixture Customer',
                customerFurigana: FIXTURE_FURIGANA,
            },
            { appOrigin: FIXTURE_ORIGIN }
        )
    ).rejects.toThrow(/Full-list cirs-analysis-item/i);
});
