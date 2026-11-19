import { test, expect } from '@playwright/test';
import { SmokePart2RunTracker } from './smokePart2Reporting';
import type { ExistingUserCustomersReadiness } from '../../login/existingUserLoginFlow';
import {
    PART2_TESTMO_CASE_DEFINITIONS,
    buildPart2TestmoCoverageReport,
    buildPart2TestmoCoverageFromJUnitSystemOut,
    logPart2TestmoCoverage,
} from './part2TestmoReporting';

const fullArStages = {
    login: 'Skipped',
    preflight: 'Passed',
    reportView: 'Passed',
    displaySettings: 'Passed',
    shareQr: 'Passed',
    shareEmail: 'Passed',
    reportPdf: 'Passed',
    reportHistory: 'Passed',
    reportDeletion: 'Skipped',
} as const;

test('successful Part 2 with CIRS + Analysis Report and deletion off', () => {
    const tracker = new SmokePart2RunTracker('user@example.com');
    tracker.logLoginVerified({
        profileEmailVerified: true,
        identityEvidence: { status: 'verified' },
        takeoverDetected: false,
        takeoverConfirmed: false,
    } as ExistingUserCustomersReadiness);
    tracker.outcomes.limitDialog = 'passed';
    tracker.outcomes.cirsRecordNavigation = 'passed';
    tracker.outcomes.cirsResponseDetails = 'passed';
    tracker.outcomes.cirsHandwrittenNotes = 'passed';
    tracker.outcomes.cirsTakeoverHandover = 'passed';
    tracker.outcomes.cirsPostureAnalysis = 'passed';
    tracker.outcomes.analysisReport = 'passed';
    tracker.outcomes.logout = 'passed';

    const report = buildPart2TestmoCoverageReport({
        featureOutcomes: { ...tracker.outcomes },
        analysisReport: {
            featureStages: { ...fullArStages },
            deletionMode: 'off',
            combinedPassed: true,
            runOutputRoot: 'test-output/analysisReportFull/fixture-run',
            reportPdf: null,
            reportDeletion: null,
        },
    });

    expect(report.cases.find((c) => c.key === 'analysisReportDeletion')?.status).toBe('Skipped');
    expect(report.cases.find((c) => c.key === 'analysisReportDeletion')?.outcomeDetail).toMatch(
        /Deletion mode off/
    );
    expect(report.cases.filter((c) => c.status === 'Passed').length).toBeGreaterThan(10);
    expect(report.cases.find((c) => c.key === 'cirsRecordDeletion')?.status).toBe('Skipped');
});

test('CIRS failure keeps Analysis Report cases Not reached', () => {
    const report = buildPart2TestmoCoverageReport({
        featureOutcomes: {
            login: 'passed',
            limitDialog: 'passed',
            cirsRecordNavigation: 'failed',
            cirsResponseDetails: 'not_reached',
            cirsHandwrittenNotes: 'not_reached',
            cirsTakeoverHandover: 'not_reached',
            cirsPostureAnalysis: 'not_reached',
            analysisReport: 'not_reached',
            comparisonReport: 'not_reached',
            logout: 'not_reached',
        },
        failureReason: 'CIRS preview mismatch',
    });
    const arCases = report.cases.filter((c) => c.key.startsWith('analysisReport'));
    expect(arCases.every((c) => c.status === 'Skipped')).toBe(true);
    expect(arCases.every((c) => c.outcomeDetail.includes('Not reached'))).toBe(true);
});

test('Analysis Report failure leaves later AR stages Not reached', () => {
    const report = buildPart2TestmoCoverageReport({
        featureOutcomes: {
            login: 'passed',
            limitDialog: 'passed',
            cirsRecordNavigation: 'passed',
            cirsResponseDetails: 'passed',
            cirsHandwrittenNotes: 'passed',
            cirsTakeoverHandover: 'passed',
            cirsPostureAnalysis: 'passed',
            analysisReport: 'failed',
            comparisonReport: 'not_reached',
            logout: 'not_reached',
        },
        failureReason: 'share email timeout',
        analysisReport: {
            featureStages: {
                ...fullArStages,
                shareEmail: 'Failed',
                reportPdf: 'Not reached',
                reportHistory: 'Not reached',
                reportDeletion: 'Not reached',
            },
            deletionMode: 'off',
            combinedPassed: false,
            runOutputRoot: 'test-output/analysisReportFull/failed-run',
            reportPdf: null,
            reportDeletion: null,
        },
    });
    expect(report.cases.find((c) => c.key === 'analysisReportShareEmail')?.status).toBe('Failed');
    expect(report.cases.find((c) => c.key === 'analysisReportPdf')?.outcomeDetail).toContain(
        'Not reached'
    );
});

