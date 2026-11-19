import assert from 'node:assert/strict';
import test from 'node:test';
import { recomputeJUnitCounts, splitTopLevelTestsuites } from './junitCounts.mjs';

test('splitTopLevelTestsuites ignores literal </testsuite> inside testcase system-out', () => {
    const part1Inner = 'x'.repeat(200);
    const xml = `<testsuites tests="2" failures="0" skipped="0" errors="0" time="0">
<testsuite name="e2e/fullE2ESmokePart1.spec.ts" tests="1" failures="0" skipped="0" errors="0" time="1">
<testcase name="fullE2ESmokePart1" time="1"><system-out><![CDATA[${part1Inner}]]></system-out></testcase>
</testsuite>
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" tests="2" failures="0" skipped="0" errors="0" time="2">
<testcase name="fullE2ESmokePart2" time="2">
<system-out><![CDATA[noise ${part1Inner} styled Button<testsuite name="e2e/fullE2ESmokePart2.spec.ts" echo </testsuite> fragment]]></system-out>
</testcase>
<testcase name="part2-smoke-login" classname="e2e/part2SmokeTestmoFeature.spec.ts" time="0"/>
</testsuite>
</testsuites>`;
    const root = xml.match(/^<testsuites\b[^>]*>([\s\S]*)<\/testsuites>/)?.[1] ?? '';
    const suites = splitTopLevelTestsuites(root);
    assert.equal(suites.length, 2);
    const next = recomputeJUnitCounts(xml);
    assert.ok(next.length < 1_000_000, `expected bounded output, got length ${next.length}`);
    assert.doesNotMatch(next, /testsuite name="e2e\/fullE2ESmokePart1\.spec\.ts"[\s\S]*testsuite name="e2e\/fullE2ESmokePart1/);
});