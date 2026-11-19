/**
 * Analysis Report automation attributes (developer contract — single-report viewing).
 * Report URL id is {@link ANALYSIS_ID_ATTR} only (no data-report-id).
 */
export const ANALYSIS_ID_ATTR = 'data-analysis-id';
export const CUSTOMER_ID_ATTR = 'data-customer-id';
export const REPORT_LOAD_STATE_ATTR = 'data-load-state';

export const ANALYSIS_REPORT_LOAD_STATES = {
    loading: 'loading',
    ready: 'ready',
    error: 'error',
} as const;

export const ANALYSIS_REPORT_ROW_TEST_ID = 'cirs-analysis-item';

/** Section 6 / §14 global all-reports list (distinct from customer history list). */
export const ANALYSIS_REPORT_ALL_LIST_TEST_IDS = {
    list: 'cirs-analysis-list',
    loading: 'cirs-analysis-loading',
    empty: 'cirs-analysis-empty',
} as const;

/** §14 customer report history (menu 過去のレポート and bottom link destination). */
export const ANALYSIS_REPORT_HISTORY_TEST_IDS = {
    list: 'analysis-report-history-list',
    loading: 'analysis-report-history-loading',
    /** Customer-scoped history empty (PostureAnalysisReportList history=true). Global list uses cirs-analysis-empty. */
    empty: 'analysis-report-history-empty',
    back: 'cirs-analysis-back',
} as const;

/**
 * Comparison Report View (bundle: PostureAnalysis/Comparison/Comparison.tsx, PostureAnalysisHeader.tsx).
 * Verified read-only on staging `app-stg.epose.com/assets/index-ed958284.js` (2026-11-14).
 */
export const ANALYSIS_REPORT_COMPARISON_TEST_IDS = {
    compareOpen: 'analysis-report-compare-open',
    compareExit: 'analysis-report-compare-exit',
    root: 'analysis-report-comparison',
    loading: 'analysis-report-comparison-loading',
    column: 'analysis-report-comparison-column',
    selectorInput: 'analysis-report-comparison-selector',
    options: 'analysis-report-comparison-options',
    optionsPopup: 'analysis-report-comparison-options-popup',
    option: 'analysis-report-comparison-option',
    listOpen: 'analysis-report-comparison-list-open',
    errorToastKey: 'analysis-report-comparison-error',
} as const;

export const ANALYSIS_REPORT_COMPARISON_ATTRS = {
    comparisonSlot: 'data-comparison-slot',
    comparisonSlotLeft: 'left',
    comparisonSlotRight: 'right',
    customerId: CUSTOMER_ID_ATTR,
    analysisId: ANALYSIS_ID_ATTR,
} as const;

/** Share QR dialog / actions menu when data-report-view=comparison (bundle QRCodeShareDialog.tsx). */
export const ANALYSIS_REPORT_SHARE_QR_COMPARISON_ATTRS = {
    reportView: 'data-report-view',
    reportViewComparison: 'comparison',
    leftAnalysisId: 'data-left-analysis-id',
    rightAnalysisId: 'data-right-analysis-id',
} as const;

/** Comparison page resets document scroll on enter (Comparison.tsx window.scrollTo). */
export const ANALYSIS_REPORT_COMPARISON_SCROLL_TARGET = 'window' as const;

/**
 * Trace-backed section headings inside each comparison column (staging comparison UI).
 * Bundle Comparison.tsx renders sagittal/frontal, posture type, and leg/COM blocks — not single-report section testids.
 */
export const ANALYSIS_REPORT_COMPARISON_SECTION_LABELS = {
    standingSagittalPlane: '立位矢状面',
    standingFrontalPlane: '立位前額面',
    postureType: '姿勢タイプ',
    centerOfGravity: '重心位置',
} as const;

/** Trace-backed customer info labels in the comparison page chrome (staging 2026-11-14). */
export const ANALYSIS_REPORT_COMPARISON_HEADER_LABELS = {
    customerName: '氏名',
} as const;

