import { expect, type Locator } from '@playwright/test';
import { PostureAnalysisFlowError } from './postureAnalysisErrors';
import { ANALYSIS_ID_ATTR, CUSTOMER_ID_ATTR, POSTURE_ANALYSIS_TEST_IDS } from './postureAnalysisTestIds';

export const POSTURE_ANALYSIS_PREVIEW_READY_TIMEOUT_MS = 15000;

type AnalysisContainerTerminalPhase = 'loading' | 'empty' | 'populated' | 'invalid';

const LOAD_STATE_POLL_INTERVALS_MS = [50, 100, 200] as const;

async function resolvePreviewContainerTerminalPhase(
    section: Locator,
    allowEmptyMarker: boolean
): Promise<AnalysisContainerTerminalPhase> {
    const loading = section.getByTestId(POSTURE_ANALYSIS_TEST_IDS.loading);
    if (await loading.isVisible().catch(() => false)) {
        return 'loading';
    }

    const empty = section.getByTestId(POSTURE_ANALYSIS_TEST_IDS.empty);
    const items = section.getByTestId(POSTURE_ANALYSIS_TEST_IDS.item);
    const itemCount = await items.count();
    const visibleItemCount = await items.locator('visible=true').count();
    const emptyVisible = await empty.isVisible().catch(() => false);

    if (allowEmptyMarker && emptyVisible && itemCount === 0 && visibleItemCount === 0) {
        return 'empty';
    }

    if (visibleItemCount > 0 && !emptyVisible) {
        return 'populated';
    }

    if (visibleItemCount > 0 && emptyVisible) {
        return 'invalid';
    }

    return 'invalid';
}

async function pollPreviewContainerTerminalPhase(
    section: Locator,
    containerDescription: string,
    phase: string,
    timeoutMs: number,
    allowEmptyMarker: boolean
): Promise<Exclude<AnalysisContainerTerminalPhase, 'loading' | 'invalid'>> {
    await expect(section, `${containerDescription} visible (phase=${phase})`).toBeVisible({
        timeout: timeoutMs,
    });

    let lastPhase: AnalysisContainerTerminalPhase = 'loading';

    try {
        await expect
            .poll(
                async () => {
                    lastPhase = await resolvePreviewContainerTerminalPhase(section, allowEmptyMarker);
                    return lastPhase === 'empty' || lastPhase === 'populated';
                },
                {
                    timeout: timeoutMs,
                    intervals: [...LOAD_STATE_POLL_INTERVALS_MS],
                    message:
                        `${containerDescription} terminal load state ` +
                        `(cirs-analysis-loading hidden + empty-with-zero-items OR visible items without empty; phase=${phase})`,
                }
            )
            .toBe(true);
    } catch (error) {
        if (lastPhase === 'loading') {
            throw new PostureAnalysisFlowError(
                `${containerDescription} remained in loading state through timeout (phase=${phase}).`
            );
        }
        throw new PostureAnalysisFlowError(
            `${containerDescription} never reached a valid terminal state ` +
                `(need cirs-analysis-loading hidden AND (visible cirs-analysis-empty with zero items OR visible cirs-analysis-item without empty); ` +
                `lastPhase=${lastPhase}; phase=${phase}).`
        );
    }

    const terminal = await resolvePreviewContainerTerminalPhase(section, allowEmptyMarker);
    if (terminal === 'empty' || terminal === 'populated') {
        return terminal;
    }
    throw new PostureAnalysisFlowError(
        `${containerDescription} poll resolved unexpectedly to ${terminal} (phase=${phase}).`
    );
}

/**
 * Preview section — wait for cirs-analysis-loading to clear, then poll until the first displayed card is visible.
 * Record-page preview has no empty marker (section 6).
 */
export async function awaitFirstDisplayedPreviewAnalysisItem(
    section: Locator,
    expectedCustomerId: string,
    phase: string
): Promise<Locator> {
    await expect(section, `cirs-analysis-section visible (phase=${phase})`).toBeVisible({
        timeout: POSTURE_ANALYSIS_PREVIEW_READY_TIMEOUT_MS,
    });
    const loading = section.getByTestId(POSTURE_ANALYSIS_TEST_IDS.loading);
    await expect(loading, `preview cirs-analysis-loading finished (phase=${phase})`).toBeHidden({
        timeout: POSTURE_ANALYSIS_PREVIEW_READY_TIMEOUT_MS,
    });

    let firstItem: Locator | null = null;

    await expect
        .poll(
            async () => {
                const items = section.getByTestId(POSTURE_ANALYSIS_TEST_IDS.item).locator('visible=true');
                const count = await items.count();
                if (count === 0) {
                    return 'missing';
                }
                firstItem = items.first();
                const analysisId = (await firstItem.getAttribute(ANALYSIS_ID_ATTR))?.trim() ?? '';
                const itemCustomerId = await firstItem.getAttribute(CUSTOMER_ID_ATTR);
                if (!analysisId) {
                    return 'missing-analysis-id';
                }
                if (itemCustomerId !== expectedCustomerId) {
                    return `wrong-customer:${itemCustomerId ?? 'none'}`;
                }
                return 'ready';
            },
            {
                timeout: POSTURE_ANALYSIS_PREVIEW_READY_TIMEOUT_MS,
                intervals: [...LOAD_STATE_POLL_INTERVALS_MS],
                message:
                    `first visible cirs-analysis-item with data-analysis-id and matching data-customer-id (phase=${phase})`,
            }
        )
        .toBe('ready');

    if (!firstItem) {
        throw new PostureAnalysisFlowError(
            `First preview analysis item unavailable after poll (phase=${phase}).`
        );
    }

    return firstItem;
}

/** @deprecated Prefer {@link awaitFirstDisplayedPreviewAnalysisItem} for populated reopen branch. */
export async function assertPostureAnalysisPreviewReady(section: Locator, phase: string): Promise<void> {
    await pollPreviewContainerTerminalPhase(
        section,
        'cirs-analysis-section (preview)',
        phase,
        POSTURE_ANALYSIS_PREVIEW_READY_TIMEOUT_MS,
        false
    );
}
