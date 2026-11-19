import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
    validateSmokeResultsXml,
    resolveExpectedSmokeTests,
    validateAnalysisReportShareEmailSmokeJUnitSource,
} from './submitSmokeResults.mjs';
import { loadStagingSmokePartsXml, REPO_ROOT } from './testFixtures.mjs';

const RUN115 = loadStagingSmokePartsXml();

function extractSuiteBlock(xml, suiteName) {
    const re = new RegExp(`<testsuite name="${suiteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</testsuite>`);
    const match = xml.match(re);
    if (!match) {
        throw new Error(`missing suite ${suiteName}`);
    }
    return match[0];
}

function buildShareEmailJUnit(hostname = 'chromium') {
    return `<testsuites id="" name="" tests="1" failures="0" skipped="0" errors="0" time="12.5">
<testsuite name="analysisReport/sharing/email/analysisReportShareEmail.spec.ts" timestamp="2026-11-09T08:00:00.000Z" hostname="${hostname}" tests="1" failures="0" skipped="0" errors="0" time="12.5">
<testcase name="analysisReportShareEmailStandalone" classname="analysisReport/sharing/email/analysisReportShareEmail.spec.ts" time="12.5">
<system-out>ANALYSIS_REPORT_SHARE_EMAIL_VERIFIED {"overall":"Passed"}</system-out>
</testcase>
</testsuite>
</testsuites>`;
}

test('validateAnalysisReportShareEmailSmokeJUnitSource rejects fixture JUnit copied as smoke', () => {
    const fixtureXml = `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">
<testsuite name="e2e/fixtures/analysisReport/sharing/email/analysisReportShareEmail.fixture.spec.ts" hostname="chromium" tests="1" failures="0" skipped="0" errors="0" time="1">
<testcase name="share email: combined label/address block passes for correct recipient (fixture)" classname="e2e/fixtures/analysisReport/sharing/email/analysisReportShareEmail.fixture.spec.ts" time="1"/>
</testsuite>
</testsuites>`;
    assert.throws(() => validateAnalysisReportShareEmailSmokeJUnitSource(fixtureXml), /\.fixture\.spec\.ts/);
});

test('combineSmokeResults merges share-email JUnit with Part 1 and Part 2', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'combine-share-email-'));
    const part1Suite = extractSuiteBlock(RUN115, 'e2e/fullE2ESmokePart1.spec.ts');
    const part2Suite = extractSuiteBlock(RUN115, 'e2e/fullE2ESmokePart2.spec.ts');

    const part1Xml = `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">${part1Suite}</testsuites>`;
    const part2Xml = `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">${part2Suite}</testsuites>`;
    const shareXml = buildShareEmailJUnit('chromium');

    fs.writeFileSync(path.join(dir, 'results-part1.xml'), part1Xml, 'utf8');
    fs.writeFileSync(path.join(dir, 'results-part2.xml'), part2Xml, 'utf8');
    fs.writeFileSync(path.join(dir, 'results-analysisReportShareEmail.xml'), shareXml, 'utf8');

    const script = path.join(REPO_ROOT, 'scripts/combineSmokeResults.mjs');
    const run = spawnSync('node', [script, '--with-share-email'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '', SMOKE_RESULTS_ROOT: dir },
    });

    assert.equal(run.status, 0, run.stderr || run.stdout);
    const combined = fs.readFileSync(path.join(dir, 'results.xml'), 'utf8');
    const { counts } = validateSmokeResultsXml(combined);
    assert.equal(counts.tests, 3);
    assert.equal(resolveExpectedSmokeTests(combined).length, 3);
    assert.ok(combined.includes('analysisReportShareEmailStandalone'));
});
