/**
 * Verified from read-only inspection of staging staff bundle
 * `https://app-stg.epose.com/assets/index-e1c8e29a.js` (2026-11-12).
 *
 * Source paths embedded in bundle (epose-front-staff):
 * - DeleteReportDialog/DeleteReportDialog.tsx
 * - features/reports/repositories (ReportRepository.deleteReport)
 * - features/reports/routes/StandingPostureAnalysis.tsx
 * - features/reports/components/PostureAnalysisReportList/PostureAnalysisReportList.tsx
 * - useDeleteReport mutation
 */

export const STAGING_BUNDLE_REFERENCE = 'app-stg.epose.com/assets/index-e1c8e29a.js';

export const VERIFIED_REPORT_API_BASE_URL = 'https://api-stg.epose.com/report';

/** ReportRepository.deleteReport → httpAdapter.postHTTP(`${REPORT_API_URL}/delete_report`, …) */
export const VERIFIED_DELETE_REPORT_PATH = '/delete_report';

export const VERIFIED_DELETE_REPORT_URL = `${VERIFIED_REPORT_API_BASE_URL}${VERIFIED_DELETE_REPORT_PATH}`;

/**
 * Delete handler (StandingPostureAnalysis `dr`):
 * `await It({ accountId: xe, id: Jr })` where `xe = useAuth.accountID` (staff store account)
 * and `Jr = useParams().reportId` (route segment; list navigation uses `analysisId` in the path).
 */
export type VerifiedDeleteReportRequestBody = {
    /** Logged-in staff `accountID` from global auth state — not customerId. */
    accountId: string;
    /** Open report route id (same value as `data-analysis-id` / history row `analysisId`). */
    id: string;
};

/**
 * Delete success (useDeleteReport `onSuccess: Je => Je.data ? …`):
 * `Je` is the repository return `{ data: postHTTPBody }`.
 * Success when `Je.data` (HTTP response body) is truthy — not a separate DOM test id.
 * Exact JSON schema of the HTTP body is not fully typed in the minified bundle.
 */
export const VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH = '/customers';

export const VERIFIED_DELETE_DIALOG_TITLE_JA = 'レポートの削除';
export const VERIFIED_DELETE_DIALOG_WARNING_LINES_JA = [
    'このレポートは完全に消去され、復旧できません。',
    'よろしいですか？',
] as const;

/** Visible JA copy from i18n `deleteReportDialog.deletionSuccessful` (toast.success first argument). */
export const VERIFIED_DELETE_TOAST_SUCCESS_JA = '姿勢分析レポートが削除されました';

/** Ant Design toast instance id (5th arg) — not a pre-rendered DOM `data-testid`. */
export const VERIFIED_DELETE_TOAST_SUCCESS_KEY = 'analysis-report-delete-success';

export const VERIFIED_DELETE_TOAST_ERROR_TEST_ID = 'analysis-report-delete-error';

/** Customer history list fetch: POST fetch_customer_report */
export const VERIFIED_FETCH_CUSTOMER_REPORT_PATH = '/fetch_customer_report';
export const VERIFIED_FETCH_CUSTOMER_REPORT_URL = `${VERIFIED_REPORT_API_BASE_URL}${VERIFIED_FETCH_CUSTOMER_REPORT_PATH}`;

/**
 * Single-report detail: GET fetch_analysis_report (query accountId, customerId, analysisId).
 * Trace 2026-11-13T12-44-56: DOM data-load-state stays loading until this response finishes (~1.5–2s on staging).
 */
export const VERIFIED_FETCH_ANALYSIS_REPORT_PATH = '/fetch_analysis_report';

/** GET fetch_customer_analysis_report_comparison (Comparison view data load). */
export const VERIFIED_FETCH_CUSTOMER_ANALYSIS_REPORT_COMPARISON_PATH =
    '/fetch_customer_analysis_report_comparison';

/** CustomerPostureAnalysisReportListPage: PAGE_SIZE_CUSTOMER_POSTURE_ANALYSIS_REPORT = 25 */
export const VERIFIED_CUSTOMER_HISTORY_PAGE_SIZE = 25;

export type VerifiedFetchCustomerReportRequestBody = {
    accountId: string;
    customerId: string;
    pageSize: number;
    sortType: string;
    isFirstPage: boolean;
    lastCreatedAt?: string;
    lastId?: string;
};

/**
 * List row: `createdAt` drives list display (`formatDateInTokyo`); DOM has no measured-at attribute.
 * Header `measuredAt` comes from fetch-posture-analysis-report formatting (read report view).
 * Bundle does not guarantee `createdAt === measuredAt`.
 */
export type VerifiedCustomerReportListItem = {
    id: string;
    analysisId: string;
    customerId: string;
    createdAt: string;
};

export const VERIFIED_CUSTOMER_HISTORY_EMPTY_TEST_ID = 'analysis-report-history-empty';

/**
 * CustomerPostureAnalysisReportListPage first-page fetch uses newest-first list order (fixture + staging traces).
 * Selection uses API row order, not DOM order alone.
 */
export const VERIFIED_CUSTOMER_HISTORY_NEWEST_FIRST_SORT_TYPES = ['DESC'] as const;