export type AnalysisReportComparisonSectionLabelKey = keyof typeof ANALYSIS_REPORT_COMPARISON_SECTION_LABELS;

export const ANALYSIS_REPORT_COMPARISON_AUTOMATION_GAPS = {
    selectorHookPlacement:
        'analysis-report-comparison-selector is set on the Ant Design Select search input (data-comparison-slot=left), not the visible selection box.',
    optionsPopupClass:
        'Ant Select popup root uses class analysis-report-comparison-options-popup; options expose data-testid=analysis-report-comparison-option and data-analysis-id.',
    rightColumnHeader:
        'Right column header uses labelLatest variant (no dropdown); report switching uses the left selector only.',
    shareQrComparison:
        'Comparison ellipsis uses same analysis-report-actions-* hooks with data-report-view=comparison. Share QR dialog root exposes data-report-view=comparison plus data-left-analysis-id / data-right-analysis-id; QR SVG uses analysis-report-share-qr-code (bundle index-ed958284.js).',
    shareEmailComparison:
        'Comparison share email uses analysis-report-share-email-* on dialog root with data-report-view=comparison plus data-left-analysis-id / data-right-analysis-id; POST share_report with sharedReportEmailSendingUrl from generate_comparison_report_url. Guest route PATHS.REPORTS.SHARED_REPORT_COMPARISON → /shared-report-comparison; data load GET fetch_shared_public_comparison_report?token=.',
    scrollContainer:
        'No dedicated comparison scroll test id; bundle resets window.scrollTo(0,0). Automation scrolls window and asserts sections within analysis-report-comparison.',
    comparisonPdfCustomerName:
        'Comparison staff view has no analysis-report-header; PDF content expectations scope to the trace comparison chrome (analysis-report-compare-exit ancestor) and read 氏名 from the label/value row (not page-wide text or app banner).',
} as const;

