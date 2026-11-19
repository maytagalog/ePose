import path from 'node:path';

/**
 * Parse EPOSE_SMOKE_PARTS for diagnostic runs (1, 2, or "1,2" / default both).
 * @returns {(1 | 2)[]}
 */
export function parseSmokeDiagnosticParts(raw = process.env.EPOSE_SMOKE_PARTS) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return [1, 2];
    }
    const parts = [
        ...new Set(
            trimmed
                .split(/[,;\s]+/)
                .map((s) => Number.parseInt(s, 10))
                .filter((n) => n === 1 || n === 2)
        ),
    ].sort((a, b) => a - b);
    if (parts.length === 0) {
        return [1, 2];
    }
    return parts;
}

/** @param {readonly (1|2)[]} parts */
export function smokeDiagnosticWorkers(parts) {
    return parts.length === 2 ? 2 : 1;
}

/** @param {readonly (1|2)[]} parts */
export function smokeDiagnosticJUnitFileName(parts) {
    if (parts.length === 2) {
        return 'results-smoke.xml';
    }
    return parts[0] === 1 ? 'results-part1.xml' : 'results-part2.xml';
}

/** @param {readonly (1|2)[]} parts */
export function smokeDiagnosticSpecArgs(parts, repoRoot) {
    const specs = [];
    if (parts.includes(1)) {
        specs.push(path.join(repoRoot, 'tests/e2e/fullE2ESmokePart1.spec.ts'));
    }
    if (parts.includes(2)) {
        specs.push(path.join(repoRoot, 'tests/e2e/fullE2ESmokePart2.spec.ts'));
    }
    return specs;
}