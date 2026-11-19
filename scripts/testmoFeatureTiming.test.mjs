import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildTestmoSubmitJUnit } from './buildTestmoSubmitJUnit.mjs';
import { buildPart1TestmoCoverageFromEvents } from './part1TestmoCoverageFromEvents.mjs';
import { buildPart2CoverageFromSystemOut } from './part2TestmoCoverageFromEvents.mjs';
import { extractPart2TestcaseSystemOut } from './part2TestmoReporting.mjs';
import {
    enrichPart2CaseDurations,
    msToDurationSeconds,
    parseAnalysisReportStageTimingsMs,
} from './testmoFeatureTiming.mjs';
import { FIXTURE_PART2_DERIVED_ENRICHED, fixturePath } from './testFixtures.mjs';

test('msToDurationSeconds rounds to three decimal places', () => {
    assert.equal(msToDurationSeconds(1500), 1.5);
    assert.equal(msToDurationSeconds(60673), 60.673);
    assert.equal(msToDurationSeconds(0), 0);
    assert.equal(msToDurationSeconds(-1), 0);
});

test('parseAnalysisReportStageTimingsMs maps exit lines to Part 2 case keys', () => {
    const systemOut = `
ANALYSIS_REPORT_FULL_SMOKE:reportView:exit {"stage":"reportView","event":"exit","elapsedMs":60673}
ANALYSIS_REPORT_FULL_SMOKE:displaySettings:exit {"stage":"displaySettings","event":"exit","elapsedMs":15178}
ANALYSIS_REPORT_FULL_SMOKE:reportPdf:fail {"stage":"reportPdf","event":"fail","elapsedMs":3200}
`;
    const parsed = parseAnalysisReportStageTimingsMs(systemOut);
    assert.equal(parsed.analysisReportView, 60673);
    assert.equal(parsed.analysisReportDisplaySettings, 15178);
    assert.equal(parsed.analysisReportPdf, 3200);
});

test('enrichPart2CaseDurations prefers explicit caseDurationsMs over console', () => {
    const cases = [
        {
            key: 'login',
            automationKey: 'part2-smoke-login',
            title: 'Login',
            status: 'Passed',
            outcomeDetail: 'ok',
            durationSeconds: 0,
        },
    ];
    const enriched = enrichPart2CaseDurations(cases, {
        caseDurationsMs: { login: 4200 },
        systemOut: 'ANALYSIS_REPORT_FULL_SMOKE:reportView:exit {"stage":"reportView","event":"exit","elapsedMs":99999}',
    });
    assert.equal(enriched[0].durationSeconds, 4.2);
});

test('buildPart1TestmoCoverageFromEvents records failure duration from caseDurationsMs', () => {
    const report = buildPart1TestmoCoverageFromEvents({
        featureOutcomes: { accountRegistration: 'failed' },
        caseDurationsMs: { accountRegistration: 2500 },
        failureReason: 'boom',
        events: {},
    });
    const row = report.cases.find((c) => c.key === 'accountRegistration');
    assert.equal(row.status, 'Failed');
    assert.equal(row.durationSeconds, 2.5);
});

test('buildPart2CoverageFromSystemOut applies Analysis Report stage timings from console', () => {
    const part2Path = fixturePath(FIXTURE_PART2_DERIVED_ENRICHED);
    const xml = fs.readFileSync(part2Path, 'utf8');
    const suite = xml.match(/<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts"[\s\S]*<\/testsuite>/)?.[0];
    assert.ok(suite);
    const systemOut = extractPart2TestcaseSystemOut(suite);
    const coverage = buildPart2CoverageFromSystemOut(systemOut);
    assert.ok(coverage);
    const view = coverage.cases.find((c) => c.key === 'analysisReportView');
    assert.ok(view);
    assert.equal(view.durationSeconds, 60.673);
    const login = coverage.cases.find((c) => c.key === 'login');
    assert.equal(login?.durationSeconds ?? 0, 0);
});

test('JUnit feature testcase time reflects durationSeconds', () => {
    const combined = `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" hostname="chromium" tests="1" failures="0" skipped="0" errors="0" time="1" timestamp="2026-11-17T10:39:07.566Z">
<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="1">
<system-out><![CDATA[
PART2_RUN_COMPLETED {"featureOutcomes":{"login":"passed","limitDialog":"passed","cirsRecordNavigation":"passed","cirsResponseDetails":"passed","cirsHandwrittenNotes":"passed","cirsTakeoverHandover":"passed","cirsPostureAnalysis":"passed","analysisReport":"passed","comparisonReport":"passed","logout":"passed"}}
ANALYSIS_REPORT_FULL_SMOKE:reportView:exit {"stage":"reportView","event":"exit","elapsedMs":10000}
PART2_ANALYSIS_REPORT_VERIFIED {"featureStages":{"login":"Skipped","preflight":"Passed","reportView":"Passed","displaySettings":"Passed","shareQr":"Passed","shareEmail":"Passed","reportPdf":"Skipped","reportHistory":"Passed","reportDeletion":"Skipped"},"deletionMode":"off","combinedPassed":true,"runOutputRoot":"test-output/x"}
PART2_COMPARISON_REPORT_VERIFIED {"featureStages":{"customersNavigation":"Passed","singleReportEntry":"Passed","comparisonView":"Passed","comparisonShareQr":"Passed","comparisonShareEmail":"Passed","comparisonReportPdf":"Passed","exitComparison":"Passed"},"combinedPassed":true,"runOutputRoot":"test-output/y"}
]]></system-out>
</testcase>
</testsuite>
</testsuites>`;
    const built = buildTestmoSubmitJUnit(combined, { repoRoot: path.resolve(import.meta.dirname, '..') });
    const viewCase = built.xml.match(
        /<testcase\b[^>]*name="part2-smoke-analysis-report-view"[^>]*time="([^"]*)"/
    );
    assert.ok(viewCase);
    assert.equal(viewCase[1], '10');
});