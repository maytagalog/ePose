import { test, expect } from '@playwright/test';
import {
    describeComparisonPdfExecutionContextAfterSave,
    describeComparisonPdfExecutionContextPlan,
} from './comparisonReportPdfExecutionContext';

test('comparison PDF execution note uses plan wording before save', () => {
    const plan = describeComparisonPdfExecutionContextPlan('primary-headed-chromium', true);
    expect(plan).toContain('probe succeeded');
    expect(plan).not.toMatch(/PDF saved|PDF generated/i);
    expect(plan).toMatch(/not written until the save stage passes/i);
});

test('comparison PDF execution note documents save only after success', () => {
    const before = describeComparisonPdfExecutionContextAfterSave('primary-headed-chromium', true, false);
    const after = describeComparisonPdfExecutionContextAfterSave('primary-headed-chromium', true, true);
    expect(before).not.toMatch(/PDF saved/i);
    expect(after).toMatch(/PDF saved/i);
});