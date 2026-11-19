import { test, expect, type BrowserContext } from '@playwright/test';
import { POST_SHARE_REPORT_EMAIL_URL } from '../../../../../../analysisReport/analysisReportTestIds';
import { ComparisonReportViewStageTracker } from '../../../../../../analysisReport/comparisonReportView/comparisonReportViewStageTracker';
import { runComparisonReportViewFlow } from '../../../../../../analysisReport/comparisonReportView/comparisonReportViewFlow';
import { ComparisonReportShareEmailFlowError } from '../../../../../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailErrors';
import { runComparisonReportShareEmailFromComparisonPage } from '../../../../../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailFlow';
import { ComparisonReportShareEmailStageTracker } from '../../../../../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailStageTracker';
import { AnalysisReportShareEmailSendGuard } from '../../../../../../analysisReport/sharing/email/analysisReportShareEmailFlow';
import {
    setGmailClientOverride,
    setGmailPreflightOverride,
    waitForComparisonReportShareEmailMatch,
    type GmailMessageRecord,
} from '../../../../../../../utils/gmail';
import {
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID,
    installComparisonReportShareEmailFixtureShell,
    loadGuestShellHtml,
} from './comparisonReportShareEmailFixtureShell';

const CUSTOMER_ID = COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID;
const ANALYSIS_ID = COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID;

test.describe.configure({ mode: 'serial', retries: 0 });

function encodePayloadBody(text: string): string {
    return Buffer.from(text, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function comparisonEmailHtml(left: string, right: string): string {
    return `<a href="https://app-stg.epose.com/shared-report-comparison?leftAnalysisId=${left}&rightAnalysisId=${right}&token=fixture-token">姿勢分析レポートはこちら</a>`;
}

function gmailRecord(
    id: string,
    internalDate: number,
    htmlBody: string
): GmailMessageRecord {
    return {
        id,
        internalDate,
        headers: [
            { name: 'To', value: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT },
            { name: 'Subject', value: '姿勢分析レポート' },
        ],
        payload: {
            mimeType: 'text/html',
            body: { data: encodePayloadBody(htmlBody) },
        },
    };
}

async function installGuestRoutes(
    context: BrowserContext,
    options?: { fetchFails?: boolean; wrongPair?: boolean }
): Promise<void> {
    await context.route('https://app-stg.epose.com/shared-report-comparison**', (route) => {
        route.fulfill({ contentType: 'text/html', body: loadGuestShellHtml() });
    });
    await context.route('**/fetch_shared_public_comparison_report**', (route) => {
        if (options?.fetchFails) {
            route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
            return;
        }
        const left = options?.wrongPair
            ? 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
            : COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID;
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    current: {
                        analysisId: left,
                        customerId: CUSTOMER_ID,
                        customer: { id: CUSTOMER_ID, fullName: 'Nikolas Fixture' },
                    },
                    latest: {
                        analysisId: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID,
                        customerId: CUSTOMER_ID,
                        customer: { id: CUSTOMER_ID, fullName: 'Nikolas Fixture' },
                    },
                },
            }),
        });
    });
}

