import { test, expect } from '@playwright/test';
import { AnalysisReportPdfStageTracker } from './analysisReportPdfStageTracker';
import { ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON } from '../analysisReportTestIds';

test('PDF reporting: menu failure leaves generation not reached (explicit stages)', () => {
    const tracker = new AnalysisReportPdfStageTracker();
    tracker.enter('login');
    tracker.pass('login');
    tracker.enter('navigation');
    tracker.pass('navigation');
    tracker.enter('applicationPrintMenuAction');
    tracker.fail('applicationPrintMenuAction');

    expect(tracker.outcome('applicationPrintMenuAction')).toBe('Failed');
    expect(tracker.outcome('a4PdfGeneration')).toBe('Not reached');
    expect(tracker.outcome('savedPdfFileValidation')).toBe('Not reached');
});

test('PDF reporting: skip marks generation stages skipped', () => {
    const tracker = new AnalysisReportPdfStageTracker();
    tracker.skipPdfGenerationStages();
    expect(tracker.outcome('a4PdfGeneration')).toBe('Skipped');
    expect(tracker.outcome('savedPdfFileValidation')).toBe('Skipped');
    expect(tracker.outcome('pdfContentVerification')).toBe('Skipped');
    expect(tracker.outcome('login')).toBe('Not reached');
});

test('PDF reporting: A4 fail vs content fail stages', () => {
    const tracker = new AnalysisReportPdfStageTracker();
    tracker.pass('login');
    tracker.pass('navigation');
    tracker.pass('contentExpectations');
    tracker.pass('applicationPrintMenuAction');
    tracker.pass('a4PdfGeneration');
    tracker.fail('savedPdfFileValidation');
    tracker.fail('pdfContentVerification');
    expect(tracker.toVerificationRecord().savedPdfFileValidation).toBe('Failed');
});

test('PDF reporting: skip reason constant present for non-chromium', () => {
    expect(ANALYSIS_REPORT_PDF_GENERATION_SKIP_REASON).toMatch(/Chromium/i);
});
