import assert from 'node:assert/strict';
import test from 'node:test';
import {
    computeSmokeTimingSummary,
    detectSmokeExecutionMode,
    EXECUTION_MODE_PARALLEL,
    EXECUTION_MODE_SEQUENTIAL,
    sumFeatureTimesBySuite,
} from './testmoSmokeRunTiming.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { buildTestmoSubmitJUnit, validateTestmoSubmitXml } from './buildTestmoSubmitJUnit.mjs';
import {
    FIXTURE_PARALLEL_SMOKE_AGGREGATE,
    FIXTURE_PART2_DERIVED_ENRICHED,
    fixturePath,
    loadFixtureText,
    writeFixturePartFiles,
} from './testFixtures.mjs';
import { injectPart1TestmoCoverageFromFortyOne } from './testFixtureHelpers.mjs';

function enrichFromCombined(combinedXml) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timing-enrich-'));
    const combinedPath = path.join(dir, 'results.xml');
    fs.writeFileSync(combinedPath, combinedXml, 'utf8');
    return buildTestmoSubmitJUnit(combinedXml, {
        repoRoot: dir,
        resultsDir: dir,
        part2SourcePath: combinedPath,
    });
}

const PARALLEL_COMBINED = `<testsuites tests="2" failures="0" time="474.077">
<testsuite name="e2e/fullE2ESmokePart1.spec.ts" timestamp="2026-11-18T10:52:31.364Z" hostname="chromium" tests="1" failures="0" time="464.749">
<testcase name="fullE2ESmokePart1" classname="e2e/fullE2ESmokePart1.spec.ts" time="464.749"></testcase>
</testsuite>
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" timestamp="2026-11-18T10:52:31.364Z" hostname="chromium" tests="1" failures="0" time="383.208">
<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="383.208"></testcase>
</testsuite>
</testsuites>`;

const SEQUENTIAL_COMBINED = `<testsuites name="Combined staging smoke (separate Part 1 and Part 2 executions)" tests="2" time="822">
<testsuite name="e2e/fullE2ESmokePart1.spec.ts" timestamp="2026-11-17T10:28:24.668Z" hostname="chromium" tests="1" time="486.441">
<testcase name="fullE2ESmokePart1" classname="e2e/fullE2ESmokePart1.spec.ts" time="486.441"></testcase>
</testsuite>
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" timestamp="2026-11-17T10:39:07.566Z" hostname="chromium" tests="1" time="335.573">
<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="335.573"></testcase>
</testsuite>
</testsuites>`;

test('detectSmokeExecutionMode distinguishes parallel same-timestamp vs sequential combined', () => {
    assert.equal(
        detectSmokeExecutionMode({ combinedXml: PARALLEL_COMBINED, smokeMeta: { workers: 2, smokeParts: [1, 2] } }),
        EXECUTION_MODE_PARALLEL
    );
    assert.equal(
        detectSmokeExecutionMode({
            combinedXml: SEQUENTIAL_COMBINED,
            provenance: { executionMode: 'sequential', note: 'separate executions' },
        }),
        EXECUTION_MODE_SEQUENTIAL
    );
});

test('computeSmokeTimingSummary uses max part duration for parallel intended run elapsed', () => {
    const built = enrichFromCombined(PARALLEL_COMBINED);
    const summary = computeSmokeTimingSummary({
        combinedXml: PARALLEL_COMBINED,
        submitXml: built.xml,
        smokeMeta: { startedAt: '2026-11-18T10:52:27.047Z', workers: 2, smokeParts: [1, 2] },
    });
    assert.equal(summary.executionMode, EXECUTION_MODE_PARALLEL);
    assert.equal(summary.intendedTestmoRunDurationSeconds, 464.749);
    assert.equal(summary.partMeasuredDurationSeconds.part1, 464.749);
    assert.equal(summary.wallClock.durationSeconds, 474.077);
    if (built.enriched) {
        const validation = validateTestmoSubmitXml(built.xml);
        assert.equal(validation.featureCount, validation.totalUploadedTestcases);
    }
});

test('feature testcase durations unchanged between full submit and timing sums', () => {
    const built = enrichFromCombined(PARALLEL_COMBINED);
    const sums = sumFeatureTimesBySuite(built.xml);
    const before = [...built.xml.matchAll(/<testcase\b[^>]*time="([^"]*)"/g)].map((m) => Number(m[1]));
    const builtAgain = enrichFromCombined(PARALLEL_COMBINED);
    const after = [...builtAgain.xml.matchAll(/<testcase\b[^>]*time="([^"]*)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(after, before);
    assert.ok(sums.total >= 0);
});

test('parallel payload feature sum exceeds intended run duration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-timing-'));
    const combinedXml = loadFixtureText(FIXTURE_PARALLEL_SMOKE_AGGREGATE);
    const paths = writeFixturePartFiles(dir, {
        combinedXml,
        part2Xml: fs.readFileSync(fixturePath(FIXTURE_PART2_DERIVED_ENRICHED), 'utf8'),
    });
    const part1Enriched = injectPart1TestmoCoverageFromFortyOne(fs.readFileSync(paths.part1, 'utf8'));
    const part1Suite = part1Enriched.match(/<testsuite[\s\S]*<\/testsuite>/)?.[0] ?? '';
    const combinedEnriched = combinedXml.replace(
        /<testsuite name="[^"]*fullE2ESmokePart1[\s\S]*?<\/testsuite>/,
        part1Suite
    );
    process.env.SMOKE_PART2_JUNIT_SOURCE = paths.part2;
    let built;
    try {
        built = buildTestmoSubmitJUnit(combinedEnriched, {
            repoRoot: dir,
            part2SourcePath: paths.part2,
        });
    } finally {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    }
    const summary = computeSmokeTimingSummary({
        combinedXml: combinedEnriched,
        submitXml: built.xml,
        smokeMeta: { workers: 2, smokeParts: [1, 2], startedAt: '2026-11-18T10:52:27.047Z' },
    });
    assert.equal(summary.executionMode, EXECUTION_MODE_PARALLEL);
    assert.equal(summary.intendedTestmoRunDurationSeconds, 464.749);
    assert.ok(summary.featureDurationSumSeconds.total > summary.intendedTestmoRunDurationSeconds);
    assert.equal(summary.singleSubmitIncorrectForParallel, true);
});

test('sequential intended run duration sums measured parts not max', () => {
    const built = enrichFromCombined(SEQUENTIAL_COMBINED);
    const summary = computeSmokeTimingSummary({
        combinedXml: SEQUENTIAL_COMBINED,
        submitXml: built.xml,
        provenance: { executionMode: 'sequential', aggregateTime: 822.014 },
    });
    assert.equal(summary.executionMode, EXECUTION_MODE_SEQUENTIAL);
    assert.ok(Math.abs(summary.intendedTestmoRunDurationSeconds - (486.441 + 335.573)) < 0.02);
    assert.equal(summary.parallelLongestPartSeconds, null);
});