export const ANALYSIS_REPORT_SINGLE_TEST_IDS = {
    report: 'analysis-report',
    loading: 'analysis-report-loading',
    header: 'analysis-report-header',
    headerField: 'analysis-report-header-field',
    summary: 'analysis-report-summary',
    score: 'analysis-report-score',
    generationRating: 'analysis-report-generation-rating',
    generationRatingHelp: 'analysis-report-generation-rating-help',
    resultsHelp: 'analysis-report-results-help',
    sideStanding: 'analysis-report-side-standing',
    frontStanding: 'analysis-report-front-standing',
    photo: 'analysis-report-photo',
    photoAdjust: 'analysis-report-photo-adjust',
    metric: 'analysis-report-metric',
    metricChart: 'analysis-report-metric-chart',
    postureType: 'analysis-report-posture-type',
    postureTypeValue: 'analysis-report-posture-type-value',
    postureTypeIllustration: 'analysis-report-posture-type-illustration',
    postureTypeChart: 'analysis-report-posture-type-chart',
    legAlignment: 'analysis-report-leg-alignment',
    legImage: 'analysis-report-leg-image',
    legIllustration: 'analysis-report-leg-illustration',
    legResult: 'analysis-report-leg-result',
    balanceChart: 'analysis-report-balance-chart',
    balanceValue: 'analysis-report-balance-value',
    muscleCondition: 'analysis-report-muscle-condition',
    muscleGroup: 'analysis-report-muscle-group',
    muscleGroupEmpty: 'analysis-report-muscle-group-empty',
    muscleItem: 'analysis-report-muscle-item',
    musclesShowAll: 'analysis-report-muscles-show-all',
    musclesHideAll: 'analysis-report-muscles-hide-all',
    muscleGroupShow: 'analysis-report-muscle-group-show',
    muscleGroupHide: 'analysis-report-muscle-group-hide',
    exercisesStretches: 'analysis-report-exercises-stretches',
    exercises: 'analysis-report-exercises',
    stretches: 'analysis-report-stretches',
    recommendation: 'analysis-report-recommendation',
    exercisesExpand: 'analysis-report-exercises-expand',
    stretchesExpand: 'analysis-report-stretches-expand',
    /** §14 ellipsis menu: customer report history (staging label 過去のレポート). */
    historyOpenMenu: 'analysis-report-history-open',
    actionsToggle: 'analysis-report-actions-toggle',
    actionsMenu: 'analysis-report-actions-menu',
    displaySettingsOpen: 'analysis-report-display-settings-open',
    displaySettingsDialog: 'analysis-report-display-settings-dialog',
    displaySettingsSave: 'analysis-report-display-settings-save',
    exercisesStretchesToggle: 'analysis-report-exercises-stretches-toggle',
    displaySettingsCancel: 'analysis-report-display-settings-cancel',
    /** Confirmed menu entry (ellipsis actions, data-report-view=single). */
    shareQrOpen: 'analysis-report-share-qr-open',
    /**
     * Developer contract: hook on share-QR modal mount (Ant Design), parallel to displaySettingsDialog.
     * Visible surface is a descendant role="dialog"; root may lack a visible box (trace 20261106-145005 pattern).
     */
    shareQrDialog: 'analysis-report-share-qr-dialog',
    /** Bundle QRCodeShareDialog / QRCodeSVG (index-ed958284.js). */
    shareQrCode: 'analysis-report-share-qr-code',
    /** Trace 20261109-072008: Close control (label とじる) scoped inside share-QR inner dialog. */
    shareQrClose: 'analysis-report-share-qr-close',
    shareEmailOpen: 'analysis-report-share-email-open',
    shareEmailDialog: 'analysis-report-share-email-dialog',
    shareEmailSubmit: 'analysis-report-share-email-submit',
    shareEmailCancel: 'analysis-report-share-email-cancel',
    shareEmailSuccess: 'analysis-report-share-email-success',
    shareEmailError: 'analysis-report-share-email-error',
    /** Staging bundle: EllipsisMenu item → window.print() (StandingPostureAnalysis.tsx). */
    printOpen: 'analysis-report-print',
    /**
     * Report delete (ellipsis, data-report-view=single). Staging JA label: deleteReport → 削除.
     * Bundle: StandingPostureAnalysis EllipsisMenu testId analysis-report-delete-open.
     */
    deleteOpen: 'analysis-report-delete-open',
    /** Modal wrapper: data-analysis-id only (no data-customer-id). See analysisReportStagingContracts.ts. */
    deleteDialog: 'analysis-report-delete-dialog',
    deleteConfirm: 'analysis-report-delete-confirm',
    deleteCancel: 'analysis-report-delete-cancel',
} as const;

export const ANALYSIS_REPORT_COMPARISON_VISIBLE_SECTIONS = [
    ANALYSIS_REPORT_COMPARISON_TEST_IDS.column,
    ...Object.keys(ANALYSIS_REPORT_COMPARISON_SECTION_LABELS),
] as const;

/** Staging i18n printPageTitle (bundle): JA / EN document.title during print handler. */
export const ANALYSIS_REPORT_PRINT_PAGE_TITLE = {
    ja: '姿勢分析レポート',
    en: 'PoseAnalysisReport',
} as const;

/** Visible JA menu label for analysis-report-print (bundle printing → 印刷). */
export const ANALYSIS_REPORT_PRINT_MENU_LABEL_JA = '印刷';

/** Playwright page.pdf() is Chromium-only; used in skip reasons for Firefox/WebKit. */
export const ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON =
    'Playwright A4 PDF generation (page.pdf) is only supported in Chromium; this is not native Safari/Firefox PDF coverage.';

/** Staging bundle: emailShareDialog.title (JA). */
export const ANALYSIS_REPORT_SHARE_EMAIL_DIALOG_TITLE = '姿勢分析レポートをメールで共有する';

/** Staging bundle: sendShareReportEmail.emailSent toast (JA). */
export const ANALYSIS_REPORT_SHARE_EMAIL_SUCCESS_TOAST = '送信に成功しました';

