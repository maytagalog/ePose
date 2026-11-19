import fs from 'node:fs';
import path from 'node:path';
import { findTopLevelTestsuiteByName, replaceXmlBlockOnce } from './junitCounts.mjs';
import { parsePart2ConsoleEvents } from './part2TestmoCoverageFromEvents.mjs';
import { extractPart2TestcaseSystemOut } from './part2TestmoReporting.mjs';

const PART2_SUITE_NAME = /name="[^"]*fullE2ESmokePart2\.spec\.ts"/;

export function extractPart2SuiteBlock(xml) {
    return findTopLevelTestsuiteByName(xml, PART2_SUITE_NAME);
}

export function part2AggregateProvenanceKey(xml) {
    const suite = extractPart2SuiteBlock(xml) ?? xml;
    const systemOut = extractPart2TestcaseSystemOut(suite);
    if (!systemOut) {
        return { key: 'missing-system-out', hasFullCoverage: false };
    }
    const events = parsePart2ConsoleEvents(systemOut);
    const completed = events.PART2_RUN_COMPLETED ?? events.PART2_RUN_FAILED;
    const ar = events.PART2_ANALYSIS_REPORT_VERIFIED;
    const started = events.PART2_RUN_STARTED;
    const deferred =
        Array.isArray(started?.deferredCoverage) && started.deferredCoverage.includes('CIRS');
    const fullOutcomes = completed?.featureOutcomes?.cirsRecordNavigation !== undefined;
    const key = JSON.stringify({
        resultsPart2Sha256: null,
        runOutputRoot: ar?.runOutputRoot ?? null,
        featureOutcomes: completed?.featureOutcomes ?? null,
        suiteTimestamp: suite.match(/timestamp="([^"]*)"/)?.[1] ?? null,
    });
    return {
        key,
        hasFullCoverage: Boolean(fullOutcomes && !deferred),
        runOutputRoot: ar?.runOutputRoot ?? null,
        suiteTimestamp: suite.match(/timestamp="([^"]*)"/)?.[1] ?? null,
        deferredCirsInStarted: deferred,
    };
}

/**
 * Reject mixing an old aggregate in results.xml with a different Part 2 evidence source.
 */
/**
 * Prefer derived Part 2 JUnit over a stale placeholder results-part2.xml.
 * When combined results are already enriched, pick a source file that matches aggregate provenance.
 */
export function pickPart2JUnitSourcePath({ repoRoot, resultsDir = repoRoot, combinedXml = null } = {}) {
    if (process.env.SMOKE_PART2_JUNIT_SOURCE) {
        return path.resolve(process.env.SMOKE_PART2_JUNIT_SOURCE);
    }
    const candidates = [
        path.join(resultsDir, 'results-part2-derived.xml'),
        path.join(repoRoot, 'results-part2-derived.xml'),
        path.join(resultsDir, 'results-part2.xml'),
        path.join(repoRoot, 'results-part2.xml'),
    ].filter((candidate, index, all) => fs.existsSync(candidate) && all.indexOf(candidate) === index);

    if (combinedXml) {
        const combined = part2AggregateProvenanceKey(combinedXml);
        const repoPart2 = path.join(repoRoot, 'results-part2.xml');
        if (fs.existsSync(repoPart2)) {
            const source = part2AggregateProvenanceKey(fs.readFileSync(repoPart2, 'utf8'));
            if (source.key === combined.key) {
                return repoPart2;
            }
        }
        const aligned = candidates.find((candidate) => {
            const source = part2AggregateProvenanceKey(fs.readFileSync(candidate, 'utf8'));
            return source.key === combined.key;
        });
        if (aligned) {
            return aligned;
        }
        if (combined.hasFullCoverage) {
            return null;
        }
    }

  const withCoverage = candidates.find((candidate) => part2AggregateProvenanceKey(fs.readFileSync(candidate, 'utf8')).hasFullCoverage);
    return withCoverage ?? candidates[0] ?? path.join(repoRoot, 'results-part2.xml');
}

export function assertPart2SubmitProvenanceAligned(combinedXml, part2SourceXml, { explicitSource = false } = {}) {
    const combined = part2AggregateProvenanceKey(combinedXml);
    const source = part2AggregateProvenanceKey(part2SourceXml);
    if (combined.key === source.key) {
        return { replaced: false, combined, source };
    }
    if (!explicitSource) {
        throw new Error(
            `Part 2 provenance mismatch: results.xml aggregate does not match Part 2 JUnit source (combined suite ${combined.suiteTimestamp ?? '?'} vs source ${source.suiteTimestamp ?? '?'}). Set SMOKE_PART2_JUNIT_SOURCE to the intended results-part2*.xml or re-combine before submit.`
        );
    }
    return {
        replaced: true,
        combined,
        source,
        note: 'Replacing Part 2 suite in combined JUnit from explicit Part 2 source.',
    };
}

export function replacePart2SuiteInCombined(combinedXml, part2SourceXml) {
    const sourceSuite = extractPart2SuiteBlock(part2SourceXml);
    if (!sourceSuite) {
        throw new Error('Part 2 JUnit source missing fullE2ESmokePart2 testsuite.');
    }
    const combinedSuite = extractPart2SuiteBlock(combinedXml);
    if (!combinedSuite) {
        throw new Error('Combined JUnit missing Part 2 testsuite.');
    }
    return replaceXmlBlockOnce(combinedXml, combinedSuite, sourceSuite);
}

export function readPart1SuiteMeta(xml) {
    const tag = xml.match(/<testsuite\b[^>]*name="[^"]*fullE2ESmokePart1\.spec\.ts"[^>]*>/)?.[0];
    if (!tag) {
        return null;
    }
    const read = (attr) => tag.match(new RegExp(`${attr}="([^"]*)"`))?.[1] ?? null;
    return {
        timestamp: read('timestamp'),
        hostname: read('hostname'),
        tests: read('tests'),
        testcaseTime: xml.match(
            /<testcase\b[^>]*name="fullE2ESmokePart1"[^>]*time="([^"]*)"/
        )?.[1],
    };
}
