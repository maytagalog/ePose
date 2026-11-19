import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    previewTestmoSubmitPayload,
    resolvePart2SourceForPreview,
} from './previewTestmoSubmitPayload.mjs';
import { validateAggregateCombinedSmokeXml } from './submitSmokeResults.mjs';
import {
    FIXTURE_PART2_DERIVED_ENRICHED,
    fixturePath,
    loadStagingSmokePartsXml,
    writeFixturePartFiles,
} from './testFixtures.mjs';
import { injectPart1TestmoCoverageFromFortyOne } from './testFixtureHelpers.mjs';

test('previewTestmoSubmitPayload exposes part2SourcePath (aggregate path regression)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-fixture-'));
    const combined = loadStagingSmokePartsXml();
    const paths = writeFixturePartFiles(dir, {
        combinedXml: combined,
        part2Xml: fs.readFileSync(fixturePath(FIXTURE_PART2_DERIVED_ENRICHED), 'utf8'),
    });
    const part1Enriched = injectPart1TestmoCoverageFromFortyOne(fs.readFileSync(paths.part1, 'utf8'));
  const part1Suite = part1Enriched.match(/<testsuite[\s\S]*<\/testsuite>/)?.[0] ?? '';
    const combinedEnriched = combined.replace(
        /<testsuite name="[^"]*fullE2ESmokePart1[\s\S]*?<\/testsuite>/,
        part1Suite
    );
    fs.writeFileSync(paths.combined, combinedEnriched, 'utf8');

    const prior = process.env.SMOKE_PART2_JUNIT_SOURCE;
    process.env.SMOKE_PART2_JUNIT_SOURCE = paths.part2;
    try {
        const baseXml = fs.readFileSync(paths.combined, 'utf8');
        validateAggregateCombinedSmokeXml(baseXml);
        const resolved = resolvePart2SourceForPreview({
            resultsPath: paths.combined,
            baseXml,
            repoRoot: dir,
        });
        assert.equal(path.basename(resolved), 'results-part2.xml');

        const payload = previewTestmoSubmitPayload({
            resultsPath: paths.combined,
            repoRoot: dir,
            writeSubmitFile: false,
            skipAggregateReadyCheck: true,
        });
        assert.ok(payload.part2SourcePath, 'part2SourcePath must be defined in preview JSON');
        assert.equal(path.basename(payload.part2SourcePath), 'results-part2.xml');
        assert.equal(payload.validation.totalUploadedTestcases, payload.validation.featureCount);
        assert.ok(payload.whatTestmoReceives.part1Source);
        assert.ok(payload.whatTestmoReceives.part2Source);
    } finally {
        if (prior === undefined) {
            delete process.env.SMOKE_PART2_JUNIT_SOURCE;
        } else {
            process.env.SMOKE_PART2_JUNIT_SOURCE = prior;
        }
    }
});