import { expect, type Locator, type Page, type Response } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARED_GUEST_PRINT_ONLY_CLASS,
    ANALYSIS_REPORT_SHARED_GUEST_VISIBLE,
    GET_FETCH_SHARED_REPORT_URL,
} from '../../analysisReportTestIds';

export const SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS = 15000;
export const SHARED_REPORT_SCROLL_TIMEOUT_MS = 90000;
export const SHARED_REPORT_SCROLL_OVERLAP_RATIO = 0.25;
export const SHARED_REPORT_STABLE_BOTTOM_CHECKS = 2;

export class AnalysisReportSharedReportVerificationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnalysisReportSharedReportVerificationError';
    }
}

export type FetchSharedReportIdentity = {
    customerId: string;
    analysisId: string;
    /** Trace 20261109-092223: report.customer.id must match report.customerId. */
    customerRecordId: string;
    customerDisplayName: string | null;
};

export function isFetchSharedReportResponse(res: Response): boolean {
    return res.url().startsWith(GET_FETCH_SHARED_REPORT_URL) && res.request().method() === 'GET';
}

export function parseFetchSharedReportIdentity(body: unknown): FetchSharedReportIdentity {
    if (body === null || typeof body !== 'object') {
        throw new AnalysisReportSharedReportVerificationError(
            'fetch_shared_report body is not an object'
        );
    }
    const root = body as Record<string, unknown>;
    const data =
        root.data && typeof root.data === 'object'
            ? (root.data as Record<string, unknown>)
            : root;
    const report =
        data.report && typeof data.report === 'object'
            ? (data.report as Record<string, unknown>)
            : data;

    const customerId = pickNonEmptyString(report.customerId) ?? pickNonEmptyString(data.customerId);
    const analysisId = pickNonEmptyString(report.analysisId) ?? pickNonEmptyString(data.analysisId);

    if (!customerId || !analysisId) {
        throw new AnalysisReportSharedReportVerificationError(
            'fetch_shared_report missing customerId or analysisId'
        );
    }

    const customer =
        report.customer && typeof report.customer === 'object'
            ? (report.customer as Record<string, unknown>)
            : null;
    const customerRecordId = pickNonEmptyString(customer?.id);
    if (!customerRecordId) {
        throw new AnalysisReportSharedReportVerificationError(
            'fetch_shared_report missing report.customer.id'
        );
    }
    if (customerRecordId !== customerId) {
        throw new AnalysisReportSharedReportVerificationError(
            'fetch_shared_report report.customer.id does not match report.customerId'
        );
    }

    const customerDisplayName = pickNonEmptyString(customer?.fullName);

    return { customerId, analysisId, customerRecordId, customerDisplayName };
}

function pickNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Trace 20261109-085356: guest page has no role=main; print clones stay hidden on screen
 * ({@link ANALYSIS_REPORT_SHARED_GUEST_PRINT_ONLY_CLASS}). Require exactly one visible match.
 */
export function sharedReportOnScreenTextMatches(page: Page, text: string): Locator {
    return page.getByText(text, { exact: false }).locator('visible=true');
}

export async function expectSharedReportUniqueVisibleLabel(page: Page, text: string): Promise<Locator> {
    const onScreen = sharedReportOnScreenTextMatches(page, text);
    await expect(onScreen).toHaveCount(1, { timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS });
    await expect(onScreen).toBeVisible({ timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS });

    const allIncludingPrint = page.getByText(text, { exact: false });
    const total = await allIncludingPrint.count();
    const visibleCount = await onScreen.count();
    if (total > visibleCount) {
        const printOnly = page
            .locator(`.${ANALYSIS_REPORT_SHARED_GUEST_PRINT_ONLY_CLASS}`)
            .getByText(text, { exact: false });
        await expect(printOnly).toHaveCount(total - visibleCount);
    }
    return onScreen;
}

export async function assertSharedReportGuestViewVisible(
    page: Page,
    identity: FetchSharedReportIdentity
): Promise<void> {
    const displayName = identity.customerDisplayName;
    if (!displayName) {
        throw new AnalysisReportSharedReportVerificationError(
            'fetch_shared_report did not include customer display name for visible verification'
        );
    }

    await expectSharedReportUniqueVisibleLabel(page, displayName);
    await expectSharedReportUniqueVisibleLabel(
        page,
        ANALYSIS_REPORT_SHARED_GUEST_VISIBLE.standingPostureTitle
    );
    await expectSharedReportUniqueVisibleLabel(page, ANALYSIS_REPORT_SHARED_GUEST_VISIBLE.aiJudgment);
    await expectSharedReportUniqueVisibleLabel(page, ANALYSIS_REPORT_SHARED_GUEST_VISIBLE.score);
    await expectSharedReportUniqueVisibleLabel(
        page,
        ANALYSIS_REPORT_SHARED_GUEST_VISIBLE.generationRating
    );
}

