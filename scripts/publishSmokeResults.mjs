#!/usr/bin/env node
/**
 * Publish smoke JUnit artifacts to repo root (results.xml, results-part1.xml, results-part2.xml).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildPartOnlyJUnitFile,
    extractPart1SuiteBlock,
    extractPart2SuiteBlock,
    extractParallelSmokeSuites,
    normalizeParallelCombinedJUnit,
    readSuiteBlockMeta,
} from './smokeJUnitExtract.mjs';
import { formatManilaTimestamp, validateSmokeResultsXml } from './submitSmokeResults.mjs';
import { loadResultsRootState, saveResultsRootState, sha256Hex } from './resultsRootState.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT_DEFAULT = path.resolve(__dirname, '..');

export const ROOT_ARTIFACT_NAMES = ['results.xml', 'results-part1.xml', 'results-part2.xml'];

export function atomicWriteFile(filePath, content) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
}

export function backupRootArtifacts(repoRoot, backupDir, names = ROOT_ARTIFACT_NAMES, now = new Date()) {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = formatManilaTimestamp(now);
    const backedUp = [];
    for (const name of names) {
        const src = path.join(repoRoot, name);
        if (!fs.existsSync(src)) {
            continue;
        }
        let dest = path.join(backupDir, `${name.replace('.xml', '')}-pre-publish-${stamp}.xml`);
        if (fs.existsSync(dest)) {
            dest = `${dest.replace(/\.xml$/, '')}-${now.getTime()}.xml`;
        }
        fs.copyFileSync(src, dest);
        backedUp.push({ name, backupPath: dest });
    }
    return backedUp;
}

function publicationProvenancePath(repoRoot) {
    return path.join(repoRoot, 'results-publication-provenance.json');
}

function combinedProvenancePath(repoRoot) {
    return path.join(repoRoot, 'results-combined-provenance.json');
}

function writePublicationProvenance(repoRoot, doc) {
    atomicWriteFile(publicationProvenancePath(repoRoot), `${JSON.stringify(doc, null, 2)}\n`);
}

function buildFileRecord(filePath, extra = {}) {
    const xml = fs.readFileSync(filePath, 'utf8');
    const stat = fs.statSync(filePath);
    return {
        path: filePath,
        sha256: sha256Hex(xml),
        fileModifiedIso: stat.mtime.toISOString(),
        ...extra,
    };
}

export function validateCombinedSmokeJUnitForPublish(xml) {
    const { part1Suite, part2Suite } = extractParallelSmokeSuites(xml);
    readSuiteBlockMeta(part1Suite);
    readSuiteBlockMeta(part2Suite);
    return validateSmokeResultsXml(normalizeParallelCombinedJUnit(xml));
}

export function validatePartOnlyJUnitForPublish(xml, part) {
    const suite = part === 1 ? extractPart1SuiteBlock(xml) : extractPart2SuiteBlock(xml);
    if (!suite) {
        throw new Error(`Part ${part} JUnit missing fullE2ESmokePart${part} testsuite.`);
    }
    readSuiteBlockMeta(suite);
    return { suite, meta: readSuiteBlockMeta(suite) };
}

/**
 * Parallel Part 1+2 run: publish combined aggregate + aligned part files.
 */
export function publishParallelSmokeRun({
    repoRoot = REPO_ROOT_DEFAULT,
    combinedXml,
    runMeta = null,
    backupDir = path.join(repoRoot, 'results-backups'),
    now = new Date(),
}) {
    if (!combinedXml?.trim()) {
        throw new Error('Missing combined JUnit XML for parallel publish.');
    }
    validateCombinedSmokeJUnitForPublish(combinedXml);
    const normalizedCombined = normalizeParallelCombinedJUnit(combinedXml);
    const { part1Suite, part2Suite } = extractParallelSmokeSuites(normalizedCombined);
    const part1Xml = buildPartOnlyJUnitFile(part1Suite);
    const part2Xml = buildPartOnlyJUnitFile(part2Suite);
    const part1Meta = readSuiteBlockMeta(part1Suite);
    const part2Meta = readSuiteBlockMeta(part2Suite);

    const backedUp = backupRootArtifacts(repoRoot, backupDir, ROOT_ARTIFACT_NAMES, now);
    const outCombined = path.join(repoRoot, 'results.xml');
    const outPart1 = path.join(repoRoot, 'results-part1.xml');
    const outPart2 = path.join(repoRoot, 'results-part2.xml');

    atomicWriteFile(outCombined, normalizedCombined);
    atomicWriteFile(outPart1, part1Xml);
    atomicWriteFile(outPart2, part2Xml);

    const alignedInputSha256 = crypto
        .createHash('sha256')
        .update(`${sha256Hex(part1Xml)}:${sha256Hex(part2Xml)}`)
        .digest('hex');

    const publication = {
        schemaVersion: 1,
        publishedAt: now.toISOString(),
        publicationKind: 'parallel_single_run',
        executionMode: 'parallel',
        aggregateReady: true,
        recombinationRequired: false,
        runId: runMeta?.runId ?? null,
        runRoot: runMeta?.runRoot ?? null,
        smokeParts: runMeta?.smokeParts ?? [1, 2],
        alignedInputSha256,
        files: {
            'results.xml': buildFileRecord(outCombined, { role: 'aggregate' }),
            'results-part1.xml': buildFileRecord(outPart1, {
                role: 'part1',
                smokeRunId: runMeta?.runId ?? null,
                ...part1Meta,
            }),
            'results-part2.xml': buildFileRecord(outPart2, {
                role: 'part2',
                smokeRunId: runMeta?.runId ?? null,
                ...part2Meta,
            }),
        },
        note: 'Published from one parallel smoke execution; part files extracted losslessly from aggregate.',
    };
    writePublicationProvenance(repoRoot, publication);

    const rootState = {
        schemaVersion: 1,
        updatedAt: now.toISOString(),
        aggregateReady: true,
        recombinationRequired: false,
        executionMode: 'parallel',
        publicationKind: 'parallel_single_run',
        alignedInputSha256,
        files: {
            'results.xml': { sha256: publication.files['results.xml'].sha256 },
            'results-part1.xml': { sha256: publication.files['results-part1.xml'].sha256 },
            'results-part2.xml': { sha256: publication.files['results-part2.xml'].sha256 },
        },
        runId: runMeta?.runId ?? null,
    };
    saveResultsRootState(rootState, repoRoot, backupDir);

    return {
        backedUp,
        publication,
        paths: { combined: outCombined, part1: outPart1, part2: outPart2 },
        part1Meta,
        part2Meta,
    };
}