async function reachComparisonAfterSwitch(page: import('@playwright/test').Page): Promise<void> {
    await installComparisonReportShareEmailFixtureShell(page, {
        recipientEmail: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
    });
    await page.goto(
        `${COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
    );
    const comparisonTracker = new ComparisonReportViewStageTracker();
    await runComparisonReportViewFlow(
        page,
        {
            customerId: CUSTOMER_ID,
            appOrigin: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN,
            sourceSingleReportAnalysisId: ANALYSIS_ID,
        },
        comparisonTracker
    );
    expect(comparisonTracker.outcome('terminalComparisonView')).toBe('Passed');
}

test.afterEach(() => {
    setGmailPreflightOverride(null);
    setGmailClientOverride(null);
});

test('comparison share email success → Gmail → guest comparison (fixture)', async ({ page, browser }) => {
    setGmailPreflightOverride(() => Promise.resolve());
    const notBefore = Date.now() - 1000;
    setGmailClientOverride({
        listMessages: async () => [{ id: 'fresh-email' }],
        getMessage: async () =>
            gmailRecord(
                'fresh-email',
                Date.now(),
                comparisonEmailHtml(
                    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID,
                    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID
                )
            ),
    });
    await page.route(POST_SHARE_REPORT_EMAIL_URL, (route) => {
        if (route.request().method() === 'POST') {
            route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
            return;
        }
        route.continue();
    });

    await reachComparisonAfterSwitch(page);
    const tracker = new ComparisonReportShareEmailStageTracker();
    const partial = await runComparisonReportShareEmailFromComparisonPage(
        page,
        browser,
        {
            customerId: CUSTOMER_ID,
            recipientEmail: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
            skipGmailPreflight: true,
            prepareGuestContext: (ctx) => installGuestRoutes(ctx),
        },
        tracker
    );
    expect(partial.sendAttemptedOnce).toBe(true);
    expect(partial.guestComparisonVerified).toBe(true);
    expect(tracker.outcome('comparisonPairPreserved')).toBe('Passed');

    await expect(
        waitForComparisonReportShareEmailMatch(
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID,
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID,
            notBefore,
            500,
            100
        )
    ).resolves.toBeTruthy();
});

test('stale comparison share email cannot satisfy wait', async () => {
    const staleBefore = Date.now();
    setGmailClientOverride({
        listMessages: async () => [{ id: 'stale' }],
        getMessage: async () =>
            gmailRecord(
                'stale',
                staleBefore - 3600_000,
                comparisonEmailHtml(
                    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID,
                    COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID
                )
            ),
    });
    await expect(
        waitForComparisonReportShareEmailMatch(
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID,
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID,
            staleBefore,
            800,
            200
        )
    ).rejects.toThrow(/Timeout waiting for comparison share email/);
});

test('wrong comparison pair in Gmail HTML is rejected by wait', async () => {
    setGmailClientOverride({
        listMessages: async () => [{ id: 'wrong-pair' }],
        getMessage: async () =>
            gmailRecord(
                'wrong-pair',
                Date.now(),
                comparisonEmailHtml('dddddddd-dddd-4ddd-8ddd-dddddddddddd', COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID)
            ),
    });
    await expect(
        waitForComparisonReportShareEmailMatch(
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID,
            COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID,
            Date.now() - 60_000,
            800,
            200
        )
    ).rejects.toThrow(/Timeout waiting for comparison share email/);
});

test('send failure does not trigger second submission (fixture)', async ({ page }) => {
  setGmailPreflightOverride(() => Promise.resolve());
  let postCount = 0;
  await page.route(POST_SHARE_REPORT_EMAIL_URL, (route) => {
    if (route.request().method() === 'POST') {
      postCount += 1;
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return;
    }
    route.continue();
  });

  await installComparisonReportShareEmailFixtureShell(page, {
    recipientEmail: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
  });
  await page.goto(
    `${COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/reports/${ANALYSIS_ID}`
  );
  const comparisonTracker = new ComparisonReportViewStageTracker();
  await runComparisonReportViewFlow(
    page,
    {
      customerId: CUSTOMER_ID,
      appOrigin: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN,
      sourceSingleReportAnalysisId: ANALYSIS_ID,
    },
    comparisonTracker
  );

  const tracker = new ComparisonReportShareEmailStageTracker();
  await expect(
    runComparisonReportShareEmailFromComparisonPage(
      page,
      page.context().browser()!,
      {
        customerId: CUSTOMER_ID,
        recipientEmail: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
        skipGmailPreflight: true,
      },
      tracker
    )
  ).rejects.toThrow();

  expect(postCount).toBe(1);
  expect(tracker.outcome('gmailMessageReceived')).toBe('Not reached');

  const guard = new AnalysisReportShareEmailSendGuard();
  guard.markSent();
  await expect(async () => guard.markSent()).rejects.toThrow(/already sent/);
});

test('guest failure closes context and surfaces guest error (fixture)', async ({ page, browser }) => {
  setGmailPreflightOverride(() => Promise.resolve());
  setGmailClientOverride({
    listMessages: async () => [{ id: 'guest-fail-msg' }],
    getMessage: async () =>
      gmailRecord(
        'guest-fail-msg',
        Date.now(),
        comparisonEmailHtml(
          COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID,
          COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID
        )
      ),
  });
  await page.route(POST_SHARE_REPORT_EMAIL_URL, (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    route.continue();
  });

  await reachComparisonAfterSwitch(page);
  const tracker = new ComparisonReportShareEmailStageTracker();
  let flowError: unknown;
  try {
    await runComparisonReportShareEmailFromComparisonPage(
      page,
      browser,
      {
        customerId: CUSTOMER_ID,
        recipientEmail: COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT,
        skipGmailPreflight: true,
        prepareGuestContext: (ctx) => installGuestRoutes(ctx, { fetchFails: true }),
      },
      tracker
    );
  } catch (error) {
    flowError = error;
  }
  expect(flowError).toBeTruthy();
  expect(flowError).toBeInstanceOf(ComparisonReportShareEmailFlowError);
  expect(tracker.outcome('sendSuccessConfirmation')).toBe('Passed');
  expect(tracker.outcome('guestComparisonReady')).toBe('Failed');
  expect(tracker.outcome('comparisonPairPreserved')).toBe('Not reached');
  expect(browser.contexts()).toHaveLength(1);
});