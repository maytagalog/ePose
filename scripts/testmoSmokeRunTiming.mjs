import fs from 'node:fs';
import path from 'node:path';
import { PART1_FEATURE_CLASSNAME, PART1_AGGREGATE_TESTNAME } from './part1TestmoConstants.mjs';
import { PART2_AGGREGATE_TESTNAME, PART2_FEATURE_CLASSNAME } from './part2TestmoConstants.mjs';
import { parseTestsuitesRoot, splitTopLevelTestsuites, splitTopLevelTestcases } from './junitCounts.mjs';
import { readPart1SuiteMeta } from './part2SubmitProvenance.mjs';
import { readPart2SuiteMeta } from './part2TestmoReporting.mjs';

export const EXECUTION_MODE_PARALLEL = 'parallel';
export const EXECUTION_MODE_SEQUENTIAL = 'sequential';

function readProvenanceJson(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

export function loadCombinedProvenance(resultsDir) {
    const publication = readProvenanceJson(path.join(resultsDir, 'results-publication-provenance.json'));
    const combined = readProvenanceJson(path.join(resultsDir, 'results-combined-provenance.json'));

    if (
        publication?.publicationKind === 'parallel_single_run' &&
        publication.recombinationRequired !== true
    ) {
        return publication;
    }
    if (combined) {
        return combined;
    }
    if (publication?.recombinationRequired) {
        return { ...publication, executionMode: EXECUTION_MODE_SEQUENTIAL };
    }
    return publication;
}

export function extractSmokeRunMetaFromCombinedXml(combinedXml) {
    const match = combinedXml.match(/SMOKE_EVIDENCE_PERSISTED\s+\{"relativePath":"([^"]+)"/);
    if (!match) {
        return null;
    }
    const rel = match[1];
    const runRoot = path.dirname(path.dirname(rel));
    return path.join(runRoot, 'smoke-run.meta.json');
}

export function resolveSmokeRunMeta({ resultsPath, combinedXml, repoRoot }) {
    const resultsDir = path.dirname(path.resolve(resultsPath));
    const adjacent = path.join(resultsDir, 'smoke-run.meta.json');
    if (fs.existsSync(adjacent)) {
        return JSON.parse(fs.readFileSync(adjacent, 'utf8'));
    }
    const relMeta = extractSmokeRunMetaFromCombinedXml(combinedXml);
    if (relMeta) {
        const absolute = path.isAbsolute(relMeta) ? relMeta : path.join(repoRoot, relMeta);
        if (fs.existsSync(absolute)) {
            return JSON.parse(fs.readFileSync(absolute, 'utf8'));
        }
    }
    return null;
}

function readAggregateTestcaseTime(xml, testName) {
    const re = new RegExp(
        `<testcase\\b[^>]*name="${testName}"[^>]*time="([^"]*)"`,
        'm'
    );
    const value = Number(re.exec(xml)?.[1]);
    return Number.isFinite(value) ? value : null;
}

export function extractPartAggregateDurations(combinedXml) {
    return {
        part1: readAggregateTestcaseTime(combinedXml, PART1_AGGREGATE_TESTNAME),
        part2: readAggregateTestcaseTime(combinedXml, PART2_AGGREGATE_TESTNAME),
    };
}

export function sumFeatureTimesBySuite(submitXml) {
    const root = parseTestsuitesRoot(submitXml.trim());
    if (!root) {
        return { total: 0, part1: 0, part2: 0, part1Cases: 0, part2Cases: 0 };
    }
    let part1 = 0;
    let part2 = 0;
    let part1Cases = 0;
    let part2Cases = 0;
    for (const suite of splitTopLevelTestsuites(root.inner)) {
        const name = suite.match(/\bname="([^"]*)"/)?.[1] ?? '';
        const inner = suite.slice(suite.indexOf('>') + 1, -'</testsuite>'.length);
        const blocks = splitTopLevelTestcases(inner);
        let sum = 0;
        for (const block of blocks) {
            const t = Number(block.match(/\btime="([^"]*)"/)?.[1]);
            if (Number.isFinite(t)) {
                sum += t;
            }
        }
        if (name === PART1_FEATURE_CLASSNAME) {
            part1 = sum;
            part1Cases = blocks.length;
        } else if (name === PART2_FEATURE_CLASSNAME) {
            part2 = sum;
            part2Cases = blocks.length;
        }
    }
    return { total: part1 + part2, part1, part2, part1Cases, part2Cases };
}

/**
 * @returns {'parallel' | 'sequential'}
 */
function inferParallelFromJUnitWallClock(combinedXml) {
    const partMeasured = extractPartAggregateDurations(combinedXml);
    const partSum = (partMeasured.part1 ?? 0) + (partMeasured.part2 ?? 0);
    const longestPart = Math.max(partMeasured.part1 ?? 0, partMeasured.part2 ?? 0);
    const rootTime = Number(combinedXml.match(/<testsuites\b[^>]*\btime="([^"]*)"/)?.[1]);
    if (partSum > 0 && longestPart > 0 && Number.isFinite(rootTime) && rootTime > 0) {
        const nearLongest = rootTime <= longestPart * 1.08 + 10;
        const nearSum = rootTime >= partSum * 0.92;
        return nearLongest && !nearSum;
    }
    return false;
}

