import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    buildTestmoSubmitJUnit,
    extractPart1FeatureCases,
    extractPart2FeatureCases,
    validateTestmoSubmitXml,
} from './buildTestmoSubmitJUnit.mjs';
import { PART1_TESTMO_CASE_DEFINITIONS } from './part1TestmoConstants.mjs';
import { parseJUnitXmlWithPython } from './junitXmlPythonVerify.mjs';
import {
    FIXTURE_PART2_DERIVED_ENRICHED,
    fixturePath,
    loadStagingSmokePartsXml,
    writeFixturePartFiles,
} from './testFixtures.mjs';
import { injectPart1TestmoCoverageFromFortyOne } from './testFixtureHelpers.mjs';

function buildFreshSubmitXml() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-submit-'));
    const combined = loadStagingSmokePartsXml();
    const paths = writeFixturePartFiles(dir, {
        combinedXml: combined,
        part2Xml: fs.readFileSync(fixturePath(FIXTURE_PART2_DERIVED_ENRICHED), 'utf8'),
    });
    const part1Enriched = injectPart1TestmoCoverageFromFortyOne(fs.readFileSync(paths.part1, 'utf8'));
    fs.writeFileSync(paths.part1, part1Enriched, 'utf8');
    const combinedWithPart1 = combined.replace(
        /<testsuite name="[^"]*fullE2ESmokePart1[\s\S]*?<\/testsuite>/,
        part1Enriched.match(/<testsuite[\s\S]*<\/testsuite>/)?.[0] ?? ''
    );
    fs.writeFileSync(paths.combined, combinedWithPart1, 'utf8');
    process.env.SMOKE_PART2_JUNIT_SOURCE = paths.part2;
    try {
        const built = buildTestmoSubmitJUnit(combinedWithPart1, {
            repoRoot: dir,
            part2SourcePath: paths.part2,
        });
        return { built, dir, part2Path: paths.part2 };
    } finally {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    }
}

test('results-testmo-submit.xml parses as feature-only XML with part1+part2 totals', () => {
    const { built, dir } = buildFreshSubmitXml();
    const tmp = path.join(dir, 'results-testmo-submit.xml');
    fs.writeFileSync(tmp, built.xml, 'utf8');
    const stats = parseJUnitXmlWithPython(tmp);
    const validation = validateTestmoSubmitXml(built.xml);

    assert.doesNotMatch(built.xml, /name="fullE2ESmokePart1"/);
    assert.doesNotMatch(built.xml, /name="fullE2ESmokePart2"/);
    assert.equal(validation.totalUploadedTestcases, validation.part1FeatureCount + validation.part2FeatureCount);
    assert.equal(stats.testcaseCount, validation.totalUploadedTestcases);
    assert.equal(new Set(stats.featureAutomationKeys).size, stats.featureAutomationKeys.length);
});

test('re-enrichment keeps unique automation keys without duplicates', () => {
    const { built, part2Path, dir } = buildFreshSubmitXml();
    process.env.SMOKE_PART2_JUNIT_SOURCE = part2Path;
    try {
        const second = buildTestmoSubmitJUnit(built.xml, { repoRoot: dir, part2SourcePath: part2Path });
        const validation = validateTestmoSubmitXml(second.xml);
        assert.equal(
            validation.totalUploadedTestcases,
            validation.part1FeatureCount + validation.part2FeatureCount
        );
        assert.equal(extractPart1FeatureCases(second.xml).length, validation.part1FeatureCount);
        assert.equal(extractPart2FeatureCases(second.xml).length, validation.part2FeatureCount);
        assert.equal(new Set(validation.featureKeys).size, validation.featureKeys.length);
        assert.ok(second.replacedFeatureCount >= validation.featureCount);
    } finally {
        delete process.env.SMOKE_PART2_JUNIT_SOURCE;
    }
});

test('preview equation uses measured counts (no hardcoded total)', () => {
    const { built } = buildFreshSubmitXml();
    const p1 = built.preview?.part1FeatureCaseCount ?? 0;
    const p2 = built.preview?.part2FeatureCaseCount ?? 0;
    assert.equal(built.preview?.totalUploadedTestcases, p1 + p2);
    assert.match(built.preview?.totalEquation ?? '', new RegExp(`${p1} \\+ ${p2} = ${p1 + p2}`));
    if (p1 > 0) {
        assert.ok(p1 >= PART1_TESTMO_CASE_DEFINITIONS.length - 2 || p1 === PART1_TESTMO_CASE_DEFINITIONS.length);
    }
});