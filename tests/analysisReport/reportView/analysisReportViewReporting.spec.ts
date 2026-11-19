import { test, expect } from '@playwright/test';
import { AnalysisReportViewRunTracker } from './analysisReportViewReporting';

test('tracker records skip reason for exercises and stretches', () => {
    const tracker = new AnalysisReportViewRunTracker({ accountEmail: 'a@example.com' });
    tracker.bindIdentifiers('c1', 'a1');
    tracker.stepStarted('exercises and stretches');
    tracker.stepSkipped('exercises and stretches', 'section not shown');
    const evidence = tracker.toEvidence('/customers/c1');
    expect(evidence.stepSummary['exercises and stretches']).toBe('Skipped');
    expect(evidence.skipReasons['exercises and stretches']).toBe('section not shown');
});