export function detectSmokeExecutionMode({ combinedXml, provenance = null, smokeMeta = null }) {
    if (smokeMeta?.executionMode === EXECUTION_MODE_PARALLEL) {
        return EXECUTION_MODE_PARALLEL;
    }
    if (smokeMeta?.executionMode === EXECUTION_MODE_SEQUENTIAL) {
        return EXECUTION_MODE_SEQUENTIAL;
    }
    if (inferParallelFromJUnitWallClock(combinedXml)) {
        return EXECUTION_MODE_PARALLEL;
    }
    if (provenance?.executionMode === EXECUTION_MODE_SEQUENTIAL) {
        return EXECUTION_MODE_SEQUENTIAL;
    }
    if (provenance?.executionMode === EXECUTION_MODE_PARALLEL) {
        return EXECUTION_MODE_PARALLEL;
    }
    if (
        provenance?.note &&
        typeof provenance.note === 'string' &&
        provenance.note.includes('separate executions')
    ) {
        return EXECUTION_MODE_SEQUENTIAL;
    }
    if (combinedXml.includes('Combined staging smoke (separate Part 1 and Part 2 executions)')) {
        return EXECUTION_MODE_SEQUENTIAL;
    }

    const partMeasured = extractPartAggregateDurations(combinedXml);
    const partSum = (partMeasured.part1 ?? 0) + (partMeasured.part2 ?? 0);
    const longestPart = Math.max(partMeasured.part1 ?? 0, partMeasured.part2 ?? 0);
    const rootTime = Number(combinedXml.match(/<testsuites\b[^>]*\btime="([^"]*)"/)?.[1]);
    if (partSum > 0 && longestPart > 0 && Number.isFinite(rootTime) && rootTime > 0) {
        const nearSum = rootTime >= partSum * 0.92;
        if (nearSum) {
            return EXECUTION_MODE_SEQUENTIAL;
        }
    }

    if (
        smokeMeta?.smokeParts &&
        Array.isArray(smokeMeta.smokeParts) &&
        smokeMeta.smokeParts.includes(1) &&
        smokeMeta.smokeParts.includes(2) &&
        Number(smokeMeta.workers ?? 1) >= 2
    ) {
        const part1Meta = readPart1SuiteMeta(combinedXml);
        const part2Meta = readPart2SuiteMeta(combinedXml);
        if (part1Meta?.timestamp && part2Meta?.timestamp && part1Meta.timestamp === part2Meta.timestamp) {
            return EXECUTION_MODE_PARALLEL;
        }
    }

    const part1Meta = readPart1SuiteMeta(combinedXml);
    const part2Meta = readPart2SuiteMeta(combinedXml);
    if (part1Meta?.timestamp && part2Meta?.timestamp) {
        const t1 = Date.parse(part1Meta.timestamp);
        const t2 = Date.parse(part2Meta.timestamp);
        const part1Duration = partMeasured.part1 ?? 0;
        if (Number.isFinite(t1) && Number.isFinite(t2) && part1Duration > 0) {
            const gapMs = t2 - t1;
            if (gapMs >= part1Duration * 1000 * 0.5) {
                return EXECUTION_MODE_SEQUENTIAL;
            }
        }
    }

    return EXECUTION_MODE_SEQUENTIAL;
}

export function resolveWallClockDurationSeconds({ combinedXml, provenance, smokeMeta, partMeasured }) {
    const junitRootTime = Number(combinedXml.match(/<testsuites\b[^>]*\btime="([^"]*)"/)?.[1]);
    if (smokeMeta?.startedAt && Number.isFinite(junitRootTime) && junitRootTime > 0) {
        return {
            wallClockDurationSeconds: junitRootTime,
            wallClockLabel: 'smoke_runner_wall_clock_seconds',
            wallClockSource: 'playwright.junit.testsuites.time with smoke-run.meta.json startedAt',
            wallClockStartedAt: smokeMeta.startedAt,
            smokeRunId: smokeMeta.runId ?? null,
        };
    }
    if (Number.isFinite(provenance?.aggregateTime) && provenance.aggregateTime > 0) {
        return {
            wallClockDurationSeconds: provenance.aggregateTime,
            wallClockLabel: 'combined_sequential_wall_clock_seconds',
            wallClockSource: 'results-combined-provenance.json aggregateTime (sequential Part 1 then Part 2)',
            wallClockStartedAt: null,
            smokeRunId: null,
        };
    }
    const sumParts = (partMeasured.part1 ?? 0) + (partMeasured.part2 ?? 0);
    if (sumParts > 0) {
        return {
            wallClockDurationSeconds: sumParts,
            wallClockLabel: 'aggregate_testcase_time_sum_seconds',
            wallClockSource: 'sum of fullE2ESmokePart1/2 aggregate testcase times (fallback)',
            wallClockStartedAt: null,
            smokeRunId: null,
        };
    }
    return {
        wallClockDurationSeconds: null,
        wallClockLabel: 'smoke_runner_wall_clock_seconds',
        wallClockSource: 'unavailable',
        wallClockStartedAt: null,
        smokeRunId: null,
    };
}

