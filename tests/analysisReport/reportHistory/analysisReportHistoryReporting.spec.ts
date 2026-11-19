import { test, expect } from '@playwright/test';
import { AnalysisReportHistoryStageTracker, markOpenStagesFailed } from './analysisReportHistoryStageTracker';

test('history stages: failure leaves later stages Not reached', () => {
    const tracker = new AnalysisReportHistoryStageTracker();
    tracker.pass('login');
    tracker.pass('sourceReportVerification');
    tracker.enter('ellipsisHistoryAction');
    tracker.fail('ellipsisHistoryAction');
    markOpenStagesFailed(tracker);
    expect(tracker.outcome('historyReadiness')).toBe('Not reached');
    expect(tracker.outcome('customerHistoryListTerminal')).toBe('Not reached');
});
