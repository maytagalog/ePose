import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_CTA_LABEL,
    ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER,
    assertAllowedAnalysisReportSharedReportUrl,
    buildEmailCandidateFromRecord,
    diagnoseAnalysisReportShareEmailRecord,
    extractAnalysisReportSharedLinkFromEmailBody,
    inspectAnalysisReportShareEmailCta,
    isAnalysisReportShareEmailCandidate,
    parseAnalysisReportSharedUrlReportId,
} from '../../../../utils/gmail';
import { ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID } from './analysisReportShareEmailSmokeConfig';

const fixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../e2e/fixtures/analysisReport/sharing/email'
);
const RECEIVED_HTML = fs.readFileSync(
    path.join(fixturesDir, 'analysisReportShareEmailReceivedMessage.html'),
    'utf8'
);
const FIXTURE_ANALYSIS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SEND_CUTOFF_MS = Date.parse('2026-11-09T08:36:58.313Z');

test('staging share email subject contains marker', () => {
    expect('姿勢分析レポート').toContain(ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER);
});

test('received HTML exposes CTA 姿勢分析レポートはこちら with shared-report href', () => {
    const cta = inspectAnalysisReportShareEmailCta(RECEIVED_HTML);
    expect(cta.ctaLabelFound).toBe(true);
    expect(cta.hrefFromCta).toMatch(/\/shared-report\?/);
    expect(cta.hrefFromCta).toContain('reportId=');
    expect(cta.hrefFromCta).toContain('token=');
});

test('extract link accepts reportId before token query ordering', () => {
    const sample = `<a href="https://app-stg.epose.com/shared-report?reportId=${FIXTURE_ANALYSIS_ID}&token=fixture-token">姿勢分析レポートはこちら</a>`;
    const link = extractAnalysisReportSharedLinkFromEmailBody(sample);
    expect(link).toBe(
        `https://app-stg.epose.com/shared-report?reportId=${FIXTURE_ANALYSIS_ID}&token=fixture-token`
    );
    assertAllowedAnalysisReportSharedReportUrl(link!);
    expect(parseAnalysisReportSharedUrlReportId(link!)).toBe(FIXTURE_ANALYSIS_ID);
});

test('fixture received message matches with freshness and reportId', () => {
    const link = extractAnalysisReportSharedLinkFromEmailBody(RECEIVED_HTML);
    expect(link).toBeTruthy();
    expect(parseAnalysisReportSharedUrlReportId(link!)).toBe(FIXTURE_ANALYSIS_ID);

    const record = {
        id: 'fixture-msg',
        internalDate: Date.parse('2026-11-09T08:37:02.000Z'),
        headers: [
            { name: 'Subject', value: '姿勢分析レポート' },
            { name: 'To', value: 'fixture-recipient@example.com' },
        ],
        payload: {
            mimeType: 'text/html',
            body: { data: '' },
            parts: [
                {
                    mimeType: 'text/html',
                    body: {
                        data: Buffer.from(RECEIVED_HTML, 'utf8')
                            .toString('base64')
                            .replace(/\+/g, '-')
                            .replace(/\//g, '_')
                            .replace(/=+$/, ''),
                    },
                },
            ],
        },
    };
    const candidate = buildEmailCandidateFromRecord(record);
    expect(candidate.rawPlainBody).toBe('');
    expect(isAnalysisReportShareEmailCandidate(candidate, FIXTURE_ANALYSIS_ID)).toBe(true);

    const diagnosis = diagnoseAnalysisReportShareEmailRecord(
        record,
        'fixture-recipient@example.com',
        FIXTURE_ANALYSIS_ID,
        SEND_CUTOFF_MS
    );
    expect(diagnosis.wouldMatch).toBe(true);
    expect(diagnosis.rejectionReasons).not.toContain('url_pattern_no_match');
});

test('wrong reportId in link rejects candidate', () => {
    const html = RECEIVED_HTML.replace(FIXTURE_ANALYSIS_ID, ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID);
    const candidate = buildEmailCandidateFromRecord({
        id: 'x',
        internalDate: SEND_CUTOFF_MS + 1000,
        headers: [{ name: 'Subject', value: '姿勢分析レポート' }],
        payload: {
            mimeType: 'text/html',
            body: {
                data: Buffer.from(html, 'utf8')
                    .toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/, ''),
            },
        },
    });
    expect(
        isAnalysisReportShareEmailCandidate(candidate, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    ).toBe(false);
});
