import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
    extractPart2TestcaseSystemOut,
    parsePart2TestmoCoverageFromSystemOut,
    writePart2TestmoSidecar,
} from './part2TestmoReporting.mjs';
import { resolvePart2ArtifactManifest } from './part2TestmoArtifacts.mjs';
import { validateSmokeResultsXml } from './submitSmokeResults.mjs';
import { loadStagingSmokePartsXml } from './testFixtures.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('extractPart2TestmoCoverage from synthetic system-out', () => {
    const xml = `<testsuites tests="1"><testsuite name="e2e/fullE2ESmokePart2.spec.ts"><testcase name="fullE2ESmokePart2"><system-out><![CDATA[
PART2_TESTMO_COVERAGE {"schemaVersion":2,"smokePart":2,"cases":[{"key":"login","status":"Passed"}]}
PART2_ANALYSIS_REPORT_VERIFIED {"runOutputRoot":"test-output/analysisReportFull/demo"}
]]></system-out></testcase></testsuite></testsuites>`;
    const out = extractPart2TestcaseSystemOut(xml);
    const coverage = parsePart2TestmoCoverageFromSystemOut(out);
    assert.equal(coverage.schemaVersion, 2);
    assert.equal(coverage.cases[0].key, 'login');
});

test('resolvePart2ArtifactManifest rejects runId mismatch', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'part2-artifact-'));
    const runRoot = path.join(dir, 'test-output/analysisReportFull/run-a');
    fs.mkdirSync(runRoot, { recursive: true });
    const jsonPath = path.join(runRoot, 'analysis-report-full-smoke.json');
    fs.writeFileSync(jsonPath, '{}', 'utf8');

    const manifest = resolvePart2ArtifactManifest({
        repoRoot: dir,
        runIdentity: { runId: 'other-run-id', runOutputRoot: 'test-output/analysisReportFull/run-b' },
        junitAttachmentLines: ['test-output/analysisReportFull/run-a/analysis-report-full-smoke.json'],
    });
    const smoke = manifest.find((m) => m.relativePath.endsWith('analysis-report-full-smoke.json'));
    assert.equal(smoke?.included, false);
    assert.match(smoke?.reason ?? '', /runId mismatch/i);
});

test('writePart2TestmoSidecar writes results-part2-testmo.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'part2-sidecar-'));
    const xml = `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" hostname="chromium" tests="1" failures="0" skipped="0" errors="0" time="1">
<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="1">
<system-out><![CDATA[PART2_TESTMO_COVERAGE {"schemaVersion":2,"smokePart":2,"cases":[]}]]></system-out>
</testcase>
</testsuite>
</testsuites>`;
    const resultsPath = path.join(dir, 'results-part2.xml');
    fs.writeFileSync(resultsPath, xml, 'utf8');
    const { outPath } = writePart2TestmoSidecar(resultsPath, { repoRoot: dir });
    assert.ok(fs.existsSync(outPath));
});

test('combine still validates two-testcase smoke when part2 has TESTMO line', () => {
    const combined = loadStagingSmokePartsXml();
    const { counts } = validateSmokeResultsXml(combined);
    assert.equal(counts.tests, 2);
});
