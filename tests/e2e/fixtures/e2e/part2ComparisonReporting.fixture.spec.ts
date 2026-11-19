import { test, expect } from '@playwright/test';
import { SmokePart2RunTracker } from '../../shared/smokePart2Reporting';
import {
    derivePart2ComparisonCombinedPass,
    type Part2ComparisonReportRunEvidence,
} from '../../shared/part2ComparisonReportReporting';
import { buildPart2TestmoCoverageReport } from '../../shared/part2TestmoReporting';

function syntheticComparisonEvidence(
    overrides?: Partial<Part2ComparisonReportRunEvidence>
): Part2ComparisonReportRunEvidence {
    return {
        runId: 'fixture',
        runOutputRoot: 'test-output/comparisonReport/fixture',
        browserProject: 'chromium',
        browserName: 'chromium',
        browserVersion: '0',
        customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        customerDisplayNameHint: 'Fixture Customer',
        sourceSingleReportAnalysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
        selectedComparisonAnalysisId: 'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
        comparisonPairLeftId: 'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
        comparisonPairRightId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        returnedSingleReportAnalysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        comparisonViewStages: {} as Part2ComparisonReportRunEvidence['comparisonViewStages'],
        shareQr: null,
        shareEmail: null,
        reportPdf: {
            runId: 'fixture',
            runOutputRoot: 'test-output/comparisonReport/fixture',
            browserProject: 'chromium',
            browserName: 'chromium',
            browserVersion: null,
            customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            leftAnalysisId: 'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
            rightAnalysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
            menuAction: null,
            pdfGeneration: null,
            pdfValidation: {
                filePath: 'comparison-a4.pdf',
                fileSizeBytes: 100,
                parseSucceeded: true,
                pageCount: 1,
                pageDimensions: [],
                a4ValidationPassed: true,
                nonA4PageNumbers: [],
                extractedTextLength: 10,
                pairSourceVerification: {
                    leftAnalysisId: 'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
                    rightAnalysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
                },
                contentChecks: {
                    customerNameFound: true,
                    comparisonTitleFound: true,
                    leftMeasuredAtDisplayFound: true,
                    rightMeasuredAtDisplayFound: true,
                },
                contentVerificationPassed: true,
                structuralVerificationPassed: true,
            },
            pdfGenerationSkipReason: null,
            coverageLabel: 'A4 comparison PDF save and validation',
            stages: {
                login: 'Not reached',
                comparisonSetup: 'Not reached',
                contentExpectations: 'Passed',
                applicationPrintMenuAction: 'Passed',
                a4PdfSave: 'Passed',
                savedPdfFileValidation: 'Passed',
                pdfContentVerification: 'Passed',
                comparisonPairPreserved: 'Passed',
            },
            failureStep: null,
        },
        exitComparison: {
            customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            returnedAnalysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
            stages: {
                compareExitClick: 'Passed',
                comparisonViewAbsent: 'Passed',
                singleReportRouteIdentity: 'Passed',
                singleReportReady: 'Passed',
            },
        },
        featureStages: {
            customersNavigation: 'Passed',
            singleReportEntry: 'Passed',
            comparisonView: 'Passed',
            comparisonShareQr: 'Passed',
            comparisonShareEmail: 'Passed',
            comparisonReportPdf: 'Passed',
            exitComparison: 'Passed',
        },
        combinedPassed: false,
        failureFeature: null,
        failureStep: null,
        ...overrides,
    };
}

test('Part2 comparison combined pass requires all phase features and PDF content', () => {
    const evidence = syntheticComparisonEvidence();
    expect(derivePart2ComparisonCombinedPass(evidence)).toBe(true);
});

test('Part2 comparison failure propagates to tracker and TestMo cases', () => {
    const tracker = new SmokePart2RunTracker('cmp-fixture@example.com');
    tracker.logRunStarted();
    tracker.stepStarted('comparison report combined smoke');
    tracker.logRunFailed(new Error('comparison PDF validation failed'), 'https://fixture.test/compare');
    expect(tracker.outcomes.comparisonReport).toBe('failed');
    expect(tracker.outcomes.logout).toBe('not_reached');

    const report = buildPart2TestmoCoverageReport({
        featureOutcomes: { ...tracker.outcomes },
        failureReason: 'comparison PDF validation failed',
        comparisonReport: {
            featureStages: {
                customersNavigation: 'Passed',
                singleReportEntry: 'Passed',
                comparisonView: 'Passed',
                comparisonShareQr: 'Passed',
                comparisonShareEmail: 'Passed',
                comparisonReportPdf: 'Failed',
                exitComparison: 'Not reached',
            },
            combinedPassed: false,
            runOutputRoot: 'test-output/comparisonReport/fixture',
            reportPdf: null,
            exitComparison: null,
        },
    });
    const pdfCase = report.cases.find((c) => c.key === 'comparisonReportPdf');
    expect(pdfCase?.status).toBe('Failed');
    const exitCase = report.cases.find((c) => c.key === 'exitComparison');
    expect(exitCase?.status).toBe('Skipped');
});

test('integrated handoff: analysis passed gates comparison TestMo until comparison evidence exists', () => {
    const tracker = new SmokePart2RunTracker('handoff@example.com');
    tracker.logRunStarted();
    tracker.logAnalysisReportVerified({
        sourceCustomerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceAnalysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
        deletionMode: 'off',
        reportDeletionStage: 'Skipped',
        combinedPassed: true,
        runOutputRoot: 'test-output/analysisReportFull/fixture',
        featureStages: {
            login: 'Skipped',
            preflight: 'Passed',
            reportView: 'Passed',
            displaySettings: 'Passed',
            shareQr: 'Passed',
            shareEmail: 'Passed',
            reportPdf: 'Passed',
            reportHistory: 'Passed',
            reportDeletion: 'Skipped',
        },
    });
    const beforeComparison = buildPart2TestmoCoverageReport({
        featureOutcomes: { ...tracker.outcomes },
        analysisReport: {
            featureStages: {
                login: 'Skipped',
                preflight: 'Passed',
                reportView: 'Passed',
                displaySettings: 'Passed',
                shareQr: 'Passed',
                shareEmail: 'Passed',
                reportPdf: 'Passed',
                reportHistory: 'Passed',
                reportDeletion: 'Skipped',
            },
            deletionMode: 'off',
            combinedPassed: true,
            runOutputRoot: 'test-output/analysisReportFull/fixture',
            reportPdf: null,
            reportDeletion: null,
        },
    });
    expect(beforeComparison.cases.find((c) => c.key === 'comparisonReportView')?.status).toBe('Skipped');
});