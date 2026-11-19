import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RESULTS_ROOT_STATE_FILE = 'results-root-state.json';

export function sha256Hex(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export function resultsRootStatePath(repoRoot, backupDir = path.join(repoRoot, 'results-backups')) {
    return path.join(backupDir, RESULTS_ROOT_STATE_FILE);
}

export function loadResultsRootState(repoRoot, backupDir) {
    const statePath = resultsRootStatePath(repoRoot, backupDir);
    if (!fs.existsSync(statePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
        return null;
    }
}

export function saveResultsRootState(state, repoRoot, backupDir) {
    const statePath = resultsRootStatePath(repoRoot, backupDir);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    return statePath;
}

/**
 * Block preview/submit when a single-part rerun invalidated the combined aggregate.
 */
export function assertAggregateReadyForSubmit(repoRoot, options = {}) {
    const backupDir = options.backupDir ?? path.join(repoRoot, 'results-backups');
    const resultsXml = options.resultsPath ?? path.join(repoRoot, 'results.xml');
    const state = loadResultsRootState(repoRoot, backupDir);
    if (!fs.existsSync(resultsXml)) {
        throw new Error(`Missing ${resultsXml}. Run smoke publication or combine before preview/submit.`);
    }
    if (!state) {
        return { ready: true, state: null };
    }
    if (state.recombinationRequired) {
        throw new Error(
            `Stale combined results.xml: ${state.staleReason ?? 'recombination required'}. Run node scripts/combineSmokeResults.mjs after updating part JUnit files.`
        );
    }
    if (state.aggregateReady === false) {
        throw new Error(
            'Combined results.xml is not marked ready for submit. Re-run combine or a full parallel smoke publish.'
        );
    }
    const aggregateSha = sha256Hex(fs.readFileSync(resultsXml, 'utf8'));
    if (state.files?.['results.xml']?.sha256 && state.files['results.xml'].sha256 !== aggregateSha) {
        throw new Error(
            'results.xml changed since last publication/combine without updating results-root-state. Run combine or republish.'
        );
    }
    return { ready: true, state };
}