/** Staff app public shared single-report route (PATHS.REPORTS.SHARED_REPORT). */
export const ANALYSIS_REPORT_SHARED_REPORT_PATH = '/shared-report';

/** Staff app public shared comparison route (PATHS.REPORTS.SHARED_REPORT_COMPARISON). */
export const ANALYSIS_REPORT_SHARED_COMPARISON_REPORT_PATH = '/shared-report-comparison';

export const POST_GENERATE_SHARED_REPORT_URL = 'https://api-stg.epose.com/report/generate_report_url';
export const POST_GENERATE_COMPARISON_REPORT_URL =
    'https://api-stg.epose.com/report/generate_comparison_report_url';
export const POST_SHARE_REPORT_EMAIL_URL = 'https://api-stg.epose.com/report/share_report';
/** Staging bundle: reportRepository.fetchSharedPublicReport → GET with token query. */
export const GET_FETCH_SHARED_REPORT_URL = 'https://api-stg.epose.com/report/fetch_shared_report';
/** Staging bundle: fetchSharedPublicComparisonReport → GET with token query. */
export const GET_FETCH_SHARED_COMPARISON_REPORT_URL =
    'https://api-stg.epose.com/report/fetch_shared_public_comparison_report';

/**
 * Guest /shared-report-comparison (bundle comparePostureAnalysisReport.title JA).
 * Shared Comparison omits staff column testids — assert via visible page text + API current/latest ids.
 */
export const ANALYSIS_REPORT_SHARED_GUEST_COMPARISON_VISIBLE = {
    comparisonTitle: '立位姿勢分析レポート（比較）',
} as const;

/** Staff comparison view heading (bundle comparePostureAnalysisReport.title JA). */
export const ANALYSIS_REPORT_COMPARISON_REPORT_TITLE =
    ANALYSIS_REPORT_SHARED_GUEST_COMPARISON_VISIBLE.comparisonTitle;

/** Comparison route suffix (PATHS.REPORTS.COMPARE). */
export const ANALYSIS_REPORT_COMPARISON_ROUTE_SEGMENT = 'compare';

/**
 * Trace-backed locators for guest /shared-report (automation=!pt; no analysis-report testids).
 * Customer name: fetch_shared_report report.customer.fullName (trace 20261109-092223); visible on guest header.
 * Report title: postureAnalysisReport.standingPostureAnalysis → 立位姿勢分析.
 * Summary block: trace 20261109-085356 shows AI判定, スコア, 世代別評価 (not 総合評価).
 * Print layout duplicates labels off-screen (.show-on-print { display: none }); assert visible=true with count 1.
 */
export const ANALYSIS_REPORT_SHARED_GUEST_VISIBLE = {
    standingPostureTitle: '立位姿勢分析',
    aiJudgment: 'AI判定',
    score: 'スコア',
    generationRating: '世代別評価',
} as const;

/** Required visible summary markers for standing single-report PDF content checks (JA contract). */
export const ANALYSIS_REPORT_PDF_REQUIRED_SECTION_MARKERS = [
    ANALYSIS_REPORT_SHARED_GUEST_VISIBLE.aiJudgment,
    ANALYSIS_REPORT_SHARED_GUEST_VISIBLE.score,
] as const;

/** Staging standing report: print-only branch uses show-on-print (hidden on screen). */
export const ANALYSIS_REPORT_SHARED_GUEST_PRINT_ONLY_CLASS = 'show-on-print';

export const ANALYSIS_REPORT_HEADER_FIELDS = {
    name: 'name',
    height: 'height',
    age: 'age',
    sex: 'sex',
    measuredAt: 'measuredAt',
} as const;

/** Trace 20261106-081420: bottom control shows "{customerName} 姿勢分析レポート一覧" (not a link). */
export const ANALYSIS_REPORT_BOTTOM_HISTORY_LABEL_SUFFIX = '姿勢分析レポート一覧';

/** Staging: section help triggers use this asset path fragment (do not match the full hashed filename). */
export const ANALYSIS_REPORT_SECTION_HELP_IMG_SRC_FRAGMENT = '/help_black-';

