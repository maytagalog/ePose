#!/usr/bin/env node
/** One-off export: sanitized HTML fixture from latest staging share email (tokens redacted). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER,
    buildEmailCandidateFromRecord,
    fetchMessageRecords,
} from '../utils/gmail';

const RECIPIENT = 'aardvarkomonstrosesquip1230000@gmail.com';

async function main() {
    const records = await fetchMessageRecords(RECIPIENT, ANALYSIS_REPORT_SHARE_EMAIL_SUBJECT_MARKER);
    const newest = [...records].sort((a, b) => b.internalDate - a.internalDate)[0];
    if (!newest) {
        throw new Error('No share email messages found');
    }
    const candidate = buildEmailCandidateFromRecord(newest);
    const sanitized = candidate.body
        .replace(/token=([A-Za-z0-9._-]+)/gi, 'token=[redacted-fixture]')
        .replace(/reportId=a871ea8f-c5e8-4fbd-b933-75fe8e2a144f/g, 'reportId=cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    const fixturesDir = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '../tests/e2e/fixtures/analysisReport/sharing/email'
    );
    const outPath = path.join(fixturesDir, 'analysisReportShareEmailReceivedMessage.html');
    const header = `<!-- Sanitized from staging share email; subject: ${candidate.subject} -->\n`;
    fs.writeFileSync(outPath, header + sanitized, 'utf8');
    console.log(JSON.stringify({ outPath, subject: candidate.subject, bytes: sanitized.length }));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
