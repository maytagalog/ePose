#!/usr/bin/env node
/**
 * Read-only: inspect Analysis Report share email in Gmail (no send).
 * Prints sanitized diagnostics only (tokens redacted).
 */
import {
    ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER,
    buildEmailCandidateFromRecord,
    diagnoseAnalysisReportShareEmailRecord,
    fetchMessageRecords,
    redactSharedReportUrlForDiagnostics,
} from '../utils/gmail';

const RECIPIENT =
    process.env.ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT?.trim() ||
    'aardvarkomonstrosesquip1230000@gmail.com';
const ANALYSIS_ID =
    process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID?.trim() ||
    'a871ea8f-c5e8-4fbd-b933-75fe8e2a144f';
const NOT_BEFORE_MS = process.env.NOT_BEFORE_EPOCH_MS
    ? Number(process.env.NOT_BEFORE_EPOCH_MS)
    : Date.parse('2026-11-09T08:36:00.000Z');

async function main() {
    let recordsList;
    try {
        recordsList = await fetchMessageRecords(
            RECIPIENT,
            ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER
        );
    } catch (error) {
        console.error(
            JSON.stringify({
                error: 'gmail_fetch_failed',
                message: error instanceof Error ? error.message : String(error),
            })
        );
        process.exit(1);
    }

    const output = {
        recipient: RECIPIENT,
        analysisId: ANALYSIS_ID,
        notBeforeIso: new Date(NOT_BEFORE_MS).toISOString(),
        subjectMarker: ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER,
        messageCount: recordsList.length,
        messages: recordsList.map((record) => {
            const candidate = buildEmailCandidateFromRecord(record);
            const diagnosis = diagnoseAnalysisReportShareEmailRecord(
                record,
                RECIPIENT,
                ANALYSIS_ID,
                NOT_BEFORE_MS
            );
            return {
                id: record.id,
                internalDateIso: new Date(record.internalDate).toISOString(),
                subject: candidate.subject,
                diagnosis: diagnosis.rejectionReasons,
                wouldMatch: diagnosis.wouldMatch,
                ctaLabelFound: diagnosis.ctaInspection.ctaLabelFound,
                hrefFromCta: diagnosis.ctaInspection.hrefFromCta
                    ? redactSharedReportUrlForDiagnostics(diagnosis.ctaInspection.hrefFromCta)
                    : null,
                extractedLink: diagnosis.extractedLink
                    ? redactSharedReportUrlForDiagnostics(diagnosis.extractedLink)
                    : null,
                htmlLength: candidate.body.length,
                plainLength: candidate.rawPlainBody.length,
            };
        }),
    };

    console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({ error: 'inspect_failed', message: String(error) }));
    process.exit(1);
});
