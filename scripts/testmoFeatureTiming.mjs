import { AR_FEATURE_TO_CASE } from './part2TestmoConstants.mjs';

const AR_STAGE_LINE =
    /^ANALYSIS_REPORT_FULL_SMOKE:([^:]+):(exit|fail) (\{[\s\S]*\})\s*$/;
const COMPARISON_STAGE_LINE =
    /^COMPARISON_REPORT_FULL_SMOKE:([^:]+):(exit|fail) (\{[\s\S]*\})\s*$/;

export const COMPARISON_FEATURE_TO_CASE = {
    customersNavigation: 'comparisonReportView',
    singleReportEntry: 'comparisonReportView',
    comparisonView: 'comparisonReportView',
    comparisonShareQr: 'comparisonShareQr',
    comparisonShareEmail: 'comparisonShareEmail',
    comparisonReportPdf: 'comparisonReportPdf',
    exitComparison: 'exitComparison',
};

export function msToDurationSeconds(durationMs) {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
        return 0;
    }
    return Math.round((durationMs / 1000) * 1000) / 1000;
}

export function parseAnalysisReportStageTimingsMs(systemOut) {
    /** @type {Record<string, number>} */
    const byCaseKey = {};
    if (!systemOut) {
        return byCaseKey;
    }
    const text = systemOut.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        const match = AR_STAGE_LINE.exec(line);
        if (!match) {
            continue;
        }
        const stage = match[1];
        let payload;
        try {
            payload = JSON.parse(match[3]);
        } catch {
            continue;
        }
        const caseKey = AR_FEATURE_TO_CASE[stage];
        if (!caseKey) {
            continue;
        }
        const elapsedMs = payload.elapsedMs;
        if (typeof elapsedMs !== 'number' || elapsedMs < 0) {
            continue;
        }
        byCaseKey[caseKey] = (byCaseKey[caseKey] ?? 0) + elapsedMs;
    }
    return byCaseKey;
}

export function parseComparisonReportStageTimingsMs(systemOut) {
    /** @type {Record<string, number>} */
    const byCaseKey = {};
    if (!systemOut) {
        return byCaseKey;
    }
    const text = systemOut.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        const match = COMPARISON_STAGE_LINE.exec(line);
        if (!match) {
            continue;
        }
        const stage = match[1];
        let payload;
        try {
            payload = JSON.parse(match[3]);
        } catch {
            continue;
        }
        const caseKey = COMPARISON_FEATURE_TO_CASE[stage];
        if (!caseKey) {
            continue;
        }
        const elapsedMs = payload.elapsedMs;
        if (typeof elapsedMs !== 'number' || elapsedMs < 0) {
            continue;
        }
        byCaseKey[caseKey] = (byCaseKey[caseKey] ?? 0) + elapsedMs;
    }
    return byCaseKey;
}

export function parsePart2FeatureTimingsMsFromSystemOut(systemOut) {
    return {
        ...parseAnalysisReportStageTimingsMs(systemOut),
        ...parseComparisonReportStageTimingsMs(systemOut),
    };
}

/**
 * Merge explicit caseDurationsMs, per-case durationSeconds, and console stage timings.
 * Does not overwrite positive durations already on cases.
 */
export function enrichPart2CaseDurations(cases, { caseDurationsMs = null, systemOut = null } = {}) {
    const fromConsole = systemOut ? parsePart2FeatureTimingsMsFromSystemOut(systemOut) : {};
    return cases.map((caseResult) => {
        const existing =
            typeof caseResult.durationSeconds === 'number' && caseResult.durationSeconds > 0
                ? caseResult.durationSeconds
                : 0;
        if (existing > 0) {
            return caseResult;
        }
        const fromMs =
            caseDurationsMs?.[caseResult.key] ??
            fromConsole[caseResult.key] ??
            (typeof caseResult.durationMs === 'number' ? caseResult.durationMs : null);
        const durationSeconds =
            typeof fromMs === 'number' && fromMs >= 0 ? msToDurationSeconds(fromMs) : existing;
        if (durationSeconds === existing) {
            return caseResult;
        }
        return { ...caseResult, durationSeconds };
    });
}

export function enrichPart1CaseDurations(cases, caseDurationsMs = null) {
    if (!caseDurationsMs) {
        return cases;
    }
    return cases.map((caseResult) => {
        const existing =
            typeof caseResult.durationSeconds === 'number' && caseResult.durationSeconds > 0
                ? caseResult.durationSeconds
                : 0;
        if (existing > 0) {
            return caseResult;
        }
        const durationMs = caseDurationsMs[caseResult.key];
        if (typeof durationMs !== 'number' || durationMs < 0) {
            return caseResult;
        }
        return { ...caseResult, durationSeconds: msToDurationSeconds(durationMs) };
    });
}