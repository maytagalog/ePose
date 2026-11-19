import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTestmoSubmitJUnit, extractPart2FeatureCases, validateTestmoEnrichedXml } from './buildTestmoSubmitJUnit.mjs';
import {
    findTopLevelTestsuiteByName,
    parseTestsuitesRoot,
    recomputeJUnitCounts,
    splitTopLevelTestcases,
    splitTopLevelTestsuites,
} from './junitCounts.mjs';

test('CDATA with line-anchored fake testsuite/testcase tags does not split structure', () => {
    const decoy = `
<testsuite name="decoy-suite-in-cdata">
<testcase name="decoy-case"/>
</testsuite>`;
    const xml = `<testsuites tests="2" failures="0" skipped="0" errors="0" time="0">
<testsuite name="e2e/fullE2ESmokePart1.spec.ts" tests="1" failures="0" skipped="0" errors="0" time="1">
<testcase name="fullE2ESmokePart1" time="1">
<system-out><![CDATA[diagnostics${decoy}]]></system-out>
</testcase>
</testsuite>
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" tests="2" failures="0" skipped="0" errors="0" time="2">
<testcase name="fullE2ESmokePart2" time="2">
<system-out><![CDATA[prefix
${decoy}
</testcase>
suffix]]></system-out>
</testcase>
<testcase name="part2-smoke-login" classname="e2e/part2SmokeTestmoFeature.spec.ts" time="0"/>
</testsuite>
</testsuites>`;

    const root = parseTestsuitesRoot(xml);
    assert.ok(root);
    const suites = splitTopLevelTestsuites(root.inner);
    assert.equal(suites.length, 2);

    const part2 = findTopLevelTestsuiteByName(xml, /fullE2ESmokePart2/);
    assert.ok(part2);
    const open = part2.match(/^<testsuite\b[^>]*>/)?.[0] ?? '';
    const part2Inner = part2.slice(open.length, -'</testsuite>'.length);
    const cases = splitTopLevelTestcases(part2Inner);
    assert.equal(cases.length, 2, 'expected aggregate + one feature testcase');

    const next = recomputeJUnitCounts(xml);
    assert.ok(next.length < 50_000);
    assert.match(next, /<testsuites\b[^>]*tests="3"/);
    const reparsed = parseTestsuitesRoot(next);
    assert.equal(splitTopLevelTestsuites(reparsed.inner).length, 2);
});