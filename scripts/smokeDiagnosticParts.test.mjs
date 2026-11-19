import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import {
    parseSmokeDiagnosticParts,
    smokeDiagnosticJUnitFileName,
    smokeDiagnosticSpecArgs,
    smokeDiagnosticWorkers,
} from './smokeDiagnosticParts.mjs';

test('parseSmokeDiagnosticParts defaults to both', () => {
    assert.deepEqual(parseSmokeDiagnosticParts(''), [1, 2]);
    assert.deepEqual(parseSmokeDiagnosticParts(undefined), [1, 2]);
});

test('parseSmokeDiagnosticParts selects part 1 only', () => {
    assert.deepEqual(parseSmokeDiagnosticParts('1'), [1]);
});

test('junit and workers for part 1 only', () => {
    const parts = [1];
    assert.equal(smokeDiagnosticWorkers(parts), 1);
    assert.equal(smokeDiagnosticJUnitFileName(parts), 'results-part1.xml');
});

test('smoke diagnostic specs exclude synthetic TestMo reporting specs', () => {
    const specs = smokeDiagnosticSpecArgs([1, 2], REPO_ROOT);
    for (const spec of specs) {
        assert.doesNotMatch(spec, /part1SmokeTestmoFeature\.spec\.ts$/);
        assert.doesNotMatch(spec, /Reporting\.junit\.spec\.ts$/);
    }
});

test('part 1 diagnostic runs fullE2ESmokePart1 (resume via runSmokeEmailStateSession)', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const specs = smokeDiagnosticSpecArgs([1], repoRoot);
    assert.equal(specs.length, 1);
    assert.match(specs[0], /fullE2ESmokePart1\.spec\.ts$/);
});