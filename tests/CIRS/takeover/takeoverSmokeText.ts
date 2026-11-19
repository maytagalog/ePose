export const HANDOVER_SMOKE_CREATE_TEXT = 'Staging Smoke Automation';
export const HANDOVER_SMOKE_UPDATE_TEXT = 'Staging Smoke Automation Updated';

export function resolveTakeoverSmokeContent(): {
    createText: string;
    updateText: string;
} {
    return {
        createText: HANDOVER_SMOKE_CREATE_TEXT,
        updateText: HANDOVER_SMOKE_UPDATE_TEXT,
    };
}
