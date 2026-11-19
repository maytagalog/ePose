import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATH = /(password|token|secret|credential|\.env|testmoToken|shared-report\?)/i;
const ATTACHMENT_LINE = /\[\[ATTACHMENT\|([^\]]+)\]\]/g;

/** @typedef {{ schemaVersion: 1, resultsPart2Sha256: string | null, suiteTimestamp: string | null, runOutputRoot: string | null, runId: string | null, derived: boolean }} Part2RunIdentity */

export function sha256Hex(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export function parsePlaywrightAttachmentLines(systemOut) {
    const found = [];
    if (!systemOut) {
        return found;
    }
    const text = systemOut.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
    let match;
    while ((match = ATTACHMENT_LINE.exec(text)) !== null) {
        found.push(match[1].replace(/\\/g, '/'));
    }
    return [...new Set(found)];
}

export function derivePart2RunIdentity({
    systemOut,
    resultsPart2Sha256,
    suiteTimestamp,
    derived = false,
    events = {},
}) {
    const ar = events.PART2_ANALYSIS_REPORT_VERIFIED ?? {};
    const runOutputRoot = typeof ar.runOutputRoot === 'string' ? ar.runOutputRoot : null;
    const runId = runOutputRoot ? path.basename(runOutputRoot.replace(/\\/g, '/')) : null;
    return {
        schemaVersion: 1,
        resultsPart2Sha256: resultsPart2Sha256 ?? null,
        suiteTimestamp: suiteTimestamp ?? null,
        runOutputRoot,
        runId,
        derived,
    };
}

function pathMatchesRunId(relativePath, runId) {
    if (!runId) {
        return false;
    }
    return relativePath.replace(/\\/g, '/').includes(runId);
}

function walkFiles(dir, maxDepth = 5, depth = 0) {
    if (depth > maxDepth || !fs.existsSync(dir)) {
        return [];
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(abs, maxDepth, depth + 1));
        } else {
            files.push(abs);
        }
    }
    return files;
}

const CASE_ATTACHMENT_HINTS = {
    analysisReportPdf: [/\.pdf$/i, /pdf\//i],
    analysisReportShareEmail: [/share.*email/i, /\.json$/i],
    analysisReportView: [/error-context\.md$/i, /trace\.zip$/i],
};

/**
 * Resolve artifacts for Part 2 / Analysis Report invocation using runId + Playwright manifest lines.
 */
export function resolvePart2ArtifactManifest({
    repoRoot,
    runIdentity,
    junitAttachmentLines = [],
    coverageArtifacts = [],
}) {
    const manifest = [];
    const runId = runIdentity.runId;
    const runRoot = runIdentity.runOutputRoot;

    const consider = (relativePath, kind, caseKeys = []) => {
        const norm = relativePath.replace(/\\/g, '/');
        if (SECRET_PATH.test(norm)) {
            manifest.push({ kind, relativePath: norm, included: false, reason: 'redacted pattern', caseKeys });
            return;
        }
        const abs = path.resolve(repoRoot, norm);
        const rel = path.relative(repoRoot, abs);
        if (rel.startsWith('..')) {
            manifest.push({ kind, relativePath: norm, included: false, reason: 'outside repository', caseKeys });
            return;
        }
        if (!fs.existsSync(abs)) {
            manifest.push({ kind, relativePath: norm, included: false, reason: 'missing', caseKeys });
            return;
        }
        if (runId && !pathMatchesRunId(norm, runId)) {
            manifest.push({
                kind,
                relativePath: norm,
                included: false,
                reason: 'runId mismatch',
                caseKeys,
            });
            return;
        }
        const stat = fs.statSync(abs);
        manifest.push({
            kind,
            relativePath: norm,
            included: true,
            sizeBytes: stat.size,
            caseKeys,
            delivery: 'junit-attachment-line',
        });
    };

    for (const line of junitAttachmentLines) {
        consider(line, 'playwright-junit-attachment', []);
    }

    if (runRoot) {
        const absRoot = path.resolve(repoRoot, runRoot);
        const relRoot = path.relative(repoRoot, absRoot);
        if (!relRoot.startsWith('..') && fs.existsSync(absRoot)) {
            for (const absFile of walkFiles(absRoot)) {
                const rel = path.relative(repoRoot, absFile).replace(/\\/g, '/');
                const base = path.basename(rel);
                let kind = 'run-output-file';
                if (base.endsWith('.pdf')) {
                    kind = 'analysis-report-pdf';
                } else if (base === 'analysis-report-full-smoke.json') {
                    kind = 'analysis-report-full-evidence';
                } else if (base.endsWith('.xml')) {
                    kind = 'junit';
                }
                const caseKeys = [];
                for (const [caseKey, patterns] of Object.entries(CASE_ATTACHMENT_HINTS)) {
                    if (patterns.some((p) => p.test(rel))) {
                        caseKeys.push(caseKey);
                    }
                }
                consider(rel, kind, caseKeys);
            }
        }
    }

    for (const ref of coverageArtifacts) {
        if (!ref?.relativePath) {
            continue;
        }
        consider(ref.relativePath, ref.kind ?? 'declared', []);
    }

    const seen = new Set();
    return manifest.filter((item) => {
        const id = `${item.relativePath}:${item.kind}`;
        if (seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });
}

export function attachmentsForCase(manifest, caseKey) {
    return manifest.filter(
        (item) =>
            item.included &&
            (item.caseKeys?.includes(caseKey) ||
                (caseKey === 'analysisReportPdf' && item.kind === 'analysis-report-pdf') ||
                (caseKey === 'analysisReportView' && item.kind === 'playwright-junit-attachment'))
    );
}
