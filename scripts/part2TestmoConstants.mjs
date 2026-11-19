/** @typedef {'Passed' | 'Failed' | 'Skipped'} Part2TestmoCaseStatus */

export const PART2_FEATURE_CLASSNAME = 'e2e/part2SmokeTestmoFeature.spec.ts';
export const PART2_AGGREGATE_CLASSNAME = 'e2e/fullE2ESmokePart2.spec.ts';
export const PART2_AGGREGATE_TESTNAME = 'fullE2ESmokePart2';

/** Stable TestMo automation identities (Part 2 smoke bucket). */
export const PART2_TESTMO_CASE_DEFINITIONS = [
    { key: 'login', automationKey: 'part2-smoke-login', title: 'Login' },
    { key: 'limitDialog', automationKey: 'part2-smoke-limit-dialog', title: 'Limit Dialog' },
    { key: 'cirsRecordNavigation', automationKey: 'part2-smoke-cirs-record-navigation', title: 'CIRS record creation and list navigation' },
    { key: 'cirsResponseDetails', automationKey: 'part2-smoke-cirs-response-details', title: 'CIRS Response Details' },
    { key: 'cirsHandwrittenNotes', automationKey: 'part2-smoke-cirs-handwritten-notes', title: 'Handwritten note create/read/update/delete' },
    { key: 'cirsTakeoverHandover', automationKey: 'part2-smoke-cirs-takeover-handover', title: 'Takeover handover create/read/update/delete' },
    { key: 'cirsPostureAnalysisListHandoff', automationKey: 'part2-smoke-cirs-posture-list-handoff', title: 'CIRS posture analysis (limit dialog, list verification, Analysis Report handoff)' },
    { key: 'cirsRecordDeletion', automationKey: 'part2-smoke-cirs-record-deletion', title: 'CIRS record deletion' },
    { key: 'analysisReportView', automationKey: 'part2-smoke-analysis-report-view', title: 'Analysis Report view' },
    { key: 'analysisReportDisplaySettings', automationKey: 'part2-smoke-analysis-report-display-settings', title: 'Analysis Report display settings' },
    { key: 'analysisReportShareQr', automationKey: 'part2-smoke-analysis-report-share-qr', title: 'Analysis Report QR sharing' },
    { key: 'analysisReportShareEmail', automationKey: 'part2-smoke-analysis-report-share-email', title: 'Share email — UI send confirmation (Analysis Report)' },
    { key: 'comparisonReportView', automationKey: 'part2-smoke-comparison-report-view', title: 'Comparison Report view and report switch' },
    { key: 'comparisonShareQr', automationKey: 'part2-smoke-comparison-share-qr', title: 'Comparison Report QR sharing' },
    { key: 'comparisonShareEmail', automationKey: 'part2-smoke-comparison-share-email', title: 'Share email — UI send confirmation (Comparison Report)' },
    { key: 'comparisonReportPdf', automationKey: 'part2-smoke-comparison-report-pdf', title: 'Comparison A4 PDF save and validation' },
    { key: 'exitComparison', automationKey: 'part2-smoke-exit-comparison', title: 'Exit comparison to single Analysis Report' },
    { key: 'analysisReportPdf', automationKey: 'part2-smoke-analysis-report-pdf', title: 'A4 PDF generation and validation' },
    { key: 'analysisReportHistory', automationKey: 'part2-smoke-analysis-report-history', title: 'Ellipsis Report History' },
    { key: 'analysisReportDeletion', automationKey: 'part2-smoke-analysis-report-deletion', title: 'Analysis Report deletion (simplified UI confirm + customer list redirect)' },
    { key: 'logout', automationKey: 'part2-smoke-logout', title: 'Logout' },
];

export const AR_FEATURE_TO_CASE = {
    reportView: 'analysisReportView',
    displaySettings: 'analysisReportDisplaySettings',
    shareQr: 'analysisReportShareQr',
    shareEmail: 'analysisReportShareEmail',
    reportPdf: 'analysisReportPdf',
    reportHistory: 'analysisReportHistory',
    reportDeletion: 'analysisReportDeletion',
};

export const FEATURE_TO_CASE_KEY = {
    login: 'login',
    limitDialog: 'limitDialog',
    cirsRecordNavigation: 'cirsRecordNavigation',
    cirsResponseDetails: 'cirsResponseDetails',
    cirsHandwrittenNotes: 'cirsHandwrittenNotes',
    cirsTakeoverHandover: 'cirsTakeoverHandover',
    cirsPostureAnalysis: 'cirsPostureAnalysisListHandoff',
    analysisReport: 'analysisReportView',
    logout: 'logout',
};

export const NOT_REACHED_DETAIL = 'Not reached: blocked by earlier Part 2 failure';
export const UNKNOWN_DETAIL = 'Unknown: insufficient retained verification evidence';
export const PASSED_OUTCOME_ONLY_DETAIL =
    'Passed according to retained run outcome; detailed verification evidence unavailable.';
