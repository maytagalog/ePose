const LOG_PREFIX = 'COMPARISON_REPORT_FULL_SMOKE';

export type ComparisonSmokeStageTiming = {
    stage: string;
    event: 'enter' | 'exit' | 'fail';
    elapsedMs: number;
    detail?: string;
};

const stageStartedAt = new Map<string, number>();

function nowMs(): number {
    return performance.now();
}

export function logComparisonSmokeStage(
    stage: string,
    event: ComparisonSmokeStageTiming['event'],
    detail?: string
): ComparisonSmokeStageTiming {
    const t = nowMs();
    let elapsedMs = 0;
    if (event === 'enter') {
        stageStartedAt.set(stage, t);
    } else {
        const started = stageStartedAt.get(stage);
        elapsedMs = started !== undefined ? Math.round(t - started) : 0;
        if (event === 'exit' || event === 'fail') {
            stageStartedAt.delete(stage);
        }
    }
    const payload: ComparisonSmokeStageTiming = { stage, event, elapsedMs, ...(detail ? { detail } : {}) };
    console.log(`${LOG_PREFIX}:${stage}:${event}`, JSON.stringify(payload));
    return payload;
}