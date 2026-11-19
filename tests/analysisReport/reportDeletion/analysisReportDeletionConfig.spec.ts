import { test, expect } from '@playwright/test';
import { resolveAnalysisReportDeletionRunConfig } from './analysisReportDeletionConfig';

test('off mode requires no customer id', () => {
    const prior = process.env.ANALYSIS_REPORT_DELETION_MODE;
    process.env.ANALYSIS_REPORT_DELETION_MODE = 'off';
    delete process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID;
    const config = resolveAnalysisReportDeletionRunConfig('https://fixture.test');
    expect(config.mode).toBe('off');
    process.env.ANALYSIS_REPORT_DELETION_MODE = prior;
});

test('invalid mode fails validation', () => {
    process.env.ANALYSIS_REPORT_DELETION_MODE = 'destroy-all';
    expect(() => resolveAnalysisReportDeletionRunConfig('https://fixture.test')).toThrow(/Invalid/);
    delete process.env.ANALYSIS_REPORT_DELETION_MODE;
});
