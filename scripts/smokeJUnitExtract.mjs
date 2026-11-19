import { findTopLevelTestsuiteByName, parseTestsuitesRoot, recomputeJUnitCounts, splitTopLevelTestsuites } from './junitCounts.mjs';
import { extractPart2SuiteBlock } from './part2SubmitProvenance.mjs';

const PART1_SUITE_NAME = /name="[^"]*fullE2ESmokePart1\.spec\.ts"/;
const PART2_SUITE_NAME = /name="[^"]*fullE2ESmokePart2\.spec\.ts"/;

export function extractPart1SuiteBlock(xml) {
    return findTopLevelTestsuiteByName(xml, PART1_SUITE_NAME);
}

export { extractPart2SuiteBlock };

export function extractParallelSmokeSuites(combinedXml) {
    const part1Suite = extractPart1SuiteBlock(combinedXml);
    const part2Suite = extractPart2SuiteBlock(combinedXml);
    if (!part1Suite || !part2Suite) {
        throw new Error('Combined JUnit missing fullE2ESmokePart1 or fullE2ESmokePart2 testsuite.');
    }
    return { part1Suite, part2Suite };
}

export function buildPartOnlyJUnitFile(suiteBlock) {
    const wrapped = `<testsuites tests="0" failures="0" skipped="0" errors="0" time="0">\n${suiteBlock}\n</testsuites>`;
    return recomputeJUnitCounts(wrapped);
}

export function normalizeParallelCombinedJUnit(combinedXml) {
    const trimmed = combinedXml.trim();
    const root = parseTestsuitesRoot(trimmed);
    if (!root) {
        throw new Error('Invalid combined JUnit: missing <testsuites> root.');
    }
    const { part1Suite, part2Suite } = extractParallelSmokeSuites(trimmed);
    const suites = splitTopLevelTestsuites(root.inner);
    const extra = suites.filter((s) => !PART1_SUITE_NAME.test(s) && !PART2_SUITE_NAME.test(s));
    if (extra.length > 0) {
        throw new Error('Combined smoke JUnit contains unexpected top-level testsuites.');
    }
    const openAttrs = root.openTag.replace(/^<testsuites/, '<testsuites id="" name=""');
    const inner = `${part1Suite}\n${part2Suite}\n`;
    const body = `${openAttrs}${inner}${root.closeTag}`;
    return recomputeJUnitCounts(body);
}

export function readSuiteBlockMeta(suiteBlock) {
    const readAttr = (name) => suiteBlock.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
    const testcase = suiteBlock.match(
        /<testcase\b[^>]*name="(fullE2ESmokePart[12])"[^>]*time="([^"]*)"/
    );
    let status = 'passed';
    if (/<failure\b/.test(suiteBlock)) {
        status = 'failed';
    } else if (/<error\b/.test(suiteBlock)) {
        status = 'error';
    } else if (/<skipped\b/.test(suiteBlock)) {
        status = 'skipped';
    }
    return {
        suiteTimestamp: readAttr('timestamp'),
        hostname: readAttr('hostname'),
        suiteTime: readAttr('time'),
        testcaseName: testcase?.[1] ?? null,
        testcaseTime: testcase?.[2] ?? null,
        status,
    };
}