export type ScrollMetrics = {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
};

export type ReportScrollTarget =
    | { kind: 'window' }
    | { kind: 'element'; selector: string };

const SCROLL_ROOT_ATTR = 'data-epose-shared-report-scroll-root';
const SCROLL_ANCHOR_ATTR = 'data-epose-shared-report-scroll-anchor';

type ScrollTargetResolvePayload = {
    scrollRootAttr: string;
    anchorAttr: string;
};

export async function resolveSharedReportScrollTarget(page: Page): Promise<ReportScrollTarget> {
    const summaryAnchor = sharedReportOnScreenTextMatches(
        page,
        ANALYSIS_REPORT_SHARED_GUEST_VISIBLE.aiJudgment
    );
    await expect(summaryAnchor).toHaveCount(1, { timeout: SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS });
    await summaryAnchor.evaluate((el, attr) => {
        el.setAttribute(attr, 'true');
    }, SCROLL_ANCHOR_ATTR);

    const payload: ScrollTargetResolvePayload = {
        scrollRootAttr: SCROLL_ROOT_ATTR,
        anchorAttr: SCROLL_ANCHOR_ATTR,
    };

    const selector = await page.evaluate(({ scrollRootAttr, anchorAttr }) => {
        const isScrollable = (el: Element): boolean => {
            const style = getComputedStyle(el);
            const overflowY = style.overflowY;
            const allowsScroll =
                overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
            if (!allowsScroll) {
                return false;
            }
            const height = el as HTMLElement;
            return height.scrollHeight > height.clientHeight + 1;
        };

        const anchorEl = document.querySelector(`[${anchorAttr}="true"]`);
        if (!anchorEl) {
            return null;
        }

        const scrollableAncestors: HTMLElement[] = [];
        let parent: HTMLElement | null = anchorEl.parentElement;
        while (parent) {
            if (isScrollable(parent) && parent.contains(anchorEl)) {
                scrollableAncestors.push(parent);
            }
            parent = parent.parentElement;
        }

        let bestAncestor: { element: HTMLElement; range: number } | null = null;
        for (const el of scrollableAncestors) {
            const range = el.scrollHeight - el.clientHeight;
            if (range <= 0) {
                continue;
            }
            if (!bestAncestor || range > bestAncestor.range) {
                bestAncestor = { element: el, range };
            }
        }

        if (bestAncestor) {
            bestAncestor.element.setAttribute(scrollRootAttr, 'true');
            return `[${scrollRootAttr}="true"]`;
        }

        const documentRange = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
        );
        const usesDocumentScroll =
            documentRange > window.innerHeight + 1 &&
            (document.scrollingElement?.contains(anchorEl) ?? document.body.contains(anchorEl));

        if (usesDocumentScroll) {
            return null;
        }

        return null;
    }, payload);

    return selector ? { kind: 'element', selector } : { kind: 'window' };
}

export async function readSharedReportScrollMetrics(
    page: Page,
    target: ReportScrollTarget
): Promise<ScrollMetrics> {
    if (target.kind === 'window') {
        return page.evaluate(() => ({
            scrollTop: window.scrollY,
            scrollHeight: Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight
            ),
            clientHeight: window.innerHeight,
        }));
    }

    return page.locator(target.selector).evaluate((el) => ({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
    }));
}

export async function setSharedReportScrollTop(
    page: Page,
    target: ReportScrollTarget,
    scrollTop: number
): Promise<void> {
    if (target.kind === 'window') {
        await page.evaluate((y) => window.scrollTo(0, y), scrollTop);
        return;
    }
    await page.locator(target.selector).evaluate((el, y) => {
        el.scrollTop = y;
    }, scrollTop);
}

export function isAtScrollBottom(metrics: ScrollMetrics, tolerancePx = 2): boolean {
    return metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - tolerancePx;
}

