/**
 * Synthetic hooks used only by tests/e2e/fixtures/analysisReport/reportDeletion/.
 * Not present on staging; do not use in live smoke helpers.
 */
export const ANALYSIS_REPORT_DELETION_FIXTURE_ROW_MEASURED_AT_ATTR = 'data-measured-at';

export const ANALYSIS_REPORT_DELETION_FIXTURE_LOAD_MORE_TEST_ID = 'analysis-report-history-load-more';

export const ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_SUCCESS_TEST_ID = 'analysis-report-delete-success';

export const ANALYSIS_REPORT_DELETION_FIXTURE_DELETE_API_URL =
    'https://api-stg.epose.com/report/delete_report';

/** Synthetic staff account id used only by deletion fixture shell delete POST bodies. */
export const ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID = 'fixture-account-id';
