import { test, expect } from '@playwright/test';
import {
    completeSharedReportGuestVerification,
    isFetchSharedReportResponse,
    scrollSharedReportToStableBottom,
    SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
    SHARED_REPORT_SCROLL_TIMEOUT_MS,
} from '../../../../../analysisReport/sharing/email/analysisReportSharedReportVerification';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
} from './analysisReportShareEmailFixtureShell';
import {
    installSharedReportScrollFixture,
    SHARED_REPORT_SCROLL_FIXTURE_ORIGIN,
} from './sharedReportScrollFixtureShell';

const CUSTOMER_ID = ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID;

test('shared report scroll: incremental pass reaches stable bottom (fixture)', async ({ page }) => {
    await installSharedReportScrollFixture(page, { scrollMode: 'normal' });
    const fetchPromise = page.waitForResponse(isFetchSharedReportResponse, {
        timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
    });
    await page.goto(`${SHARED_REPORT_SCROLL_FIXTURE_ORIGIN}/shared-report?token=fixture-token`);
    await completeSharedReportGuestVerification(page, fetchPromise, CUSTOMER_ID, ANALYSIS_ID);
    await expect(page.getByText('Fixture report bottom')).toBeVisible();
});

test('shared report scroll: growing content still reaches stable bottom (fixture)', async ({ page }) => {
    test.setTimeout(SHARED_REPORT_SCROLL_TIMEOUT_MS + 30_000);
    await installSharedReportScrollFixture(page, { scrollMode: 'growing' });
    const fetchPromise = page.waitForResponse(isFetchSharedReportResponse, {
        timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
    });
    await page.goto(`${SHARED_REPORT_SCROLL_FIXTURE_ORIGIN}/shared-report?token=fixture-token`);
    await completeSharedReportGuestVerification(page, fetchPromise, CUSTOMER_ID, ANALYSIS_ID);
    await expect(page.getByText('Late-loaded section 3')).toBeVisible();
});

test('shared report scroll: stalled container fails clearly (fixture)', async ({ page }) => {
    test.setTimeout(45_000);
    await installSharedReportScrollFixture(page, { scrollMode: 'stalled' });
    const fetchPromise = page.waitForResponse(isFetchSharedReportResponse, {
        timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
    });
    await page.goto(`${SHARED_REPORT_SCROLL_FIXTURE_ORIGIN}/shared-report?token=fixture-token`);
    await expect(
        completeSharedReportGuestVerification(page, fetchPromise, CUSTOMER_ID, ANALYSIS_ID, {
            scrollOptions: { timeoutMs: 12_000, stableBottomChecks: 2 },
        })
    ).rejects.toThrow(/stalled|stable bottom/i);
});

test('shared report scroll: ignores larger unrelated scroll panel (fixture)', async ({ page }) => {
    await installSharedReportScrollFixture(page, { scrollMode: 'normal', decoyScrollPanel: true });
    const fetchPromise = page.waitForResponse(isFetchSharedReportResponse, {
        timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
    });
    await page.goto(`${SHARED_REPORT_SCROLL_FIXTURE_ORIGIN}/shared-report?token=fixture-token`);
    await completeSharedReportGuestVerification(page, fetchPromise, CUSTOMER_ID, ANALYSIS_ID);
    await expect(page.getByText('Fixture report bottom')).toBeVisible();

    const reportScroller = page.locator('#scroll-root[data-epose-shared-report-scroll-root="true"]');
    await expect(reportScroller).toHaveCount(1);
    await expect(page.locator('#unrelated-decoy-scroll[data-epose-shared-report-scroll-root="true"]')).toHaveCount(
        0
    );
    const decoyScrollTop = await page.locator('#unrelated-decoy-scroll').evaluate((el) => el.scrollTop);
    const reportScrollTop = await reportScroller.evaluate((el) => el.scrollTop);
    expect(decoyScrollTop).toBe(0);
    expect(reportScrollTop).toBeGreaterThan(0);
});

test('shared report scroll: stall fixture rejects before scroll helper alone', async ({ page }) => {
    await installSharedReportScrollFixture(page, { scrollMode: 'stalled', sectionCount: 12 });
    await page.goto(`${SHARED_REPORT_SCROLL_FIXTURE_ORIGIN}/shared-report?token=fixture-token`);
    await expect(
        scrollSharedReportToStableBottom(page, { timeoutMs: 8000, stableBottomChecks: 2 })
    ).rejects.toThrow(/stalled|stable bottom/i);
});
