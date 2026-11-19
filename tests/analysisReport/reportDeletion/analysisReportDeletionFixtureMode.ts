import { ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN } from '../../e2e/fixtures/analysisReport/reportDeletion/analysisReportDeletionFixtureShell';

export function isDeletionFixtureOrigin(url: string): boolean {
    return url.startsWith(ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN);
}
