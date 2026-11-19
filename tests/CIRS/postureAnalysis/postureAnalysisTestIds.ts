/**
 * CIRS Automation Attributes — section 6 (姿勢分析レポート) and section 7 (plan-limit dialog).
 *
 * Section 6 (contract):
 * - `cirs-analysis-section` — customer page and record page
 * - `cirs-analysis-create` — 新規分析 (expired-trial opens plan-limit popup; no analysis created)
 * - `cirs-analysis-list-open` — section 一覧
 * - `cirs-analysis-list` — full-list container (written contract; staging uses `analysis-report-history-list` per trace 20261102-074838)
 * - `cirs-analysis-item` + `data-analysis-id` + `data-customer-id` — preview (both pages) and full list
 * - `cirs-analysis-back` — full-list in-app back
 * - `cirs-analysis-loading` — preview sections (record/customer page)
 * - `cirs-analysis-empty` — customer-page preview and full list only (record-page preview has no empty message)
 *
 * Staging full-list (trace 20261102-074838): `analysis-report-history-list`, `analysis-report-history-loading`, rows still `cirs-analysis-item`.
 *
 * Staging report detail: `analysis-report` (+ data-analysis-id, data-customer-id), `analysis-report-summary`,
 * `analysis-report-score`, `analysis-report-photo`.
 *
 * `data-analysis-id` is the report ID in the page URL, not the internal numeric pagination id.
 */
export const POSTURE_ANALYSIS_TEST_IDS = {
    section: 'cirs-analysis-section',
    create: 'cirs-analysis-create',
    listOpen: 'cirs-analysis-list-open',
    /** @deprecated Staging full-list container — use {@link POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList}. */
    list: 'cirs-analysis-list',
    item: 'cirs-analysis-item',
    back: 'cirs-analysis-back',
    loading: 'cirs-analysis-loading',
    empty: 'cirs-analysis-empty',
    planLimitDialog: 'plan-limit-dialog',
    planLimitClose: 'plan-limit-close',
} as const;

export const ANALYSIS_ID_ATTR = 'data-analysis-id';
export const CUSTOMER_ID_ATTR = 'data-customer-id';

export const POSTURE_ANALYSIS_AUTOMATION_GAPS = {
    analysisBackNesting:
        'Section 6 attaches cirs-analysis-back to the full-list page but does not document DOM nesting; ' +
        'automation uses exactly one visible cirs-analysis-back on the posture-analysis-report route.',
    fullListEmptyStateHook:
        'Section 6 documents cirs-analysis-empty on the full list (not analysis-report-history-empty). ' +
        'Trace 20261102-074838 did not exercise an empty full list, so empty-marker placement beside ' +
        'analysis-report-history-list is unconfirmed on staging. Zero visible rows alone is never treated as empty.',
} as const;

export { POSTURE_ANALYSIS_FULL_LIST_TEST_IDS } from './postureAnalysisFullListLocators';

/** Staging: analysis full-list back lands on selected customer (/customers/{customerId}), not /customers root. */
export function postureAnalysisSelectedCustomerPath(customerId: string): string {
    return `/customers/${customerId}`;
}

export function postureAnalysisSelectedCustomerUrlPattern(customerId: string): RegExp {
    const escaped = customerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`/customers/${escaped}(?:/|$|\\?)`, 'i');
}

export const ANALYSIS_REPORT_DETAIL_URL =
    /\/customers\/[0-9a-f-]{36}\/reports\/[^/?]+(?:\/|$|\?)/i;

/** Staging report detail page (latest trace): container + summary/score/photo hooks. */
export const POSTURE_ANALYSIS_REPORT_TEST_IDS = {
    report: 'analysis-report',
    summary: 'analysis-report-summary',
    score: 'analysis-report-score',
    photo: 'analysis-report-photo',
} as const;

export function parseAnalysisIdFromUrl(url: string): string | null {
    const match = url.match(/\/customers\/[0-9a-f-]{36}\/reports\/([^/?]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
}
