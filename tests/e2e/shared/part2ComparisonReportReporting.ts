import type { TestInfo } from '@playwright/test';
import type { ComparisonReportViewStage } from '../../analysisReport/comparisonReportView/comparisonReportViewStageTracker';
import type { ComparisonReportPdfRunEvidence } from '../../analysisReport/comparisonReportView/reportPDF/comparisonReportPdfReporting';
import type { ComparisonReportShareEmailFlowEvidencePartial } from '../../analysisReport/comparisonReportView/sharing/email/comparisonReportShareEmailReporting';
import type { ComparisonReportShareQrFlowEvidencePartial } from '../../analysisReport/comparisonReportView/sharing/qrCode/comparisonReportShareQrReporting';
import type { ComparisonReportViewExitResult } from '../../analysisReport/comparisonReportView/comparisonReportViewExitFlow';
import type { StageOutcome } from '../../analysisReport/comparisonReportView/comparisonReportViewExitStageTracker';
import {
    buildPart2ComparisonReportVerifiedPayload,
    logPart2SmokeEvent,
    type Part2ComparisonReportVerifiedInput,
} from './smokePart2Reporting';

export type Part2ComparisonReportFeature =
    | 'customersNavigation'
    | 'singleReportEntry'
    | 'comparisonView'
    | 'comparisonShareQr'
    | 'comparisonShareEmail'
    | 'comparisonReportPdf'
    | 'exitComparison';

const PHASE_FEATURES: Part2ComparisonReportFeature[] = [
    'customersNavigation',
    'singleReportEntry',
    'comparisonView',
    'comparisonShareQr',
    'comparisonShareEmail',
    'comparisonReportPdf',
    'exitComparison',
];

export class Part2ComparisonReportStageTracker {
    private readonly outcomes = new Map<Part2ComparisonReportFeature, StageOutcome>();

    constructor() {
        for (const feature of PHASE_FEATURES) {
            this.outcomes.set(feature, 'Not reached');
        }
    }

    enter(feature: Part2ComparisonReportFeature): void {
        if (this.outcomes.get(feature) === 'Not reached') {
            this.outcomes.set(feature, 'Entered');
        }
    }

    pass(feature: Part2ComparisonReportFeature): void {
        this.outcomes.set(feature, 'Passed');
    }

    fail(feature: Part2ComparisonReportFeature): void {
        this.outcomes.set(feature, 'Failed');
    }

    outcome(feature: Part2ComparisonReportFeature): StageOutcome {
        return this.outcomes.get(feature) ?? 'Not reached';
    }

    toRecord(): Record<Part2ComparisonReportFeature, StageOutcome> {
        const record = {} as Record<Part2ComparisonReportFeature, StageOutcome>;
        for (const feature of PHASE_FEATURES) {
            record[feature] = this.outcomes.get(feature) ?? 'Not reached';
        }
        return record;
    }
}

export type Part2ComparisonReportRunEvidence = {
    runId: string;
    runOutputRoot: string;
    browserProject: string;
    browserName: string;
    browserVersion: string;
    customerId: string;
    customerDisplayNameHint: string | null;
    sourceSingleReportAnalysisId: string | null;
    selectedComparisonAnalysisId: string | null;
    comparisonPairLeftId: string | null;
    comparisonPairRightId: string | null;
    returnedSingleReportAnalysisId: string | null;
    comparisonViewStages: Record<ComparisonReportViewStage, StageOutcome>;
    shareQr: (ComparisonReportShareQrFlowEvidencePartial & {
        shareQrStages: Record<string, StageOutcome>;
    }) | null;
    shareEmail: (ComparisonReportShareEmailFlowEvidencePartial & {
        shareEmailStages: Record<string, StageOutcome>;
    }) | null;
    reportPdf: ComparisonReportPdfRunEvidence | null;
    exitComparison: ComparisonReportViewExitResult | null;
    featureStages: Record<Part2ComparisonReportFeature, StageOutcome>;
    combinedPassed: boolean;
    failureFeature: string | null;
    failureStep: string | null;
};

export function derivePart2ComparisonCombinedPass(evidence: Part2ComparisonReportRunEvidence): boolean {
    for (const feature of PHASE_FEATURES) {
        if (evidence.featureStages[feature] !== 'Passed') {
            return false;
        }
    }
    return (
        evidence.reportPdf?.pdfValidation?.contentVerificationPassed === true &&
        evidence.exitComparison?.returnedAnalysisId != null
    );
}

export function part2ComparisonReportEvidenceBody(evidence: Part2ComparisonReportRunEvidence): string {
    return JSON.stringify(evidence, null, 2);
}

export async function attachPart2ComparisonReportEvidence(
    testInfo: TestInfo,
    evidence: Part2ComparisonReportRunEvidence
): Promise<void> {
    await testInfo.attach('part2-comparison-report-run.json', {
        body: part2ComparisonReportEvidenceBody(evidence),
        contentType: 'application/json',
    });
}

export function logPart2ComparisonReportVerified(
    accountEmail: string,
    result: Part2ComparisonReportVerifiedInput
): void {
    logPart2SmokeEvent(
        'PART2_COMPARISON_REPORT_VERIFIED',
        buildPart2ComparisonReportVerifiedPayload(accountEmail, result)
    );
}