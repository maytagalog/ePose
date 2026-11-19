import { test, expect } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_SUCCESS_TOAST,
    ANALYSIS_REPORT_SINGLE_TEST_IDS,
    POST_SHARE_REPORT_EMAIL_URL,
} from '../../../analysisReport/analysisReportTestIds';
import {
    runAnalysisReportShareEmailUiSendConfirmation,
    AnalysisReportShareEmailSendGuard,
} from '../../../analysisReport/sharing/email/analysisReportShareEmailFlow';
import {
    assertShareEmailModalDisplaysRecipient,
    expectAnalysisReportShareEmailModalDialog,
} from '../../../analysisReport/sharing/email/analysisReportShareEmailModal';
import {
    installAnalysisReportShareEmailFixtureShell,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
} from '../analysisReport/sharing/email/analysisReportShareEmailFixtureShell';
import { setGmailPreflightOverride } from '../../../../utils/gmail';
import {
    installComparisonReportShareEmailFixtureShell,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
} from '../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailFixtureShell';
import { runComparisonReportShareEmailFromComparisonPage } from '../../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailFlow';
import { ComparisonReportShareEmailStageTracker } from '../../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailStageTracker';

test.describe.configure({ retries: 0 });

async function stubShareReportPost(page: import('@playwright/test').Page): Promise<void> {
    await page.route(`${POST_SHARE_REPORT_EMAIL_URL}**`, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
}

test.afterEach(() => {
    setGmailPreflightOverride(null);
});

test('Part 2 analysis share email UI mode: success toast passes without Gmail preflight', async ({
    page,
    browser,
}) => {
    let gmailPreflightCalls = 0;
    setGmailPreflightOverride(async () => {
        gmailPreflightCalls += 1;
    });

    const newContextCalls: number[] = [];
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = ((...args: Parameters<typeof browser.newContext>) => {
        newContextCalls.push(1);
        return originalNewContext(...args);
    }) as typeof browser.newContext;

    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipient: ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await stubShareReportPost(page);
    await page.goto(`${ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/report`);

    const guard = new AnalysisReportShareEmailSendGuard();
    const result = await runAnalysisReportShareEmailUiSendConfirmation(
        page,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
        guard,
        { requireShareReportHttpResponse: false }
    );

    expect(result.sendSuccessToastVerified).toBe(true);
    expect(gmailPreflightCalls).toBe(0);
    expect(newContextCalls).toHaveLength(0);
    await expect(page.getByTestId(ANALYSIS_REPORT_SINGLE_TEST_IDS.shareEmailSuccess)).toContainText(
        ANALYSIS_REPORT_SHARE_EMAIL_SUCCESS_TOAST
    );
});

test('Part 2 analysis share email UI mode: missing toast fails', async ({ page }) => {
    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipient: ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
        __arvShareEmailSuppressSuccessToast: true,
    });
    await stubShareReportPost(page);
    await page.goto(`${ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/report`);

    const guard = new AnalysisReportShareEmailSendGuard();
    await expect(
        runAnalysisReportShareEmailUiSendConfirmation(
            page,
            ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
            ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
            ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
            guard,
            { requireShareReportHttpResponse: false }
        )
    ).rejects.toThrow();
});

test('Part 2 analysis share email UI mode: success toast passes without captured share_report response', async ({
    page,
}) => {
    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipient: ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await page.route(`${POST_SHARE_REPORT_EMAIL_URL}**`, (route) => route.abort('failed'));
    await page.goto(`${ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/report`);

    const guard = new AnalysisReportShareEmailSendGuard();
    const result = await runAnalysisReportShareEmailUiSendConfirmation(
        page,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
        guard,
        { requireShareReportHttpResponse: false }
    );

    expect(result.sendSuccessToastVerified).toBe(true);
});

test('Part 2 analysis share email UI mode: second send click is rejected', async ({ page }) => {
    await installAnalysisReportShareEmailFixtureShell(page, {
        __arvShareEmailRecipient: ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await stubShareReportPost(page);
    await page.goto(`${ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/report`);
    const guard = new AnalysisReportShareEmailSendGuard();
    await runAnalysisReportShareEmailUiSendConfirmation(
        page,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
        guard,
        { requireShareReportHttpResponse: false }
    );
    await expect(
        runAnalysisReportShareEmailUiSendConfirmation(
            page,
            ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
            ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
            ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
            guard,
            { requireShareReportHttpResponse: false }
        )
    ).rejects.toThrow(/already sent/i);
});

test('Part 2 comparison share email UI mode: no Gmail or guest context', async ({ page, browser }) => {
    let gmailPreflightCalls = 0;
    setGmailPreflightOverride(async () => {
        gmailPreflightCalls += 1;
    });

    const newContextCalls: number[] = [];
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = ((...args: Parameters<typeof browser.newContext>) => {
        newContextCalls.push(1);
        return originalNewContext(...args);
    }) as typeof browser.newContext;

    await installComparisonReportShareEmailFixtureShell(page, {
        recipientEmail: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await stubShareReportPost(page);
    await page.goto(`${COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/comparison`);
    await page.getByTestId('analysis-report-compare-open').click();

    const tracker = new ComparisonReportShareEmailStageTracker();
    const partial = await runComparisonReportShareEmailFromComparisonPage(
        page,
        browser,
        {
            customerId: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
            recipientEmail: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
            validationMode: 'ui-send-confirmation',
        },
        tracker
    );

    expect(partial.sendSuccessToastVerified).toBe(true);
    expect(partial.gmailMessageId).toBeNull();
    expect(partial.guestComparisonVerified).toBe(false);
    expect(tracker.outcome('gmailMessageReceived')).toBe('Skipped');
    expect(gmailPreflightCalls).toBe(0);
    expect(newContextCalls).toHaveLength(0);
});