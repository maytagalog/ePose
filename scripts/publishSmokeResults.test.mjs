import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { combineSmokeResults } from './combineSmokeResults.mjs';
import { previewTestmoSubmitPayload } from './previewTestmoSubmitPayload.mjs';
import {
    assertAggregateReadyForSubmit,
    loadResultsRootState,
    sha256Hex,
} from './resultsRootState.mjs';
import {
    publishParallelSmokeRun,
    publishSinglePartSmokeRun,
    validateCombinedSmokeJUnitForPublish,
} from './publishSmokeResults.mjs';
import { extractPart1SuiteBlock, extractPart2SuiteBlock } from './smokeJUnitExtract.mjs';
import { submitSmokeResults, validateSmokeResultsXml } from './submitSmokeResults.mjs';
import { loadStagingSmokePartsXml } from './testFixtures.mjs';

function fixtureCombinedXml() {
    return loadStagingSmokePartsXml();
}

function mkWorkDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-publish-'));
}

function writeParallelFixture(dir, { part2Failure = false } = {}) {
    let combined = fixtureCombinedXml();
    if (part2Failure) {
        combined = combined.replace(
            /(<testsuite name="e2e\/fullE2ESmokePart2\.spec\.ts"[^>]*)(tests="1" failures=")0(")/,
            '$1$11$3'
        );
        combined = combined.replace(
            /(<testcase name="fullE2ESmokePart2"[^>]*>)/,
            '$1\n<failure message="boom"/>'
        );
    }
    const combinedPath = path.join(dir, 'run-results-smoke.xml');
    fs.writeFileSync(combinedPath, combined, 'utf8');
    return { combined, combinedPath };
}

test('publishParallelSmokeRun writes aggregate + aligned part files and marks aggregate ready', () => {
    const dir = mkWorkDir();
    const backupDir = path.join(dir, 'results-backups');
    const { combined } = writeParallelFixture(dir);
    const runMeta = { runId: 'test-parallel-run', runRoot: path.join(dir, 'run'), smokeParts: [1, 2] };

    const result = publishParallelSmokeRun({
        repoRoot: dir,
        combinedXml: combined,
        runMeta,
        backupDir,
        now: new Date('2026-11-19T07:00:00.000Z'),
    });

    assert.ok(fs.existsSync(path.join(dir, 'results.xml')));
    assert.ok(fs.existsSync(path.join(dir, 'results-part1.xml')));
    assert.ok(fs.existsSync(path.join(dir, 'results-part2.xml')));
    assert.equal(result.publication.recombinationRequired, false);
    assert.equal(result.publication.executionMode, 'parallel');

    const state = loadResultsRootState(dir, backupDir);
    assert.equal(state.aggregateReady, true);
    assert.equal(state.recombinationRequired, false);

    const aggregate = fs.readFileSync(path.join(dir, 'results.xml'), 'utf8');
    const { counts } = validateSmokeResultsXml(aggregate);
    assert.equal(counts.tests, 2);
});

test('parallel publish preserves CDATA system-out in extracted part files', () => {
    const dir = mkWorkDir();
    const backupDir = path.join(dir, 'results-backups');
    const { combined } = writeParallelFixture(dir);
    publishParallelSmokeRun({ repoRoot: dir, combinedXml: combined, backupDir });

    const combinedPart1 = extractPart1SuiteBlock(combined);
    const publishedPart1 = fs.readFileSync(path.join(dir, 'results-part1.xml'), 'utf8');
    const extractedPublished = extractPart1SuiteBlock(publishedPart1);
    assert.equal(extractedPublished, combinedPart1);
    assert.ok(extractedPublished.includes('PART1_RUN_STARTED'));
    assert.ok(extractedPublished.includes('CDATA'));
});

test('parallel publish accepts failed part JUnit when structure is valid', () => {
    const dir = mkWorkDir();
    const backupDir = path.join(dir, 'results-backups');
    const { combined } = writeParallelFixture(dir, { part2Failure: true });
    publishParallelSmokeRun({ repoRoot: dir, combinedXml: combined, backupDir });
    const part2 = fs.readFileSync(path.join(dir, 'results-part2.xml'), 'utf8');
    assert.ok(part2.includes('<failure'));
});

