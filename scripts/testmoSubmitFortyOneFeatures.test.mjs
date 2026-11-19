import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    buildTestmoSubmitJUnit,
    isTestmoSubmitFeatureOnlyXml,
    validateTestmoSubmitXml,
} from './buildTestmoSubmitJUnit.mjs';
import { PART1_TESTMO_CASE_DEFINITIONS } from './part1TestmoConstants.mjs';
import { validateAggregateCombinedSmokeXml } from './submitSmokeResults.mjs';
import { recomputeJUnitCounts } from './junitCounts.mjs';
import {
    FIXTURE_PART2_DERIVED_ENRICHED,
    fixturePath,
    loadStagingSmokePartsXml,
    writeFixturePartFiles,
} from './testFixtures.mjs';
import { injectPart1TestmoCoverageFromFortyOne } from './testFixtureHelpers.mjs';

function combineAggregateJunit(part1Xml, part2Xml) {
    const part1Suite = part1Xml.match(/<testsuite\b[^>]*name="[^"]*fullE2ESmokePart1[^"]*"[\s\S]*<\/testsuite>/)?.[0];
    const part2Suite = part2Xml.match(/<testsuite\b[^>]*name="[^"]*fullE2ESmokePart2[^"]*"[\s\S]*<\/testsuite>/)?.[0];
    assert.ok(part1Suite, 'part1 suite');
    assert.ok(part2Suite, 'part2 suite');
    return recomputeJUnitCounts(
        `<testsuites tests="2" failures="0" skipped="0" errors="0" time="0">\n${part1Suite}\n${part2Suite}\n</testsuites>`
    );
}

function loadFortyOneFixturePair(dir) {
    const combined = loadStagingSmokePartsXml();
    const paths = writeFixturePartFiles(dir, {
        combinedXml: combined,
        part2Xml: fs.readFileSync(fixturePath(FIXTURE_PART2_DERIVED_ENRICHED), 'utf8'),
    });
    const part1Enriched = injectPart1TestmoCoverageFromFortyOne(fs.readFileSync(paths.part1, 'utf8'));
    fs.writeFileSync(paths.part1, part1Enriched, 'utf8');
    return { paths, part1Enriched, part2Xml: fs.readFileSync(paths.part2, 'utf8') };
}

test('feature-only submit XML is not validated as aggregate combined input', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'submit-only-'));
    const { paths, part1Enriched, part2Xml } = loadFortyOneFixturePair(dir);
    const built = buildTestmoSubmitJUnit(
        combineAggregateJunit(part1Enriched, part2Xml),
        { repoRoot: dir, part2SourcePath: paths.part2 }
    );
    const submitXml = built.xml;
    assert.ok(isTestmoSubmitFeatureOnlyXml(submitXml));
    assert.throws(() => validateAggregateCombinedSmokeXml(submitXml), /Refusing to validate TestMo submit/);
    assert.doesNotThrow(() => validateTestmoSubmitXml(submitXml));
    fs.writeFileSync(path.join(dir, 'results-testmo-submit.xml'), submitXml);
});

test('combined aggregate with Part 1+2 coverage events yields 41 feature cases', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'submit-41-'));
    const { paths, part1Enriched, part2Xml } = loadFortyOneFixturePair(dir);
    const combined = combineAggregateJunit(part1Enriched, part2Xml);
    assert.doesNotThrow(() => validateAggregateCombinedSmokeXml(combined));

    fs.writeFileSync(paths.combined, combined, 'utf8');
    const built = buildTestmoSubmitJUnit(combined, {
        repoRoot: dir,
        resultsDir: dir,
        part2SourcePath: paths.part2,
    });
    assert.equal(built.enriched, true);
    assert.doesNotMatch(built.xml, /name="fullE2ESmokePart1"/);
    assert.doesNotMatch(built.xml, /name="fullE2ESmokePart2"/);

    const validation = validateTestmoSubmitXml(built.xml);
    assert.equal(validation.part1FeatureCount, PART1_TESTMO_CASE_DEFINITIONS.length);
    assert.ok(validation.part2FeatureCount >= 21);
    assert.equal(validation.totalUploadedTestcases, validation.part1FeatureCount + validation.part2FeatureCount);
    assert.equal(validation.totalUploadedTestcases, 41);
    assert.equal(validation.featureCount, 41);
    assert.equal(new Set(validation.featureKeys).size, 41);
    assert.equal(built.preview?.totalEquation, `20 + 21 = 41`);
});