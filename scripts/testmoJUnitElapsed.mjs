/**
 * TestMo CLI thread elapsed for post-run JUnit upload:
 * @see /usr/local/lib/node_modules/@testmo/testmo-cli/dist/parsers/junit.js collectElapsed
 * @see /usr/local/lib/node_modules/@testmo/testmo-cli/dist/controller/automationRunSubmitThread.js elapsedComputed
 *
 * Custom thread resource fields do NOT set elapsed; createAutomationRunThread receives
 * elapsed_computed from JUnit parse results.elapsed (root / top testsuites|testsuite @time).
 */
import { parseTestsuitesRoot, splitTopLevelTestcases } from './junitCounts.mjs';

export const TESTMO_THREAD_ELAPSED_MECHANISM =
    'JUnit XML @time on root <testsuites> (seconds) → Testmo CLI JUnitParser.collectElapsed → API elapsed_computed (microseconds) on automation:run:submit-thread';

export function junitTimeAttributeSeconds(xml) {
    const value = xml.match(/<testsuites\b[^>]*\btime="([^"]*)"/)?.[1];
    if (value === undefined) {
        return null;
    }
    const n = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Mirrors Testmo CLI JUnitParser.collectElapsed → microseconds. */
export function testmoCollectElapsedMicrosecondsFromJUnit(xml) {
    const seconds = junitTimeAttributeSeconds(xml);
    if (seconds === null) {
        return null;
    }
    return Math.round(seconds * 1_000_000);
}

export function sumFeatureTestcaseTimesSeconds(xml) {
    const root = parseTestsuitesRoot(xml.trim());
    if (!root) {
        return 0;
    }
    const inner = root.inner;
    const blocks = splitTopLevelTestcases(inner);
    let total = 0;
    for (const block of blocks) {
        const t = Number(block.match(/\btime="([^"]*)"/)?.[1]);
        if (Number.isFinite(t)) {
            total += t;
        }
    }
    return total;
}

/**
 * Set thread-level JUnit @time for TestMo elapsed_computed; leave each <testcase time="..."> unchanged.
 */
export function applyMeasuredThreadElapsedToJUnitXml(xml, measuredSeconds) {
    if (!Number.isFinite(measuredSeconds) || measuredSeconds < 0) {
        throw new Error(`Invalid measured thread elapsed: ${measuredSeconds}`);
    }
    const timeStr = String(measuredSeconds);
    let out = xml;
    const rootReplaced = out.replace(/^(<testsuites\b[^>]*)\btime="[^"]*"/, `$1time="${timeStr}"`);
    if (rootReplaced === out) {
        throw new Error('JUnit missing root testsuites time attribute');
    }
    out = rootReplaced;
    const suiteReplaced = out.replace(/(<testsuite\b[^>]*)\btime="[^"]*"/, `$1time="${timeStr}"`);
    if (suiteReplaced === out) {
        throw new Error('JUnit missing testsuite time attribute');
    }
    out = suiteReplaced;
    return injectThreadElapsedProperties(out, measuredSeconds);
}

function injectThreadElapsedProperties(xml, measuredSeconds) {
    const featureSum = sumFeatureTestcaseTimesSeconds(xml);
    const props = `    <property name="testmo_thread_elapsed_source" value="junit.testsuites.time"/>
    <property name="smoke_thread_measured_part_seconds" value="${measuredSeconds}"/>
    <property name="smoke_thread_feature_sum_seconds" value="${featureSum}"/>
`;
    if (xml.includes('testmo_thread_elapsed_source')) {
        return xml;
    }
    return xml.replace(/(<testsuite\b[^>]*>)(\s*)/, (_, open, ws) => {
        if (xml.includes('<properties>')) {
            return `${open}${ws}`;
        }
        return `${open}\n  <properties>\n${props}  </properties>\n`;
    });
}

export function buildOutgoingThreadElapsedReport({ part1Xml, part2Xml, timingSummary }) {
    return {
        mechanism: TESTMO_THREAD_ELAPSED_MECHANISM,
        part1: {
            measuredPartSeconds: timingSummary.partMeasuredDurationSeconds.part1,
            junitRootTimeSeconds: junitTimeAttributeSeconds(part1Xml),
            testmoElapsedComputedMicroseconds: testmoCollectElapsedMicrosecondsFromJUnit(part1Xml),
            featureTestcaseSumSeconds: sumFeatureTestcaseTimesSeconds(part1Xml),
        },
        part2: {
            measuredPartSeconds: timingSummary.partMeasuredDurationSeconds.part2,
            junitRootTimeSeconds: junitTimeAttributeSeconds(part2Xml),
            testmoElapsedComputedMicroseconds: testmoCollectElapsedMicrosecondsFromJUnit(part2Xml),
            featureTestcaseSumSeconds: sumFeatureTestcaseTimesSeconds(part2Xml),
        },
        longestPartMeasuredSeconds: timingSummary.parallelLongestPartSeconds,
        smokeWallClockSeconds: timingSummary.wallClock.durationSeconds,
        intendedTestmoRunSeconds: timingSummary.intendedTestmoRunDurationSeconds,
    };
}