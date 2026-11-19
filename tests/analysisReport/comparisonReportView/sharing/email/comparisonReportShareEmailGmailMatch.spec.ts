import { test, expect } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER,
    assertAllowedAnalysisReportSharedComparisonReportUrl,
    buildEmailCandidateFromRecord,
    extractAnalysisReportSharedComparisonLinkFromEmailBody,
    isAnalysisReportShareComparisonEmailCandidate,
    parseAnalysisReportSharedComparisonUrlPair,
    waitForComparisonReportShareEmailMatch,
    type GmailMessageRecord,
} from '../../../../../utils/gmail';

const LEFT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0003';
const RIGHT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const WRONG_LEFT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

function msg(
    id: string,
    internalDate: number,
    headers: Array<{ name: string; value: string }>,
    htmlBody: string
): GmailMessageRecord {
    return {
        id,
        internalDate,
        headers,
        payload: {
            mimeType: 'text/html',
            body: { data: encodePayloadBody(htmlBody) },
        },
    };
}

test('extract comparison share link with left/right query params', () => {
    const sample = comparisonEmailHtml(LEFT_ID, RIGHT_ID);
    const link = extractAnalysisReportSharedComparisonLinkFromEmailBody(sample);
    expect(link).toBeTruthy();
    assertAllowedAnalysisReportSharedComparisonReportUrl(link!);
    const pair = parseAnalysisReportSharedComparisonUrlPair(link!);
    expect(pair.leftAnalysisId).toBe(LEFT_ID);
    expect(pair.rightAnalysisId).toBe(RIGHT_ID);
});

test('wrong comparison pair in link rejects candidate', () => {
    const candidate = buildEmailCandidateFromRecord({
        id: 'x',
        internalDate: Date.now(),
        headers: [{ name: 'Subject', value: ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER }],
        payload: {
            mimeType: 'text/html',
            body: { data: encodePayloadBody(comparisonEmailHtml(WRONG_LEFT, RIGHT_ID)) },
        },
    });
    expect(isAnalysisReportShareComparisonEmailCandidate(candidate, LEFT_ID, RIGHT_ID)).toBe(false);
});

test('waitForComparisonReportShareEmailMatch rejects stale internalDate', async () => {
    const recipient = 'fixture-recipient@example.com';
    const freshNotBefore = Date.now() - 60_000;
    const { setGmailClientOverride } = await import('../../../../../utils/gmail');
    setGmailClientOverride({
        listMessages: async () => [{ id: 'stale' }],
        getMessage: async () =>
            msg(
                'stale',
                freshNotBefore - 3600_000,
                [
                    { name: 'To', value: recipient },
                    { name: 'Subject', value: ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER },
                ],
                comparisonEmailHtml(LEFT_ID, RIGHT_ID)
            ),
    });
    try {
        await expect(
            waitForComparisonReportShareEmailMatch(
                recipient,
                LEFT_ID,
                RIGHT_ID,
                freshNotBefore,
                800,
                200
            )
        ).rejects.toThrow(/Timeout waiting for comparison share email/);
    } finally {
        setGmailClientOverride(null);
    }
});