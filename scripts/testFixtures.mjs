import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');
export const FIXTURES = path.join(REPO_ROOT, 'scripts', 'fixtures');

export const FIXTURE_STAGING_SMOKE_PARTS = 'staging-smoke-parts-1-2.xml';
export const FIXTURE_SYNTHETIC_PART1_REPORTING = 'synthetic-part1-reporting-junit.xml';
export const FIXTURE_PART2_CONSOLE_TAIL = 'part2-console-tail.txt';
export const FIXTURE_PART2_DERIVED_ENRICHED = 'part2-derived-enriched.xml';
export const FIXTURE_PARALLEL_SMOKE_AGGREGATE = 'parallel-smoke-aggregate.xml';
export const FIXTURE_PART2_BOUNDED_MARKUP = 'part2-bounded-markup-system-out.txt';

export const SYNTHETIC_PART1_ALLOCATED = 'synthetic-allocated@example.com';
export const SYNTHETIC_PART1_CHANGED = 'synthetic-changed@example.com';
export const SYNTHETIC_PART2_ACCOUNT = 'synthetic-part2@example.com';
export const FIXTURE_CUSTOMER_ID = 'c2222222-2222-4222-8222-222222222222';
export const FIXTURE_RECORD_ID = 'r4444444-4444-4444-8444-444444444444';
export const FIXTURE_ANALYSIS_ID = 'a5555555-5555-4555-8555-555555555555';
export const FIXTURE_NOTE_ID = 'n6666666-6666-4666-8666-666666666666';
export const FIXTURE_RUN_OUTPUT_ROOT =
    'test-output/analysisReportFull/2026-11-13T15-51-02-037Z-chromium-fixture5b137aff';

export function fixturePath(name) {
    return path.join(FIXTURES, name);
}

export function loadFixtureText(name) {
    return fs.readFileSync(fixturePath(name), 'utf8');
}

/** Staging smoke JUnit with Part 1 suite classname updated for current specs. */
export function loadStagingSmokePartsXml() {
    return loadFixtureText(FIXTURE_STAGING_SMOKE_PARTS).replaceAll(
        'e2e/fullE2ESmoke.spec.ts',
        'e2e/fullE2ESmokePart1.spec.ts'
    );
}

export function writeFixturePartFiles(dir, { combinedXml, part2Xml } = {}) {
    const combined = combinedXml ?? loadStagingSmokePartsXml();
    const part1Suite = combined.match(/<testsuite name="[^"]*fullE2ESmokePart1[^"]*"[\s\S]*?<\/testsuite>/)?.[0];
    const part2Suite =
        part2Xml?.match(/<testsuite[\s\S]*<\/testsuite>/)?.[0] ??
        combined.match(/<testsuite name="[^"]*fullE2ESmokePart2[^"]*"[\s\S]*?<\/testsuite>/)?.[0];
    if (!part1Suite || !part2Suite) {
        throw new Error('Missing Part 1 or Part 2 suite for fixture write');
    }
    fs.writeFileSync(
        path.join(dir, 'results-part1.xml'),
        `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">\n${part1Suite}\n</testsuites>`,
        'utf8'
    );
    const part2Body =
        part2Xml ??
        `<testsuites tests="1" failures="0" skipped="0" errors="0" time="1">\n${part2Suite}\n</testsuites>`;
    fs.writeFileSync(path.join(dir, 'results-part2.xml'), part2Body, 'utf8');
    fs.writeFileSync(path.join(dir, 'results.xml'), combined, 'utf8');
    return {
        combined: path.join(dir, 'results.xml'),
        part1: path.join(dir, 'results-part1.xml'),
        part2: path.join(dir, 'results-part2.xml'),
    };
}