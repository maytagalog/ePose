#!/usr/bin/env node
/**
 * Part 2 TestMo sidecar + artifact freshness (same invocation as results-part2.xml).
 * Does not alter JUnit testcase identity or combined results.xml shape.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPart2CoverageFromSystemOut, parsePart2ConsoleEvents } from './part2TestmoCoverageFromEvents.mjs';
import {
    derivePart2RunIdentity,
    parsePlaywrightAttachmentLines,
    resolvePart2ArtifactManifest,
} from './part2TestmoArtifacts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SECRET_PATH = /(password|token|secret|credential|\.env|testmoToken)/i;

export function readPart2SuiteMeta(xml) {
    const suiteRe = /<testsuite\b[^>]*name="[^"]*fullE2ESmokePart2\.spec\.ts"[^>]*>/;
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

export function extractPart2TestcaseSystemOut(xml) {
    const suiteRe = /<testsuite\b[^>]*name="[^"]*fullE2ESmokePart2\.spec\.ts"[^>]*>[\s\S]*?<\/testsuite>/;
    const suite = xml.match(suiteRe)?.[0];
    if (!suite) {
        return null;
    }
    const aggregate = suite.match(
        /<testcase\b[^>]*name="fullE2ESmokePart2"[^>]*>[\s\S]*?<\/testcase>/i
    )?.[0];
    if (!aggregate) {
        return null;
    }
    const out = aggregate.match(/<system-out>([\s\S]*?)<\/system-out>/i)?.[1];
    return out ?? null;
}

export function parsePart2TestmoCoverageFromSystemOut(systemOut) {
    return buildPart2CoverageFromSystemOut(systemOut);
}

export function writePart2TestmoSidecar(resultsPart2Path, options = {}) {
    const repoRoot = options.repoRoot ?? REPO_ROOT;
    const xml = fs.readFileSync(resultsPart2Path, 'utf8');
    const junitStat = fs.statSync(resultsPart2Path);
    const systemOut = extractPart2TestcaseSystemOut(xml);
    const suiteMeta = readPart2SuiteMeta(xml);
    const resultsPart2Sha256 = crypto.createHash('sha256').update(xml).digest('hex');
    const events = parsePart2ConsoleEvents(systemOut);
    const coverage = buildPart2CoverageFromSystemOut(systemOut, {
        markDerived: !systemOut?.includes('PART2_TESTMO_COVERAGE '),
    });
    const junitAttachmentLines = parsePlaywrightAttachmentLines(systemOut);
    const runIdentity = derivePart2RunIdentity({
        systemOut,
        resultsPart2Sha256,
        suiteTimestamp: suiteMeta?.timestamp ?? null,
        derived: Boolean(coverage?.derived),
        events,
    });
    const artifacts = resolvePart2ArtifactManifest({
        repoRoot,
        runIdentity,
        junitAttachmentLines,
        coverageArtifacts: coverage?.artifacts ?? [],
    });

    const sidecar = {
        generatedAt: new Date().toISOString(),
        resultsPart2: resultsPart2Path,
        resultsPart2Sha256,
        junitMtimeIso: junitStat.mtime.toISOString(),
        runIdentity,
        coverage: coverage ? { ...coverage, artifacts, runIdentity } : null,
        artifacts,
        testmoSubmit: {
            aggregateJUnitIdentity: { name: 'fullE2ESmokePart2', classname: 'e2e/fullE2ESmokePart2.spec.ts' },
            featureClassname: 'e2e/part2SmokeTestmoFeature.spec.ts',
            featureDelivery: 'Injected at submit via scripts/buildTestmoSubmitJUnit.mjs',
            attachmentDelivery:
                '[[ATTACHMENT|repo-relative-path]] on feature testcase system-out when file exists and runId matches',
            manualGap:
                'Files not on disk or without runId match are listed in sidecar only; not uploaded by CLI.',
        },
    };

    const outPath = options.outPath ?? path.join(path.dirname(resultsPart2Path), 'results-part2-testmo.json');
    fs.writeFileSync(outPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
    return { outPath, sidecar };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const resultsPath = process.argv[2] ?? path.join(REPO_ROOT, 'results-part2.xml');
    if (!fs.existsSync(resultsPath)) {
        console.error(`Missing ${resultsPath}`);
        process.exit(1);
    }
    const { outPath } = writePart2TestmoSidecar(resultsPath);
    console.log(`Wrote ${outPath}`);
}
