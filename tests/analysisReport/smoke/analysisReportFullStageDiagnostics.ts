const LOG_PREFIX = 'ANALYSIS_REPORT_FULL_SMOKE';

export type CombinedSmokeStageTiming = {
    stage: string;
    event: 'enter' | 'exit' | 'fail';
    elapsedMs: number;
    detail?: string;
};

const stageStartedAt = new Map<string, number>();

function nowMs(): number {
    return performance.now();
}

export function logCombinedSmokeStage(
    stage: string,
    event: CombinedSmokeStageTiming['event'],
    detail?: string
): CombinedSmokeStageTiming {
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
    const payload: CombinedSmokeStageTiming = { stage, event, elapsedMs, ...(detail ? { detail } : {}) };
    console.log(`${LOG_PREFIX}:${stage}:${event}`, JSON.stringify(payload));
    return payload;
}