export type IncrementalScrollToStableBottomOptions = {
    timeoutMs?: number;
    overlapRatio?: number;
    stableBottomChecks?: number;
};

/**
 * Scroll from the top using overlapping viewport-sized steps on the resolved scroll container.
 * Recalculates scroll height as content grows; requires consecutive stable bottom readings.
 */
export async function scrollSharedReportToStableBottom(
    page: Page,
    options?: IncrementalScrollToStableBottomOptions
): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? SHARED_REPORT_SCROLL_TIMEOUT_MS;
    const overlapRatio = options?.overlapRatio ?? SHARED_REPORT_SCROLL_OVERLAP_RATIO;
    const stableBottomChecks = options?.stableBottomChecks ?? SHARED_REPORT_STABLE_BOTTOM_CHECKS;

    const target = await resolveSharedReportScrollTarget(page);
    await setSharedReportScrollTop(page, target, 0);

    const deadline = Date.now() + timeoutMs;
    let stableBottomCount = 0;
    let lastStableScrollHeight = -1;
    let previousScrollTop = -1;
    let stallSteps = 0;

    while (Date.now() < deadline) {
        const metrics = await readSharedReportScrollMetrics(page, target);
        const step = Math.max(1, Math.floor(metrics.clientHeight * (1 - overlapRatio)));

        if (isAtScrollBottom(metrics)) {
            if (metrics.scrollHeight === lastStableScrollHeight) {
                stableBottomCount += 1;
                if (stableBottomCount >= stableBottomChecks) {
                    return;
                }
            } else {
                lastStableScrollHeight = metrics.scrollHeight;
                stableBottomCount = 1;
            }
        } else {
            stableBottomCount = 0;
            lastStableScrollHeight = -1;
        }

        if (!isAtScrollBottom(metrics)) {
            const nextTop = Math.min(metrics.scrollTop + step, metrics.scrollHeight);
            if (nextTop <= metrics.scrollTop + 0.5) {
                stallSteps += 1;
            } else {
                const beforeTop = metrics.scrollTop;
                await setSharedReportScrollTop(page, target, nextTop);
                await page.evaluate(
                    () =>
                        new Promise<void>((resolve) => {
                            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                        })
                );
                const after = await readSharedReportScrollMetrics(page, target);
                if (after.scrollTop <= beforeTop + 0.5 && !isAtScrollBottom(after)) {
                    stallSteps += 1;
                } else {
                    stallSteps = 0;
                }
                previousScrollTop = after.scrollTop;
            }
            if (stallSteps >= 3) {
                throw new AnalysisReportSharedReportVerificationError(
                    'shared report scroll stalled before reaching bottom'
                );
            }
        } else if (previousScrollTop === metrics.scrollTop && stableBottomCount < stableBottomChecks) {
            await expect
                .poll(async () => (await readSharedReportScrollMetrics(page, target)).scrollHeight, {
                    timeout: 2000,
                    message: 'shared report bottom scroll height stabilize',
                })
                .toBe(metrics.scrollHeight);
            stallSteps += 1;
            if (stallSteps >= 3) {
                throw new AnalysisReportSharedReportVerificationError(
                    'shared report bottom height did not stabilize'
                );
            }
        } else {
            stallSteps = 0;
            previousScrollTop = metrics.scrollTop;
        }
    }

    throw new AnalysisReportSharedReportVerificationError(
        'shared report scroll did not reach a stable bottom within timeout'
    );
}

export type CompleteSharedReportGuestVerificationOptions = {
    scrollOptions?: IncrementalScrollToStableBottomOptions;
};

export async function completeSharedReportGuestVerification(
    page: Page,
    fetchResponsePromise: Promise<Response>,
    customerId: string,
    analysisId: string,
    options?: CompleteSharedReportGuestVerificationOptions
): Promise<void> {
    const fetchResponse = await fetchResponsePromise;
    if (!fetchResponse.ok()) {
        throw new AnalysisReportSharedReportVerificationError(
            `fetch_shared_report returned HTTP ${fetchResponse.status()}`
        );
    }

    const identity = parseFetchSharedReportIdentity(await fetchResponse.json());
    expect(identity.customerId).toBe(customerId);
    expect(identity.customerRecordId).toBe(customerId);
    expect(identity.analysisId).toBe(analysisId);

    await assertSharedReportGuestViewVisible(page, identity);
    await scrollSharedReportToStableBottom(page, options?.scrollOptions);
}
