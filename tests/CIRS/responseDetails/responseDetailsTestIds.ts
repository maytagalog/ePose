/**
 * Developer automation attributes (record detail / Response Details).
 * Placement: inside {@link CIRS_TEST_IDS.recordDetail} on staging.
 */
export const RESPONSE_DETAILS_TEST_IDS = {
    input: 'cirs-response-input',
    lastUpdated: 'cirs-response-last-updated',
    saveStatus: 'cirs-response-save-status',
} as const;

export const RESPONSE_SAVE_STATE_ATTR = 'data-save-state';
export const RESPONSE_LAST_SAVED_AT_ATTR = 'data-last-saved-at';

/** Confirmed saved state value on cirs-response-save-status. */
export const RESPONSE_SAVE_STATE_SAVED = 'saved';

/** Loaded persisted content with no in-flight edit (staging trace). */
export const RESPONSE_SAVE_STATE_IDLE = 'idle';
