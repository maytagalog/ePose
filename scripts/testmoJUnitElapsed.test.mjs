import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildTestmoSubmitJUnit } from './buildTestmoSubmitJUnit.mjs';
import {
    applyMeasuredThreadElapsedToJUnitXml,
    sumFeatureTestcaseTimesSeconds,
    testmoCollectElapsedMicrosecondsFromJUnit,
} from './testmoJUnitElapsed.mjs';
import { computeSmokeTimingSummary } from './testmoSmokeRunTiming.mjs';
import { writeThreadSubmitArtifacts } from './testmoParallelSubmit.mjs';
import {
    FIXTURE_PARALLEL_SMOKE_AGGREGATE,
    FIXTURE_PART2_DERIVED_ENRICHED,
    fixturePath,
    loadFixtureText,
    writeFixturePartFiles,
} from './testFixtures.mjs';
import { injectPart1TestmoCoverageFromFortyOne } from './testFixtureHelpers.mjs';

test('applyMeasuredThreadElapsed sets TestMo elapsed source without changing feature testcase times', () => {
    const raw = `<testsuites tests="2" failures="0" time="100.5">
<testsuite name="suite" tests="2" time="100.5">
  <testcase name="a" time="60.5"><properties/></testcase>
  <testcase name="b" time="40"><properties/></testcase>
</testsuite>
</testsuites>`;
    const measured = 464.749;
    const out = applyMeasuredThreadElapsedToJUnitXml(raw, measured);
    assert.equal(testmoCollectElapsedMicrosecondsFromJUnit(out), Math.round(measured * 1_000_000));
    assert.equal(sumFeatureTestcaseTimesSeconds(out), 100.5);
    assert.match(out, /time="60\.5"/);
    assert.match(out, /time="40"/);
});

function buildParallelSubmitFixturePair(dir) {
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
    fs.writeFileSync(paths.combined, combinedEnriched, 'utf8');
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
    const submitPath = path.join(dir, 'results-testmo-submit.xml');
    fs.writeFileSync(submitPath, built.xml, 'utf8');
    return { combinedXml: combinedEnriched, submitXml: built.xml, submitPath, built };
}

test('parallel thread JUnit outgoing elapsed matches measured parts not feature sums', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-outgoing-'));
    const { combinedXml, submitXml, submitPath } = buildParallelSubmitFixturePair(dir);
    const timing = computeSmokeTimingSummary({
        combinedXml,
        submitXml,
        smokeMeta: { workers: 2, smokeParts: [1, 2], startedAt: '2026-11-18T10:52:27.047Z' },
    });
    const artifacts = writeThreadSubmitArtifacts({
        submitXmlPath: submitPath,
        timingSummary: timing,
        submitDir: dir,
    });

    const outgoing = artifacts.outgoingThreadElapsed;
    assert.equal(outgoing.part1.junitRootTimeSeconds, timing.partMeasuredDurationSeconds.part1);
    assert.equal(outgoing.part2.junitRootTimeSeconds, timing.partMeasuredDurationSeconds.part2);
    assert.equal(outgoing.longestPartMeasuredSeconds, Math.max(
        timing.partMeasuredDurationSeconds.part1,
        timing.partMeasuredDurationSeconds.part2
    ));
    assert.equal(outgoing.intendedTestmoRunSeconds, outgoing.longestPartMeasuredSeconds);
    assert.ok(outgoing.part1.featureTestcaseSumSeconds > 0);
    assert.ok(outgoing.part2.featureTestcaseSumSeconds > 0);
    assert.notEqual(outgoing.part1.featureTestcaseSumSeconds, outgoing.part1.junitRootTimeSeconds);
    assert.notEqual(outgoing.part2.featureTestcaseSumSeconds, outgoing.part2.junitRootTimeSeconds);
});