export function computeSmokeTimingSummary({
    combinedXml,
    submitXml,
    provenance = null,
    smokeMeta = null,
}) {
    const executionMode = detectSmokeExecutionMode({ combinedXml, provenance, smokeMeta });
    const partMeasured = extractPartAggregateDurations(combinedXml);
    const featureSums = sumFeatureTimesBySuite(submitXml);
    const wall = resolveWallClockDurationSeconds({ combinedXml, provenance, smokeMeta, partMeasured });

    const longestPart = Math.max(partMeasured.part1 ?? 0, partMeasured.part2 ?? 0);
    const sequentialPartSum = (partMeasured.part1 ?? 0) + (partMeasured.part2 ?? 0);

    const intendedTestmoRunDurationSeconds =
        executionMode === EXECUTION_MODE_PARALLEL ? longestPart : sequentialPartSum;

    const intendedReason =
        executionMode === EXECUTION_MODE_PARALLEL
            ? 'parallel: TestMo run:complete --no-measure-elapsed uses longest thread (max measured Part 1 vs Part 2 aggregate duration)'
            : 'sequential: single automation:run:submit; run elapsed follows combined part execution span';

    const singleSubmitFeatureSumSeconds = featureSums.total;
    const explainsIncorrectDisplay =
        executionMode === EXECUTION_MODE_PARALLEL &&
        singleSubmitFeatureSumSeconds > intendedTestmoRunDurationSeconds + 1;

    return {
        executionMode,
        featureDurationSumSeconds: {
            total: round3(featureSums.total),
            part1: round3(featureSums.part1),
            part2: round3(featureSums.part2),
        },
        partMeasuredDurationSeconds: {
            part1: partMeasured.part1 !== null ? round3(partMeasured.part1) : null,
            part2: partMeasured.part2 !== null ? round3(partMeasured.part2) : null,
        },
        wallClock: {
            label: wall.wallClockLabel,
            durationSeconds:
                wall.wallClockDurationSeconds !== null ? round3(wall.wallClockDurationSeconds) : null,
            source: wall.wallClockSource,
            startedAt: wall.wallClockStartedAt,
            smokeRunId: wall.smokeRunId,
        },
        intendedTestmoRunDurationSeconds: round3(intendedTestmoRunDurationSeconds),
        intendedTestmoRunDurationReason: intendedReason,
        parallelLongestPartSeconds:
            executionMode === EXECUTION_MODE_PARALLEL ? round3(longestPart) : null,
        sequentialPartSumSeconds:
            executionMode === EXECUTION_MODE_SEQUENTIAL ? round3(sequentialPartSum) : null,
        singleSubmitWouldUseFeatureSumSeconds: round3(singleSubmitFeatureSumSeconds),
        singleSubmitIncorrectForParallel: explainsIncorrectDisplay,
        note: explainsIncorrectDisplay
            ? 'Post-run automation:run:submit on the 41-case JUnit sums feature times (~13:57 for Nov 18), not parallel wall clock (~7:54). Use parallel threads + run:complete --no-measure-elapsed.'
            : null,
    };
}

function round3(n) {
    return Math.round(n * 1000) / 1000;
}

export function formatTimingPreviewForConsole(summary) {
    const longest =
        summary.parallelLongestPartSeconds !== null
            ? `${summary.parallelLongestPartSeconds}s (longest measured part, ~7:45 for Nov 18)`
            : null;
    const wall = summary.wallClock.durationSeconds
        ? `${summary.wallClock.durationSeconds}s (actual smoke wall clock, ~7:54 for Nov 18)`
        : 'unavailable';
    return {
        featureTimeSum: `${summary.featureDurationSumSeconds.part1}s (Part 1) + ${summary.featureDurationSumSeconds.part2}s (Part 2) = ${summary.featureDurationSumSeconds.total}s`,
        partMeasuredDurations: summary.partMeasuredDurationSeconds,
        longestPartMeasuredDuration: longest,
        actualSmokeWallClockDuration: wall,
        intendedTestmoRunDuration: `${summary.intendedTestmoRunDurationSeconds}s (${summary.executionMode}; parallel uses max thread elapsed)`,
        singleSubmitFeatureSum: `${summary.singleSubmitWouldUseFeatureSumSeconds}s (misleading run elapsed if used as single submit)`,
        testmoThreadElapsedMechanism:
            'JUnit testsuites @time → submit-thread elapsed_computed (not thread-resources fields)',
    };
}