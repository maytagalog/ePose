#!/usr/bin/env node
/**
 * Build derived Part 2 TestMo sidecar/JUnit from retained console evidence (no staging run).
 * Does not modify the original results-part2.xml.
 */
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPart2CoverageFromSystemOut, parsePart2ConsoleEvents } from './part2TestmoCoverageFromEvents.mjs';
import { writePart2TestmoSidecar } from './part2TestmoReporting.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function runOutputRootToSuiteTimestamp(runOutputRoot) {
    if (!runOutputRoot) {
        return null;
    }
    const base = path.basename(runOutputRoot.replace(/\\/g, '/'));
    const m = base.match(/^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
    if (!m) {
        return null;
    }
    return `${m[1]}${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}

/** @typedef {{ accountEmail: string, runOutputRoot: string | null, sourceCustomerId: string | null, sourceAnalysisId: string | null, featureOutcomes: object | null }} Part2RunFingerprint */

/**
 * @param {Record<string, unknown>} events
 * @returns {Part2RunFingerprint | null}
 */
export function part2RunFingerprintFromEvents(events) {
    const completed = events.PART2_RUN_COMPLETED ?? events.PART2_RUN_FAILED;
    let accountEmail =
        completed && typeof completed === 'object' && typeof completed.accountEmail === 'string'
            ? completed.accountEmail
            : null;
    if (!accountEmail) {
        for (const payload of Object.values(events)) {
            if (payload && typeof payload === 'object' && typeof payload.accountEmail === 'string') {
                accountEmail = payload.accountEmail;
                break;
            }
        }
    }
    if (!accountEmail) {
        return null;
    }
    const ar = events.PART2_ANALYSIS_REPORT_VERIFIED;
    const cirs = events.PART2_CIRS_RECORD_NAVIGATION_VERIFIED;
    return {
        accountEmail,
        runOutputRoot: ar?.runOutputRoot ?? null,
        sourceCustomerId: ar?.sourceCustomerId ?? cirs?.customerId ?? null,
        sourceAnalysisId: ar?.sourceAnalysisId ?? null,
        featureOutcomes:
            completed &&
            typeof completed === 'object' &&
            completed.featureOutcomes &&
            typeof completed.featureOutcomes === 'object'
                ? completed.featureOutcomes
                : null,
    };
}

/**
 * @param {Part2RunFingerprint | null} anchor
 * @param {Part2RunFingerprint | null} other
 * @param {{ label?: string }} [opts]
 */
export function assertPart2RunFingerprintsCompatible(anchor, other, opts = {}) {
    if (!anchor || !other) {
        return;
    }
    const label = opts.label ? ` (${opts.label})` : '';
    if (anchor.accountEmail !== other.accountEmail) {
        throw new Error(
            `Part 2 console${label}: accountEmail mismatch (${anchor.accountEmail} vs ${other.accountEmail}).`
        );
    }
    if (anchor.runOutputRoot && other.runOutputRoot && anchor.runOutputRoot !== other.runOutputRoot) {
        throw new Error(
            `Part 2 console${label}: runOutputRoot mismatch (${anchor.runOutputRoot} vs ${other.runOutputRoot}).`
        );
    }
    if (
        anchor.sourceCustomerId &&
        other.sourceCustomerId &&
        anchor.sourceCustomerId !== other.sourceCustomerId
    ) {
        throw new Error(
            `Part 2 console${label}: customer id mismatch (${anchor.sourceCustomerId} vs ${other.sourceCustomerId}).`
        );
    }
    if (
        anchor.sourceAnalysisId &&
        other.sourceAnalysisId &&
        anchor.sourceAnalysisId !== other.sourceAnalysisId
    ) {
        throw new Error(
            `Part 2 console${label}: analysis id mismatch (${anchor.sourceAnalysisId} vs ${other.sourceAnalysisId}).`
        );
    }
    if (anchor.featureOutcomes && other.featureOutcomes) {
        const a = JSON.stringify(anchor.featureOutcomes);
        const b = JSON.stringify(other.featureOutcomes);
        if (a !== b) {
            throw new Error(
                `Part 2 console${label}: PART2_RUN_COMPLETED featureOutcomes differ for the same execution.`
            );
        }
    }
}

/**
 * @param {string} text
 * @returns {{ event: string, line: string }[]}
 */
export function collectPart2EventLines(text) {
    const lines = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line.startsWith('PART2_')) {
            continue;
        }
        const event = line.split(/\s+/)[0];
        if (!event) {
            continue;
        }
        lines.push({ event, line });
    }
    return lines;
}

function part2LinesFromText(text) {
    return collectPart2EventLines(text).map((entry) => entry.line);
}

function choosePrimaryTextIndex(texts) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < texts.length; i += 1) {
        const events = parsePart2ConsoleEvents(part2LinesFromText(texts[i]).join('\n'));
        const fp = part2RunFingerprintFromEvents(events);
        const lineCount = collectPart2EventLines(texts[i]).length;
        const hasCompleted = events.PART2_RUN_COMPLETED ? 16 : 0;
        const score = lineCount + hasCompleted + (fp?.runOutputRoot ? 8 : 0);
        if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    return bestIndex;
}

/**
 * Merge PART2_* lines from one or more console fragments of the **same** execution.
 * Rejects unrelated runs and conflicting duplicate event names (no "later file wins").
 *
 * @param {string[]} texts
 */
export function mergePart2ConsoleTexts(texts) {
    if (!texts.length) {
        throw new Error('No console text provided.');
    }
    if (texts.length === 1) {
        return part2LinesFromText(texts[0]).join('\n');
    }

    const fingerprints = texts.map((text, index) => {
        const body = part2LinesFromText(text).join('\n');
        const events = parsePart2ConsoleEvents(body);
        return { index, events, fingerprint: part2RunFingerprintFromEvents(events), text };
    });

    const anchor =
        fingerprints.find((f) => f.events.PART2_RUN_COMPLETED)?.fingerprint ??
        fingerprints.find((f) => f.fingerprint)?.fingerprint ??
        null;

    for (const f of fingerprints) {
        if (!f.fingerprint) {
            continue;
        }
        assertPart2RunFingerprintsCompatible(anchor, f.fingerprint, {
            label: `fragment ${f.index + 1}`,
        });
    }

    const byEvent = new Map();
    for (const f of fingerprints) {
        for (const { event, line } of collectPart2EventLines(f.text)) {
            const existing = byEvent.get(event);
            if (existing && existing !== line) {
                throw new Error(
                    `Conflicting ${event} across console fragments; cannot merge unrelated or superseded runs.`
                );
            }
            if (!existing) {
                byEvent.set(event, line);
            }
        }
    }

    const primaryIndex = choosePrimaryTextIndex(texts);
    const ordered = [];
    const seen = new Set();
    for (const { event } of collectPart2EventLines(texts[primaryIndex])) {
        if (seen.has(event)) {
            continue;
        }
        const line = byEvent.get(event);
        if (line) {
            ordered.push(line);
            seen.add(event);
        }
    }
    for (const [event, line] of byEvent) {
        if (!seen.has(event)) {
            ordered.push(line);
            seen.add(event);
        }
    }
    return ordered.join('\n');
}

export function reconstructPart2DerivedFromConsoleText(consoleText, options = {}) {
    const systemOutBody = mergePart2ConsoleTexts([consoleText]);
    if (!systemOutBody.includes('PART2_RUN_COMPLETED') && !systemOutBody.includes('PART2_RUN_FAILED')) {
        throw new Error('Console evidence missing PART2_RUN_COMPLETED or PART2_RUN_FAILED.');
    }
    const coverage = buildPart2CoverageFromSystemOut(systemOutBody, { markDerived: true });
    if (!coverage) {
        throw new Error('Unable to build Part 2 coverage from console evidence.');
    }
    const events = parsePart2ConsoleEvents(systemOutBody);
    const ar = events.PART2_ANALYSIS_REPORT_VERIFIED;
    const timestamp =
        options.suiteTimestamp ??
        runOutputRootToSuiteTimestamp(ar?.runOutputRoot) ??
        '1970-01-01T00:00:00.000Z';
    const derivedJUnit = `<testsuites id="" name="" tests="1" failures="0" skipped="0" errors="0" time="0">
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" timestamp="${timestamp}" hostname="chromium" tests="1" failures="0" skipped="0" errors="0" time="0">
<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="0">
<system-out><![CDATA[${systemOutBody}
]]></system-out>
</testcase>
</testsuite>
</testsuites>`;

    const outDir = options.outDir ?? REPO_ROOT;
    const derivedPart2Path = path.join(outDir, 'results-part2-derived.xml');
    const derivedSidecarPath = path.join(outDir, 'results-part2-derived-testmo.json');

    fs.writeFileSync(derivedPart2Path, derivedJUnit, 'utf8');
    const { sidecar } = writePart2TestmoSidecar(derivedPart2Path, {
        repoRoot: REPO_ROOT,
        outPath: derivedSidecarPath,
    });

    return {
        derivedPart2Path,
        derivedSidecarPath,
        coverage,
        events,
        sidecar,
        runFingerprint: part2RunFingerprintFromEvents(events),
        note: 'Derived artifact only; original results-part2.xml unchanged. Durations are not invented (time=0).',
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const inputs = process.argv.slice(2);
    if (inputs.length === 0) {
        console.error(
            'Usage: node scripts/reconstructPart2DerivedReporting.mjs <console-log.txt> [more-logs...]'
        );
        process.exit(1);
    }
    const texts = inputs.map((p) => fs.readFileSync(path.resolve(p), 'utf8'));
    const merged = mergePart2ConsoleTexts(texts);
    const result = reconstructPart2DerivedFromConsoleText(merged, {});
    console.log(JSON.stringify(result, null, 2));
}