/**
 * Single-part diagnostic rerun: update one part file; mark aggregate stale until combine.
 */
export function publishSinglePartSmokeRun({
    repoRoot = REPO_ROOT_DEFAULT,
    part,
    partXml,
    runMeta = null,
    backupDir = path.join(repoRoot, 'results-backups'),
    now = new Date(),
}) {
    if (part !== 1 && part !== 2) {
        throw new Error(`Invalid smoke part ${part}; expected 1 or 2.`);
    }
    const { meta } = validatePartOnlyJUnitForPublish(partXml, part);
    const fileName = part === 1 ? 'results-part1.xml' : 'results-part2.xml';
    const backedUp = backupRootArtifacts(repoRoot, backupDir, [fileName], now);
    const target = path.join(repoRoot, fileName);
    const normalized =
        part === 1
            ? buildPartOnlyJUnitFile(extractPart1SuiteBlock(partXml))
            : buildPartOnlyJUnitFile(extractPart2SuiteBlock(partXml));
    atomicWriteFile(target, normalized);

    const prior = loadResultsRootState(repoRoot, backupDir) ?? {};
    const otherKey = part === 1 ? 'results-part2.xml' : 'results-part1.xml';
    const otherPath = path.join(repoRoot, otherKey);
    const otherSha = fs.existsSync(otherPath) ? sha256Hex(fs.readFileSync(otherPath, 'utf8')) : null;

    const rootState = {
        schemaVersion: 1,
        updatedAt: now.toISOString(),
        aggregateReady: false,
        recombinationRequired: true,
        staleReason: `${fileName} updated from run ${runMeta?.runId ?? 'unknown'}; results.xml not recombined`,
        executionMode: prior.executionMode ?? null,
        publicationKind: 'single_part_rerun',
        files: {
            [fileName]: { sha256: sha256Hex(normalized), ...meta, smokeRunId: runMeta?.runId ?? null },
            ...(otherSha ? { [otherKey]: { sha256: otherSha, preserved: true } } : {}),
        },
        runId: runMeta?.runId ?? null,
    };
    saveResultsRootState(rootState, repoRoot, backupDir);

    const publication = {
        schemaVersion: 1,
        publishedAt: now.toISOString(),
        publicationKind: 'single_part_rerun',
        part,
        aggregateReady: false,
        recombinationRequired: true,
        runId: runMeta?.runId ?? null,
        runRoot: runMeta?.runRoot ?? null,
        files: {
            [fileName]: buildFileRecord(target, { ...meta, smokeRunId: runMeta?.runId ?? null }),
        },
        note: 'Single part published; run node scripts/combineSmokeResults.mjs before preview/submit.',
    };
    writePublicationProvenance(repoRoot, publication);

    return { backedUp, publication, path: target, meta };
}

export function publishSmokeDiagnosticRun({
    repoRoot = REPO_ROOT_DEFAULT,
    runRoot,
    junitPath,
    smokeParts,
    meta = null,
    backupDir = path.join(repoRoot, 'results-backups'),
}) {
    if (!fs.existsSync(junitPath)) {
        throw new Error(`JUnit not found: ${junitPath}`);
    }
    const xml = fs.readFileSync(junitPath, 'utf8');
    const runMeta = meta ?? (fs.existsSync(path.join(runRoot, 'smoke-run.meta.json'))
        ? JSON.parse(fs.readFileSync(path.join(runRoot, 'smoke-run.meta.json'), 'utf8'))
        : null);

    const parts = smokeParts ?? runMeta?.smokeParts ?? [1, 2];
    const now = new Date();

    if (parts.length === 2) {
        return {
            mode: 'parallel',
            ...publishParallelSmokeRun({
                repoRoot,
                combinedXml: xml,
                runMeta: { ...runMeta, runRoot },
                backupDir,
                now,
            }),
        };
    }
    const part = parts[0];
    return {
        mode: 'single-part',
        ...publishSinglePartSmokeRun({
            repoRoot,
            part,
            partXml: xml,
            runMeta: { ...runMeta, runRoot },
            backupDir,
            now,
        }),
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const junitPath = path.resolve(process.argv[2] ?? '');
    const runRoot = path.resolve(process.argv[3] ?? path.dirname(junitPath));
    try {
        const result = publishSmokeDiagnosticRun({ runRoot, junitPath, repoRoot: REPO_ROOT_DEFAULT });
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}