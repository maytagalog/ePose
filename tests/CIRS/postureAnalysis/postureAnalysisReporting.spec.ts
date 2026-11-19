import { test, expect } from '@playwright/test';
import { PostureAnalysisRunTracker } from './postureAnalysisReporting';

test('CIRS_POSTURE_ANALYSIS_REPORT_OPENING_SKIPPED keeps sameRecordReopen Not reached', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new PostureAnalysisRunTracker({ accountEmail: 'user@example.com' });
        tracker.customerId = 'c1';
        tracker.recordId = 'r1';
        tracker.navSummary.backToSelectedCustomerPage = 'Passed';
        tracker.logReportOpeningSkipped(`/customers/c1`);
    } finally {
        console.log = original;
    }
    const skippedLine = lines.find((line) => line.startsWith('CIRS_POSTURE_ANALYSIS_REPORT_OPENING_SKIPPED '));
    expect(skippedLine).toBeDefined();
    const payload = JSON.parse(skippedLine!.slice('CIRS_POSTURE_ANALYSIS_REPORT_OPENING_SKIPPED '.length));
    expect(payload.reportOpening).toBe('skipped_no_analysis_reports');
    expect(payload.navSummary.sameRecordReopen).toBe('Not reached');
    expect(payload.navSummary.firstReportOpening).toBe('Skipped');
});

test('failure evidence retains analysisId captured before card click', () => {
    const tracker = new PostureAnalysisRunTracker();
    tracker.customerId = 'c1';
    tracker.recordId = 'r1';
    tracker.analysisId = 'analysis-selected-before-click';
    tracker.logReportOpeningFailed(new Error('analysis-report-score not populated'), '/customers/c1/reports/analysis-selected-before-click');
    expect(tracker.toEvidence().analysisId).toBe('analysis-selected-before-click');
});

test('CIRS_POSTURE_ANALYSIS_LIMIT_DIALOG_VERIFIED marks summary Passed', () => {
    const tracker = new PostureAnalysisRunTracker();
    tracker.logLimitDialogVerified('/customers/c1/interaction-records/r1');
    expect(tracker.navSummary.newAnalysisLimitDialog).toBe('Passed');
    expect(tracker.limitDialogVerified).toBe(true);
});
