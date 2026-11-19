import { test, expect } from '@playwright/test';
import { POST_SHARE_REPORT_EMAIL_URL } from '../../../../../analysisReport/analysisReportTestIds';
import { openAnalysisReportActionsMenu } from '../../../../../analysisReport/displaySettings/analysisReportDisplayItemSettingsFlow';
import {
    assertShareEmailModalDisplaysRecipient,
    analysisReportShareEmailSubmitButton,
    expectAnalysisReportShareEmailModalDialog,
} from '../../../../../analysisReport/sharing/email/analysisReportShareEmailModal';
import { ANALYSIS_REPORT_SINGLE_TEST_IDS } from '../../../../../analysisReport/analysisReportTestIds';
import {
    GmailAuthError,
    preflightGmailApiReadAccess,
    setGmailClientOverride,
    setGmailPreflightOverride,
} from '../../../../../../utils/gmail';
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

test.afterEach(() => {
    setGmailPreflightOverride(null);
    setGmailClientOverride(null);
});

test('share email: Gmail preflight auth failure sends zero share_report requests (fixture)', async ({ page }) => {
    setGmailPreflightOverride(() =>
        Promise.reject(
            new GmailAuthError(
                'Gmail OAuth token refresh failed (invalid_grant). Reauthorize the test mailbox token.json before send.'
            )
        )
    );

    let shareReportPostCount = 0;
    await page.route(`${POST_SHARE_REPORT_EMAIL_URL}`, (route) => {
        if (route.request().method() === 'POST') {
            shareReportPostCount += 1;
        }
        route.abort();
    });

    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipient: ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`);
    await openAnalysisReportActionsMenu(page);
    await page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailOpen).click();
    const inner = await expectAnalysisReportShareEmailModalDialog(page);
    await assertShareEmailModalDisplaysRecipient(inner, ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT);

    await expect(preflightGmailApiReadAccess()).rejects.toThrow(/invalid_grant/i);

    const submit = analysisReportShareEmailSubmitButton(inner);
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
    expect(shareReportPostCount).toBe(0);
    expect(
        await page.evaluate(
            () => (window as unknown as { __arvShareEmailSendAttempted?: boolean }).__arvShareEmailSendAttempted
        )
    ).toBeFalsy();
});
