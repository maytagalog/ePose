import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    completeSharedReportGuestVerification,
    isFetchSharedReportResponse,
    SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
} from '../../../../../analysisReport/sharing/email/analysisReportSharedReportVerification';
import {
    assertAllowedAnalysisReportSharedReportUrl,
    extractAnalysisReportSharedLinkFromEmailBody,
} from '../../../../../../utils/gmail';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
} from './analysisReportShareEmailFixtureShell';
import {
    installSharedReportScrollFixture,
    SHARED_REPORT_SCROLL_FIXTURE_CUSTOMER_NAME,
    SHARED_REPORT_SCROLL_FIXTURE_ORIGIN,
} from './sharedReportScrollFixtureShell';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(fixturesDir, 'analysisReportShareEmailReceivedMessage.html'), 'utf8');
test('received email HTML yields allowed staging shared-report link (fixture)', () => {
    const link = extractAnalysisReportSharedLinkFromEmailBody(HTML);
    expect(link).toBeTruthy();
    assertAllowedAnalysisReportSharedReportUrl(link!);
    expect(link!).toContain('/shared-report?');
    expect(link!).toContain('reportId=');
});

test('shared-report URL opens fixture identity with guest scroll verification (fixture)', async ({
    page,
}) => {
    const extracted = extractAnalysisReportSharedLinkFromEmailBody(HTML)!;
    const fixtureUrl = new URL(extracted);
    fixtureUrl.protocol = new URL(SHARED_REPORT_SCROLL_FIXTURE_ORIGIN).protocol;
    fixtureUrl.host = new URL(SHARED_REPORT_SCROLL_FIXTURE_ORIGIN).host;

    await installSharedReportScrollFixture(page, {
        scrollMode: 'normal',
        customerName: SHARED_REPORT_SCROLL_FIXTURE_CUSTOMER_NAME,
    });

    const fetchPromise = page.waitForResponse(isFetchSharedReportResponse, {
        timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
    });
    await page.goto(fixtureUrl.toString(), { waitUntil: 'domcontentloaded' });
    await completeSharedReportGuestVerification(
        page,
        fetchPromise,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
        ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID
    );
});