export const ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE = {
    postureType: 'AI姿勢タイプ判定について',
    legAlignment: 'X脚・O脚と重心について',
    muscleCondition: '筋肉の状態について',
    exercisesStretches: 'エクササイズとストレッチ',
} as const;

/** Exact modal title text for top-of-report help buttons (staging Ant Design). */
/** Trace 20261106-134217: generation-rating modal title is 世代別評価とは (not について). */
export const ANALYSIS_REPORT_TOP_HELP_DIALOG_TITLE = {
    generationRating: '世代別評価とは',
    results: '分析結果について',
} as const;

export type AnalysisReportSectionHelpDialogKey =
    | 'postureTypeHelp'
    | 'legAlignmentHelp'
    | 'muscleConditionHelp'
    | 'exercisesStretchesHelp';

export const ANALYSIS_REPORT_PHOTO_VIEWS = {
    side: 'side',
    front: 'front',
} as const;

export const ANALYSIS_REPORT_PHOTO_IMAGE_STATES = {
    unavailable: 'unavailable',
    loading: 'loading',
    ready: 'ready',
    error: 'error',
} as const;

export const SIDE_METRIC_KEYS = [
    'WholeBodyBFTilt',
    'UpperBodyBFTilt',
    'LowerBodyBFTilt',
    'HeadBFTilt',
    'HeadGap',
    'DegreeOfHunchBack',
    'PelvicTilt',
    'WaistOffset',
    'KneeBendDegree',
] as const;

export const FRONT_METRIC_KEYS = [
    'WholeBodyLRTilt',
    'UpperBodyLRTilt',
    'LowerBodyLRTilt',
    'HeadLRTilt',
    'NeckLRPositionalGap',
    'ShoulderLRTilt',
    'ChestLRPositionalGap',
    'WaistLRTilt',
    'WaistLRPositionalGap',
] as const;

export const ANALYSIS_REPORT_AUTOMATION_GAPS = {
    mainMenuItem:
        'No data-testid on the header Menu → global Analysis Report List item; automation uses the navigation dialog label 分析レポート一覧 (trace 20261104-133702; same pattern as referralCouponFlow).',
    globalListRoute:
        'Contract §14: all-reports page keeps cirs-analysis-list / cirs-analysis-loading / cirs-analysis-empty; ' +
        'analysis-report-history-list may coexist in the DOM. Automation distinguishes global vs customer history by route ' +
        '(not /customers/{id}/posture-analysis-report) plus visible cirs-analysis-list. ' +
        'Trace 20261104-134714: nested duplicate cirs-analysis-loading hooks; readiness waits for visible ant-spin-spinning to clear, not wrapper removal.',
    singleReportBottomHistoryLink:
        'Trace 20261106-081420: bottom control is a DIV with full text "{header name} 姿勢分析レポート一覧" under analysis-report, not role=link. Automation scopes to that string from analysis-report-header-field[name].',
    helpDialogDismiss:
        'Ant Design modals: close via button scoped to the visible dialog with accessible name Close (aria-label). Generation/results fixture modals match this; Escape remains a fallback where present.',
    shareQrDialog:
        'Share QR: data-testid analysis-report-share-qr-dialog on modal mount (same Ant inner role=dialog pattern as display settings). Menu entry analysis-report-share-qr-open confirmed. Close: dedicated analysis-report-share-qr-close (trace 20261109-072008; visible label とじる) — not the help modals’ aria-label=Close control.',
    /**
     * Contract vs implementation: only flows with a stable data-testid trigger + identifiable dialog title are automated.
     * See ANALYSIS_REPORT_HELP_DIALOG_COVERAGE for the explicit inventory.
     */
    helpDialogsCoverageNote:
        'See helpDialogOutcomes on run evidence: generation + results (top), plus section-scoped img triggers per ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.',
    measuredAtHeaderField:
        'Developer doc §4 lists analysis-report-header-field measuredAt with data-datetime; trace 20261104-131549 shows staging uses data-value (ISO timestamp). Automation validates data-value only.',
    reportDeletionLiveSuccessNavigation:
        'Staging bundle (useDeleteReport onSuccess): navigateTo PATHS.CUSTOMERS.BASE_PATH (/customers), not customer history. ' +
        'Post-delete history absence verification requires a separate navigation back to /customers/{id}/posture-analysis-report.',
    reportHistoryChronology:
        'Customer-history DOM exposes data-analysis-id/data-customer-id only. Chronology uses API item.createdAt from POST /report/fetch_customer_report ' +
        'after InfiniteScroll pagination completes (page size 25). DOM scroll alone does not prove completeness.',
    reportDeleteResponseBody:
        'Bundle checks mutation result `data` truthy; exact delete_report response JSON shape is not fully typed in the minified bundle.',
    reportHeaderPlacement:
        'Trace 20261104-131549: analysis-report-header is outside analysis-report; header-field hooks are descendants of the page-scoped header.',
    reportPhotoHook:
        'Staging: analysis-report-photo is the IMG element (data-view, data-image-state on the image). Automation must not assume a wrapper with a nested img.',
} as const;