test('publishSinglePartSmokeRun updates one part and marks aggregate stale', () => {
    const dir = mkWorkDir();
    const backupDir = path.join(dir, 'results-backups');
    const { combined } = writeParallelFixture(dir);
    publishParallelSmokeRun({ repoRoot: dir, combinedXml: combined, backupDir });

    const part2Only = fs.readFileSync(path.join(dir, 'results-part2.xml'), 'utf8');
    const part2ShaBefore = sha256Hex(part2Only);
    const part1Rerun = part2Only.replace('PART2_RUN_STARTED', 'PART2_RERUN_MARKER');
    part1Rerun; // silence unused if we use part1

    const part1Only = fs.readFileSync(path.join(dir, 'results-part1.xml'), 'utf8');
    const part1RerunXml = part1Only.replace('PART1_RUN_STARTED', 'PART1_RERUN_MARKER');

    publishSinglePartSmokeRun({
        repoRoot: dir,
        part: 1,
        partXml: part1RerunXml,
        runMeta: { runId: 'part1-rerun' },
        backupDir,
    });

    const state = loadResultsRootState(dir, backupDir);
    assert.equal(state.recombinationRequired, true);
    assert.equal(state.aggregateReady, false);
    assert.equal(sha256Hex(fs.readFileSync(path.join(dir, 'results-part2.xml'), 'utf8')), part2ShaBefore);

    assert.throws(() => assertAggregateReadyForSubmit(dir, { backupDir }), /Stale combined/);
});

test('combine after single-part rerun clears stale guard and preview can run', () => {
    const dir = mkWorkDir();
    const backupDir = path.join(dir, 'results-backups');
    const { combined } = writeParallelFixture(dir);
    publishParallelSmokeRun({ repoRoot: dir, combinedXml: combined, backupDir });

    const part1Only = fs.readFileSync(path.join(dir, 'results-part1.xml'), 'utf8');
    publishSinglePartSmokeRun({
        repoRoot: dir,
        part: 1,
        partXml: part1Only.replace('PART1_RUN_STARTED', 'PART1_RERUN'),
        runMeta: { runId: 'part1-rerun-2' },
        backupDir,
    });

    const combinedResult = combineSmokeResults({ resultsRoot: dir, backupDir });
    assert.equal(combinedResult.alreadyUpToDate, false);
    assertAggregateReadyForSubmit(dir, { backupDir });

    const second = combineSmokeResults({ resultsRoot: dir, backupDir });
    assert.equal(second.alreadyUpToDate, true);

    const preview = previewTestmoSubmitPayload({
        resultsPath: path.join(dir, 'results.xml'),
        repoRoot: dir,
        backupDir,
        writeSubmitFile: false,
    });
    assert.ok(preview.part2SourcePath);
    assert.equal(preview.testmoTiming?.summary?.executionMode, 'sequential');
});

test('stale aggregate blocks submitSmokeResults until recombined', () => {
    const dir = mkWorkDir();
    const backupDir = path.join(dir, 'results-backups');
    const statePath = path.join(dir, 'submit-state.json');
    const { combined } = writeParallelFixture(dir);
    publishParallelSmokeRun({ repoRoot: dir, combinedXml: combined, backupDir });

    publishSinglePartSmokeRun({
        repoRoot: dir,
        part: 2,
        partXml: fs.readFileSync(path.join(dir, 'results-part2.xml'), 'utf8'),
        runMeta: { runId: 'part2-touch' },
        backupDir,
    });

    assert.throws(
        () =>
            submitSmokeResults({
                resultsPath: path.join(dir, 'results.xml'),
                statePath,
                backupDir,
                repoRoot: dir,
                mockSubmit: true,
            }),
        /Stale combined/
    );
});

test('validateCombinedSmokeJUnitForPublish rejects missing part suite', () => {
    const bad = `<testsuites tests="1"><testsuite name="e2e/fullE2ESmokePart1.spec.ts" tests="1" failures="0" time="1">
<testcase name="fullE2ESmokePart1" classname="e2e/fullE2ESmokePart1.spec.ts" time="1"/></testsuite></testsuites>`;
    assert.throws(() => validateCombinedSmokeJUnitForPublish(bad), /missing fullE2ESmokePart/);
});

test('publishParallelSmokeRun rejects empty JUnit', () => {
    const dir = mkWorkDir();
    assert.throws(
        () => publishParallelSmokeRun({ repoRoot: dir, combinedXml: '   ' }),
        /Missing combined JUnit/
    );
});