test('PDF capability skip reports Skipped with reason', () => {
    const report = buildPart2TestmoCoverageReport({
        featureOutcomes: {
            login: 'passed',
            limitDialog: 'passed',
            cirsRecordNavigation: 'passed',
            cirsResponseDetails: 'passed',
            cirsHandwrittenNotes: 'passed',
            cirsTakeoverHandover: 'passed',
            cirsPostureAnalysis: 'passed',
            analysisReport: 'passed',
            comparisonReport: 'not_reached',
            logout: 'passed',
        },
        analysisReport: {
            featureStages: { ...fullArStages, reportPdf: 'Skipped' },
            deletionMode: 'off',
            combinedPassed: true,
            runOutputRoot: 'test-output/analysisReportFull/pdf-skip',
            reportPdf: {
                pdfGenerationSkipReason: 'browser capability: webkit cannot page.pdf',
            } as never,
            reportDeletion: null,
        },
    });
    const pdf = report.cases.find((c) => c.key === 'analysisReportPdf');
    expect(pdf?.status).toBe('Skipped');
    expect(pdf?.outcomeDetail).toContain('browser capability');
});

test('simplified deletion success uses ui-confirmation coverage label', () => {
    const report = buildPart2TestmoCoverageReport({
        featureOutcomes: {
            login: 'passed',
            limitDialog: 'passed',
            cirsRecordNavigation: 'passed',
            cirsResponseDetails: 'passed',
            cirsHandwrittenNotes: 'passed',
            cirsTakeoverHandover: 'passed',
            cirsPostureAnalysis: 'passed',
            analysisReport: 'passed',
            comparisonReport: 'not_reached',
            logout: 'passed',
        },
        analysisReport: {
            featureStages: { ...fullArStages, reportDeletion: 'Passed' },
            deletionMode: 'delete-once',
            combinedPassed: true,
            runOutputRoot: 'test-output/analysisReportFull/delete-once',
            reportPdf: null,
            reportDeletion: {
                deletionCoverage: 'ui-confirmation-and-customer-list-redirect',
            } as never,
        },
    });
    const del = report.cases.find((c) => c.key === 'analysisReportDeletion');
    expect(del?.status).toBe('Passed');
    expect(del?.outcomeDetail).toBe('ui-confirmation-and-customer-list-redirect');
});

test('no duplicate automation keys', () => {
    const keys = PART2_TESTMO_CASE_DEFINITIONS.map((d) => d.automationKey);
    expect(new Set(keys).size).toBe(keys.length);
});

test('logPart2TestmoCoverage emits PART2_TESTMO_COVERAGE line', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        logPart2TestmoCoverage({
            featureOutcomes: {
                login: 'passed',
                limitDialog: 'passed',
                cirsRecordNavigation: 'not_reached',
                cirsResponseDetails: 'not_reached',
                cirsHandwrittenNotes: 'not_reached',
                cirsTakeoverHandover: 'not_reached',
                cirsPostureAnalysis: 'not_reached',
                analysisReport: 'not_reached',
            comparisonReport: 'not_reached',
                logout: 'not_reached',
            },
        });
    } finally {
        console.log = original;
    }
    expect(lines.some((l) => l.startsWith('PART2_TESTMO_COVERAGE '))).toBe(true);
});

test('buildPart2TestmoCoverageFromJUnitSystemOut reads embedded coverage', () => {
    const sample = `<system-out><![CDATA[
PART2_TESTMO_COVERAGE {"schemaVersion":2,"smokePart":2,"cases":[],"excluded":[],"artifacts":[],"note":"x"}
]]></system-out>`;
    const parsed = buildPart2TestmoCoverageFromJUnitSystemOut(sample);
    expect(parsed?.schemaVersion).toBe(2);
});
