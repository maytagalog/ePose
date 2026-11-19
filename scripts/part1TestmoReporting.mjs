import {
    PART1_AGGREGATE_TESTNAME,
    PART1_FEATURE_CLASSNAME,
} from './part1TestmoConstants.mjs';

export function readPart1SuiteMeta(xml) {
    const suiteRe = /<testsuite\b[^>]*name="[^"]*fullE2ESmokePart1\.spec\.ts"[^>]*>/;
    const tag = xml.match(suiteRe)?.[0];
    if (!tag) {
        return null;
    }
    const read = (attr) => tag.match(new RegExp(`${attr}="([^"]*)"`))?.[1] ?? null;
    return {
        timestamp: read('timestamp'),
        hostname: read('hostname'),
        tests: read('tests'),
    };
}

export function readPart1FeatureSuiteMeta(xml) {
    const suiteRe = new RegExp(
        `<testsuite\\b[^>]*name="${PART1_FEATURE_CLASSNAME.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"[^>]*>`
    );
    const tag = xml.match(suiteRe)?.[0];
    if (!tag) {
        return null;
    }
    const read = (attr) => tag.match(new RegExp(`${attr}="([^"]*)"`))?.[1] ?? null;
    return {
        timestamp: read('timestamp'),
        hostname: read('hostname'),
        tests: read('tests'),
    };
}

export function extractPart1TestcaseSystemOut(xml) {
    const suiteRe = /<testsuite\b[^>]*name="[^"]*fullE2ESmokePart1\.spec\.ts"[^>]*>[\s\S]*?<\/testsuite>/;
    const suite = xml.match(suiteRe)?.[0];
    if (!suite) {
        return null;
    }
    const aggregate = suite.match(
        new RegExp(
            `<testcase\\b[^>]*name="${PART1_AGGREGATE_TESTNAME}"[^>]*>[\\s\\S]*?<\\/testcase>`,
            'i'
        )
    )?.[0];
    if (!aggregate) {
        return null;
    }
    const out = aggregate.match(/<system-out>([\s\S]*?)<\/system-out>/i)?.[1];
    return out ?? null;
}

export function extractPart1FeatureCases(xml) {
    const cases = [];
    const re = new RegExp(
        `<testcase\\b[^>]*name="([^"]+)"[^>]*classname="${PART1_FEATURE_CLASSNAME.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"`,
        'g'
    );
    let match;
    while ((match = re.exec(xml)) !== null) {
        cases.push({ name: match[1], classname: PART1_FEATURE_CLASSNAME });
    }
    return cases;
}