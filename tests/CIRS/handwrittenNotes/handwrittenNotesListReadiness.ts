import { expect, type Page } from '@playwright/test';
import { HandwrittenNotesFlowError } from './handwrittenNotesErrors';
import {
    HANDWRITTEN_SECTION_LOAD_STATE_ATTR,
    HANDWRITTEN_SECTION_LOAD_STATES,
    HANDWRITTEN_TEST_IDS,
} from './handwrittenNotesTestIds';

export const HANDWRITTEN_LIST_LOAD_TIMEOUT_MS = 15000;

const LIST_LOAD_POLL_INTERVAL_MS = 100;

export type HandwrittenListReadinessPhase =
    | 'before_create'
    | 'after_create_list_verify'
    | 'initial_snapshot'
    | 'after_delete'
    | 'after_reload';

/**
 * Waits until {@link HANDWRITTEN_TEST_IDS.section} reports
 * {@link HANDWRITTEN_SECTION_LOAD_STATES.loaded}.
 */
export async function awaitHandwrittenNoteListSettled(
    page: Page,
    phase: HandwrittenListReadinessPhase
): Promise<void> {
    const section = page.getByTestId(HANDWRITTEN_TEST_IDS.section);
    await expect(section).toBeVisible({ timeout: HANDWRITTEN_LIST_LOAD_TIMEOUT_MS });

    const deadline = Date.now() + HANDWRITTEN_LIST_LOAD_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const state =
            (await section.getAttribute(HANDWRITTEN_SECTION_LOAD_STATE_ATTR))?.trim() ?? '';

        if (!state) {
            throw new HandwrittenNotesFlowError(
                `Missing ${HANDWRITTEN_SECTION_LOAD_STATE_ATTR} on cirs-handwritten-section (phase=${phase}).`
            );
        }

        if (state === HANDWRITTEN_SECTION_LOAD_STATES.error) {
            throw new HandwrittenNotesFlowError(
                `Handwritten note list load failed (${HANDWRITTEN_SECTION_LOAD_STATE_ATTR}="${state}", phase=${phase}).`
            );
        }

        if (
            state !== HANDWRITTEN_SECTION_LOAD_STATES.loading &&
            state !== HANDWRITTEN_SECTION_LOAD_STATES.loaded
        ) {
            throw new HandwrittenNotesFlowError(
                `Unsupported ${HANDWRITTEN_SECTION_LOAD_STATE_ATTR}="${state}" on cirs-handwritten-section (phase=${phase}). Expected loading, loaded, or error.`
            );
        }

        if (state === HANDWRITTEN_SECTION_LOAD_STATES.loaded) {
            return;
        }

        await page.waitForTimeout(LIST_LOAD_POLL_INTERVAL_MS);
    }

    throw new HandwrittenNotesFlowError(
        `Timed out waiting for handwritten note list ${HANDWRITTEN_SECTION_LOAD_STATE_ATTR}="${HANDWRITTEN_SECTION_LOAD_STATES.loaded}" (phase=${phase}).`
    );
}
