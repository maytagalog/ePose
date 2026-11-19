import fs from 'node:fs';
import path from 'node:path';

export type SmokeCombinedRunMeta = {
    schemaVersion: 1;
    runId: string;
    runRoot: string;
    playwrightOutputDir: string;
    junitPath: string;
    startedAt: string;
    smokeParts: [1, 2];
    workers: 2;
    retries: 0;
    repeatEach: 1;
};

function defaultRunId(now = new Date()): string {
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const suffix = Math.random().toString(16).slice(2, 10);
    return `${stamp}-chromium-${suffix}`;
}

export function resolveSmokeCombinedRunRoot(repoRoot: string): string {
    const runId = process.env.EPOSE_SMOKE_RUN_ID?.trim() || defaultRunId();
    if (!process.env.EPOSE_SMOKE_RUN_ID?.trim()) {
        process.env.EPOSE_SMOKE_RUN_ID = runId;
    }
    const runRoot =
        process.env.EPOSE_SMOKE_RUN_ROOT?.trim() ||
        path.join(repoRoot, 'test-output', 'smoke-combined', runId);
    if (!process.env.EPOSE_SMOKE_RUN_ROOT?.trim()) {
        process.env.EPOSE_SMOKE_RUN_ROOT = runRoot;
    }
    return runRoot;
}

export function ensureSmokeCombinedRunLayout(repoRoot: string): SmokeCombinedRunMeta {
    const runId = process.env.EPOSE_SMOKE_RUN_ID!.trim();
    const runRoot = process.env.EPOSE_SMOKE_RUN_ROOT!.trim();
    const playwrightOutputDir = path.join(runRoot, 'playwright-output');
    const junitPath = path.join(runRoot, 'results-smoke.xml');
    const evidenceDir = path.join(runRoot, 'evidence');
    fs.mkdirSync(playwrightOutputDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });

    const meta: SmokeCombinedRunMeta = {
        schemaVersion: 1,
        runId,
        runRoot,
        playwrightOutputDir,
        junitPath,
        startedAt: new Date().toISOString(),
        smokeParts: [1, 2],
        workers: 2,
        retries: 0,
        repeatEach: 1,
    };
    const metaPath = path.join(runRoot, 'smoke-run.meta.json');
    if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
    return meta;
}

export function smokeEvidenceDir(repoRoot?: string): string {
    const root = process.env.EPOSE_SMOKE_RUN_ROOT?.trim();
    if (root) {
        return path.join(root, 'evidence');
    }
    const base = repoRoot ?? process.cwd();
    return path.join(resolveSmokeCombinedRunRoot(base), 'evidence');
}