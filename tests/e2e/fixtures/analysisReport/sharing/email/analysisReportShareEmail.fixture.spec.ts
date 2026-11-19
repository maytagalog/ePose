import { test, expect } from '@playwright/test';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../../../analysisReport/analysisReportTestIds';
import { openAnalysisReportActionsMenu } from '../../../../../analysisReport/displaySettings/analysisReportDisplayItemSettingsFlow';
import {
    assertShareEmailModalDisplaysRecipient,
    expectAnalysisReportShareEmailModalDialog,
} from '../../../../../analysisReport/sharing/email/analysisReportShareEmailModal';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    installAnalysisReportShareEmailFixtureShell,
} from './analysisReportShareEmailFixtureShell';

const FIXTURE_ORIGIN = ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID;

test.describe.configure({ mode: 'serial' });

test('share email: dialog fails to open (fixture)', async ({ page }) => {
    await installAnalysisReportShareEmailFixtureShell(page, { __arvShareEmailFailsOpen: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen).click();
    await expect(page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailDialog)).toBeHidden();
});

test('share email: combined label/address block passes for correct recipient (fixture)', async ({
    page,
}) => {
    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipient: ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen).click();
    const inner = await expectAnalysisReportShareEmailModalDialog(page);
    await assertShareEmailModalDisplaysRecipient(inner, ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT);
    expect(
        await page.evaluate(
            () => (window as unknown as { __arvShareEmailSendAttempted?: boolean }).__arvShareEmailSendAttempted
        )
    ).toBeFalsy();
});

test('share email: different recipient fails before send (fixture)', async ({ page }) => {
    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipient: ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen).click();
    const inner = await expectAnalysisReportShareEmailModalDialog(page);
    await expect(assertShareEmailModalDisplaysRecipient(inner, 'other-recipient@example.com')).rejects.toThrow();
    expect(
        await page.evaluate(
            () => (window as unknown as { __arvShareEmailSendAttempted?: boolean }).__arvShareEmailSendAttempted
        )
    ).toBeFalsy();
});

test('share email: substring address fails strict recipient check (fixture)', async ({ page }) => {
    const stagingLike = 'aardvarkomonstrosesquip1230000@gmail.com';
    const substringOnly = `x-${stagingLike}`;
    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipientBlockHtml: `メールアドレス<br><br>${substringOnly}`,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen).click();
    const inner = await expectAnalysisReportShareEmailModalDialog(page);
    await expect(assertShareEmailModalDisplaysRecipient(inner, stagingLike)).rejects.toThrow();
    expect(
        await page.evaluate(
            () => (window as unknown as { __arvShareEmailSendAttempted?: boolean }).__arvShareEmailSendAttempted
        )
    ).toBeFalsy();
});

test('share email: outer test-id root may lack visible box while inner dialog is open (fixture)', async ({
    page,
}) => {
    await installAnalysisReportShareEmailFixtureShell(page, {});
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen).click();
    const root = page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailDialog);
    const box = await root.boundingBox();
    expect(box === null || box.width === 0 || box.height === 0).toBe(true);
    await expectAnalysisReportShareEmailModalDialog(page);
});
