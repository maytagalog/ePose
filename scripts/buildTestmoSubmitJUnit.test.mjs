import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    buildTestmoSubmitJUnit,
    extractPart2FeatureCases,
    validateTestmoSubmitXml,
} from './buildTestmoSubmitJUnit.mjs';
import { parseTestsuitesRoot, recomputeJUnitCounts, splitTopLevelTestsuites } from './junitCounts.mjs';
import { buildPart2CoverageFromSystemOut } from './part2TestmoCoverageFromEvents.mjs';
import { validateSmokeResultsXml } from './submitSmokeResults.mjs';
import {
    FIXTURE_PART2_BOUNDED_MARKUP,
    FIXTURE_PART2_DERIVED_ENRICHED,
    fixturePath,
    loadFixtureText,
    loadStagingSmokePartsXml,
    REPO_ROOT,
} from './testFixtures.mjs';

const RUN115 = loadStagingSmokePartsXml();
const DERIVED_PART2_FIXTURE = fixturePath(FIXTURE_PART2_DERIVED_ENRICHED);

const SYNTHETIC_PART2_SYSTEM = `PART2_RUN_COMPLETED {"featureOutcomes":{"login":"passed","limitDialog":"passed","cirsRecordNavigation":"failed","cirsResponseDetails":"not_reached","cirsHandwrittenNotes":"not_reached","cirsTakeoverHandover":"not_reached","cirsPostureAnalysis":"not_reached","analysisReport":"not_reached","logout":"not_reached"},"failureReason":"CIRS preview mismatch"}
PART2_RUN_FAILED {"featureOutcomes":{"login":"passed","limitDialog":"passed","cirsRecordNavigation":"failed","cirsResponseDetails":"not_reached","cirsHandwrittenNotes":"not_reached","cirsTakeoverHandover":"not_reached","cirsPostureAnalysis":"not_reached","analysisReport":"not_reached","logout":"not_reached"},"failureReason":"CIRS preview mismatch"}`;

function withPart2SystemOut(baseXml, systemOut) {
    const wrapped = `<system-out><![CDATA[${systemOut}]]></system-out>`;
    if (baseXml.includes('<system-out>')) {
        return baseXml.replace(/<system-out>[\s\S]*?<\/system-out>/, wrapped);
    }
    return baseXml.replace(
        '</testcase>\n</testsuite>\n</testsuites>',
        `${wrapped}\n</testcase>\n</testsuite>\n</testsuites>`
    );
}

test('buildPart2 coverage: CIRS fail leaves Analysis Report Not reached', () => {
    const coverage = buildPart2CoverageFromSystemOut(SYNTHETIC_PART2_SYSTEM);
    const ar = coverage.cases.filter((c) => c.key.startsWith('analysisReport'));
    assert.ok(ar.every((c) => c.status === 'Skipped'));
    assert.ok(ar.every((c) => c.outcomeDetail.includes('Not reached')));
});

test('buildPart2 coverage: later AR fail keeps earlier AR Passed', () => {
    const systemOut = `PART2_RUN_FAILED {"failureReason":"share email timeout","featureOutcomes":{"login":"passed","limitDialog":"passed","cirsRecordNavigation":"passed","cirsResponseDetails":"passed","cirsHandwrittenNotes":"passed","cirsTakeoverHandover":"passed","cirsPostureAnalysis":"passed","analysisReport":"failed","logout":"not_reached"}}
PART2_ANALYSIS_REPORT_VERIFIED {"deletionMode":"off","combinedPassed":false,"runOutputRoot":"test-output/analysisReportFull/demo-fail","featureStages":{"login":"Skipped","preflight":"Passed","reportView":"Passed","displaySettings":"Passed","shareQr":"Passed","shareEmail":"Failed","reportPdf":"Not reached","reportHistory":"Not reached","reportDeletion":"Skipped"}}`;
    const coverage = buildPart2CoverageFromSystemOut(systemOut);
    assert.equal(coverage.cases.find((c) => c.key === 'analysisReportDisplaySettings')?.status, 'Passed');
    assert.equal(coverage.cases.find((c) => c.key === 'analysisReportShareEmail')?.status, 'Failed');
    assert.match(
        coverage.cases.find((c) => c.key === 'analysisReportPdf')?.outcomeDetail ?? '',
        /Not reached/
    );
});

test('recomputeJUnitCounts sets skipped count from testcase elements', () => {
    const xml = `<testsuites tests="1" failures="0" skipped="0" errors="0" time="0">
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" tests="1" failures="0" skipped="0" errors="0" time="0">
<testcase name="a" time="0"><skipped/></testcase>
<testcase name="b" time="0"><skipped/></testcase>
</testsuite>
</testsuites>`;
    const next = recomputeJUnitCounts(xml);
    assert.match(next, /skipped="2"/);
});

