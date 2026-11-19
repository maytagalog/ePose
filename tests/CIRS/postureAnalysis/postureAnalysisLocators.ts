import { expect, type Locator, type Page } from '@playwright/test';
import { PostureAnalysisFlowError } from './postureAnalysisErrors';
import { POSTURE_ANALYSIS_TEST_IDS } from './postureAnalysisTestIds';

/**
 * Video-backed full-list route (staging posture analysis navigation recording).
 * Origin is validated separately against the configured app origin.
 */
export function postureAnalysisFullListPathname(customerId: string): string {
    return `/customers/${customerId}/posture-analysis-report`;
}

export function postureAnalysisFullListUrlPattern(customerId: string): RegExp {
    const escaped = customerId.replace(/-/g, '\\-');
    return new RegExp(`/customers/${escaped}/posture-analysis-report(?:/|$|\\?)`, 'i');
}

/**
 * Section 6 lists `cirs-analysis-back` on the full-list page but does not specify nesting under
 * `analysis-report-history-list`. Scope to exactly one visible back control
 * on the active full-list route (not list-container-scoped).
 */
export const POSTURE_ANALYSIS_BACK_CONTROL_EVIDENCE = {
    contractPlacement: 'full-list posture-analysis-report page — nesting under analysis-report-history-list not established',
    automationScope: 'exactly one visible cirs-analysis-back while posture-analysis-report route is active',
} as const;

export function postureAnalysisFullListBackControl(page: Page): Locator {
    return page.getByTestId(POSTURE_ANALYSIS_TEST_IDS.back).locator('visible=true');
}

export async function clickPostureAnalysisFullListBack(page: Page): Promise<void> {
    const back = postureAnalysisFullListBackControl(page);
    await expect(
        back,
        `${POSTURE_ANALYSIS_BACK_CONTROL_EVIDENCE.automationScope} (${POSTURE_ANALYSIS_BACK_CONTROL_EVIDENCE.contractPlacement})`
    ).toHaveCount(1, { timeout: 15000 });
    await back.click({ timeout: 15000 });
}

export async function assertPostureAnalysisFullListRoute(
    page: Page,
    expectedCustomerId: string,
    appOrigin: string,
    options?: { pollTimeoutMs?: number }
): Promise<void> {
    const expectedPattern = postureAnalysisFullListUrlPattern(expectedCustomerId);
    await expect
        .poll(
            async () => {
                const url = page.url();
                const listRouteMatch = url.match(
                    /\/customers\/([0-9a-f-]{36})\/posture-analysis-report(?:\/|$|\?)/i
                );
                if (!listRouteMatch) {
                    return 'pending';
                }
                const routeCustomerId = listRouteMatch[1];
                if (routeCustomerId !== expectedCustomerId) {
                    throw new PostureAnalysisFlowError(
                        `Analysis full-list route customer (${routeCustomerId}) != expected ${expectedCustomerId} ` +
                            `(expected ${postureAnalysisFullListPathname(expectedCustomerId)}; actual ${url}).`
                    );
                }
                return 'ready';
            },
            {
                timeout: options?.pollTimeoutMs ?? 30000,
                intervals: [50, 100, 200],
                message: `analysis full-list route ${postureAnalysisFullListPathname(expectedCustomerId)}`,
            }
        )
        .toBe('ready');

    if (!expectedPattern.test(page.url())) {
        throw new PostureAnalysisFlowError(
            `Analysis full-list URL did not match expected pattern (actual ${page.url()}).`
        );
    }
    const origin = new URL(page.url()).origin;
    if (origin !== appOrigin) {
        throw new PostureAnalysisFlowError(
            `Analysis full-list origin ${origin} != expected ${appOrigin} ` +
                `(route=${postureAnalysisFullListPathname(expectedCustomerId)}).`
        );
    }
    const routeCustomerId = page.url().match(/\/customers\/([0-9a-f-]{36})/i)?.[1] ?? null;
    if (routeCustomerId !== expectedCustomerId) {
        throw new PostureAnalysisFlowError(
            `Analysis full-list route customer (${routeCustomerId ?? 'none'}) != expected ${expectedCustomerId}.`
        );
    }
}
