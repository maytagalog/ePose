import { expect, type Locator, type Page } from '@playwright/test';
import { TakeoverFlowError } from './takeoverErrors';
import {
    HANDOVER_SECTION_LOAD_STATE_ATTR,
    HANDOVER_SECTION_LOAD_STATES,
    HANDOVER_TEST_IDS,
} from './takeoverTestIds';

export const HANDOVER_SECTION_VISIBLE_TIMEOUT_MS = 15000;
export const HANDOVER_PREVIEW_LIST_READY_TIMEOUT_MS = 15000;
export const HANDOVER_FULL_LIST_READY_TIMEOUT_MS = 15000;

const LOAD_STATE_POLL_INTERVALS_MS = [50, 100, 200] as const;

export type HandoverPreviewListReadyPhase =
    | 'before_create_baseline'
    | 'after_create_preview'
    | 'before_read_list'
    | 'after_delete_preview';

export type HandoverFullListReadyPhase = 'read_full_list';

async function awaitHandoverContainerLoadStateLoaded(
    container: Locator,
    containerDescription: string,
    phase: string,
    timeoutMs: number
): Promise<void> {
    await expect(container, `${containerDescription} visible (phase=${phase})`).toBeVisible({
        timeout: timeoutMs,
    });

    await expect
        .poll(
            async () => {
                const state =
                    (await container.getAttribute(HANDOVER_SECTION_LOAD_STATE_ATTR))?.trim() ?? '';

                if (!state) {
                    throw new TakeoverFlowError(
                        `Missing ${HANDOVER_SECTION_LOAD_STATE_ATTR} on ${containerDescription} (phase=${phase}).`
                    );
                }

                if (state === HANDOVER_SECTION_LOAD_STATES.error) {
                    throw new TakeoverFlowError(
                        `${containerDescription} load failed (${HANDOVER_SECTION_LOAD_STATE_ATTR}="${state}", phase=${phase}).`
                    );
                }

                if (
                    state !== HANDOVER_SECTION_LOAD_STATES.loading &&
                    state !== HANDOVER_SECTION_LOAD_STATES.loaded
                ) {
                    throw new TakeoverFlowError(
                        `Unsupported ${HANDOVER_SECTION_LOAD_STATE_ATTR}="${state}" on ${containerDescription} (phase=${phase}).`
                    );
                }

                return state;
            },
            {
                timeout: timeoutMs,
                intervals: [...LOAD_STATE_POLL_INTERVALS_MS],
                message: `handover ${containerDescription} ${HANDOVER_SECTION_LOAD_STATE_ATTR}="${HANDOVER_SECTION_LOAD_STATES.loaded}" (phase=${phase})`,
            }
        )
        .toBe(HANDOVER_SECTION_LOAD_STATES.loaded);
}

/** Non-list steps: section visibility only. */
export async function awaitHandoverSectionVisible(page: Page, phase: string): Promise<void> {
    await expect(page.getByTestId(HANDOVER_TEST_IDS.section), `cirs-handover-section visible (${phase})`).toBeVisible({
        timeout: HANDOVER_SECTION_VISIBLE_TIMEOUT_MS,
    });
}

/** Preview list on cirs-handover-section — required before ID baseline/diff and post-delete absence checks. */
export async function assertHandoverPreviewListReady(
    page: Page,
    phase: HandoverPreviewListReadyPhase
): Promise<void> {
    const section = page.getByTestId(HANDOVER_TEST_IDS.section);
    await awaitHandoverContainerLoadStateLoaded(
        section,
        'cirs-handover-section (preview)',
        phase,
        HANDOVER_PREVIEW_LIST_READY_TIMEOUT_MS
    );
}

/** Full handover list on cirs-handover-list after opening 一覧. */
export async function assertHandoverFullListReady(
    page: Page,
    phase: HandoverFullListReadyPhase
): Promise<void> {
    const list = page.getByTestId(HANDOVER_TEST_IDS.list);
    await awaitHandoverContainerLoadStateLoaded(
        list,
        'cirs-handover-list (full list)',
        phase,
        HANDOVER_FULL_LIST_READY_TIMEOUT_MS
    );
}

/** @deprecated Use awaitHandoverSectionVisible / assertHandoverPreviewListReady. */
export const awaitHandoverSectionReady = awaitHandoverSectionVisible;

/** @deprecated Renamed to awaitHandoverSectionVisible. */
export const awaitTakeoverListSettled = awaitHandoverSectionVisible;