test('stale Oct aggregate is replaced when SMOKE_PART2_JUNIT_SOURCE is set', () => {
    process.env.SMOKE_PART2_JUNIT_SOURCE = DERIVED_PART2_FIXTURE;
    try {
        const built = buildTestmoSubmitJUnit(RUN115, { repoRoot: REPO_ROOT });
        assert.ok(built.preview.part2Source.replacedStaleCombinedSuite);
        assert.match(built.xml, /timestamp="2026-11-13T15:51:02.037Z"/);
        assert.doesNotMatch(built.xml, /deferredCoverage.*CIRS.*Analysis Report/);
        const cirsNav = built.preview.featureCases.find(
            (c) => c.automationKey === 'part2-smoke-cirs-record-navigation'
        );
        assert.equal(cirsNav?.status, 'Passed');
        assert.match(cirsNav?.outcomeDetail ?? '', /Required verifications completed/);
        const validation = validateTestmoSubmitXml(built.xml);
        assert.ok(validation.part2FeatureCount >= 16);
        assert.ok((built.xml.match(/<skipped\b/g) ?? []).length >= 2);
    } finally {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    }
});

test('rejects mixed provenance without SMOKE_PART2_JUNIT_SOURCE', () => {
    delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    assert.throws(
        () =>
            buildTestmoSubmitJUnit(RUN115, {
                repoRoot: REPO_ROOT,
                part2SourcePath: DERIVED_PART2_FIXTURE,
            }),
        /provenance mismatch/
    );
});

test('rebuilding enriched JUnit replaces prior feature cases without duplicates', () => {
    process.env.SMOKE_PART2_JUNIT_SOURCE = DERIVED_PART2_FIXTURE;
    try {
        const first = buildTestmoSubmitJUnit(RUN115, { repoRoot: REPO_ROOT });
        const second = buildTestmoSubmitJUnit(first.xml, { repoRoot: REPO_ROOT });
        const validation = validateTestmoSubmitXml(second.xml);
        assert.ok(validation.part2FeatureCount >= 16);
        const loginFeatures = extractPart2FeatureCases(second.xml).filter(
            (c) => c.name === 'part2-smoke-login'
        );
        assert.equal(loginFeatures.length, 1);
        assert.ok(second.replacedFeatureCount >= 16);
    } finally {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    }
});

test('enriched JUnit injects feature cases without duplicate automation keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testmo-enrich-'));
    const combined = withPart2SystemOut(RUN115, SYNTHETIC_PART2_SYSTEM);
    const part2Path = path.join(dir, 'results-part2.xml');
    const part2Only = combined.match(/<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts"[\s\S]*<\/testsuite>/)?.[0];
    fs.writeFileSync(
        part2Path,
        `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1"><testsuite name="e2e/fullE2ESmokePart2.spec.ts" hostname="chromium" tests="1" failures="0" skipped="0" errors="0" time="1">${part2Only?.match(/<testcase[\s\S]*<\/testcase>/)?.[0] ?? ''}</testsuite></testsuites>`
    );
    validateSmokeResultsXml(combined);
    process.env.SMOKE_PART2_JUNIT_SOURCE = part2Path;
    let built;
    try {
        built = buildTestmoSubmitJUnit(combined, { repoRoot: REPO_ROOT });
    } finally {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    }
    assert.equal(built.enriched, true);
    const validation = validateTestmoSubmitXml(built.xml);
    assert.ok(validation.featureCount >= 15);
    assert.doesNotMatch(built.xml, /name="fullE2ESmokePart2"/);
    const deletion = built.part2Coverage?.cases?.find((c) => c.key === 'analysisReportDeletion');
    assert.equal(deletion?.status, 'Skipped');
});

test('enrichment stays bounded when Part 2 system-out contains inline testsuite-like markup', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testmo-bounded-'));
    const combined = RUN115;
    const markup = loadFixtureText(FIXTURE_PART2_BOUNDED_MARKUP);
    const part2Suite = combined.match(/<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts"[\s\S]*?<\/testsuite>/)?.[0];
    const part2Testcase = part2Suite?.replace(
        /<system-out>[\s\S]*?<\/system-out>/,
        `<system-out><![CDATA[${markup}]]></system-out>`
    ) ?? '';
    const part2Path = path.join(dir, 'results-part2.xml');
    fs.writeFileSync(
        part2Path,
        `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">${part2Testcase}</testsuites>`
    );
    process.env.SMOKE_PART2_JUNIT_SOURCE = part2Path;
    try {
        const built = buildTestmoSubmitJUnit(combined, { repoRoot: dir, part2SourcePath: part2Path });
        assert.ok(built.enriched);
        assert.ok(built.xml.length < 2_000_000, `output too large (${built.xml.length} bytes)`);
        const root = parseTestsuitesRoot(built.xml);
        assert.ok(root);
        assert.ok(splitTopLevelTestsuites(root.inner).length >= 1);
        const validation = validateTestmoSubmitXml(built.xml);
        assert.equal(
            validation.totalUploadedTestcases,
            validation.part1FeatureCount + validation.part2FeatureCount
        );
    } finally {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    }
});