/**
 * Help-modal inventory. Section helps: staging DOM — img[src*="/help_black-"] under section data-testid; dialog title exact strings in ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.
 */
export const ANALYSIS_REPORT_HELP_DIALOG_COVERAGE = {
    generationRatingHelp: {
        status: 'implemented' as const,
        triggerTestId: 'analysis-report-generation-rating-help',
        dialogExactTitle: '世代別評価とは',
        evidence:
            'Trace 20261106-134217 exact title; button trigger + ant-style dialog; close via aria-label=Close.',
    },
    resultsHelp: {
        status: 'implemented' as const,
        triggerTestId: 'analysis-report-results-help',
        dialogExactTitle: '分析結果について',
        evidence: 'Button trigger + ant-style dialog with exact title; close via aria-label=Close.',
    },
    postureTypeHelp: {
        status: 'implemented' as const,
        sectionTestId: 'analysis-report-posture-type',
        triggerPattern: 'section locator(img[src*="/help_black-"])',
        dialogExactTitle: ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.postureType,
        evidence: 'Staging screenshots 2026-11-06.',
    },
    legAlignmentHelp: {
        status: 'implemented' as const,
        sectionTestId: 'analysis-report-leg-alignment',
        triggerPattern: 'section locator(img[src*="/help_black-"])',
        dialogExactTitle: ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.legAlignment,
        evidence: 'Staging screenshots 2026-11-06.',
    },
    muscleConditionHelp: {
        status: 'implemented' as const,
        sectionTestId: 'analysis-report-muscle-condition',
        triggerPattern: 'section locator(img[src*="/help_black-"])',
        dialogExactTitle: ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.muscleCondition,
        evidence: 'Staging screenshots 2026-11-06.',
    },
    exercisesStretchesHelp: {
        status: 'implemented' as const,
        sectionTestId: 'analysis-report-exercises-stretches',
        triggerPattern: 'section locator(img[src*="/help_black-"])',
        dialogExactTitle: ANALYSIS_REPORT_SECTION_HELP_DIALOG_TITLE.exercisesStretches,
        evidence: 'Staging screenshots 2026-11-06; skipped when section absent per exercises step rules.',
    },
} as const;

export function analysisReportDetailPath(customerId: string, analysisId: string): string {
    return `/customers/${customerId}/reports/${analysisId}`;
}

export function analysisReportDetailUrlPattern(customerId: string, analysisId: string): RegExp {
    const escapedCustomer = customerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedAnalysis = analysisId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
        `/customers/${escapedCustomer}/reports/${escapedAnalysis}(?:/|$|\\?)`,
        'i'
    );
}

export function parseAnalysisIdFromReportUrl(url: string): string | null {
    const match = url.match(/\/customers\/[0-9a-f-]{36}\/reports\/([^/?]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
}
