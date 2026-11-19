import type { TestInfo } from '@playwright/test';
import type { AnalysisReportFullStageTracker } from './analysisReportFullStageTracker';
import type { AnalysisReportViewRunEvidence } from '../reportView/analysisReportViewReporting';
import type { AnalysisReportDisplayItemSettingsEvidence } from '../displaySettings/analysisReportDisplayItemSettingsFlow';
import type { AnalysisReportShareQrRunEvidence } from '../sharing/qrCode/analysisReportShareQrReporting';
import type { AnalysisReportShareEmailRunEvidence } from '../sharing/email/analysisReportShareEmailReporting';
import type { AnalysisReportPdfRunEvidence } from '../reportPDF/analysisReportPdfReporting';
import type { AnalysisReportHistoryRunEvidence } from '../reportHistory/analysisReportHistoryReporting';
import type { AnalysisReportDeletionRunEvidence } from '../reportDeletion/analysisReportDeletionReporting';

export type AnalysisReportFullHistoryOrderPinEvidence = {
    analysisId: string;
    listCreatedAtIso: string;
    firstPageSortType: string;
    selectionIndex: 0;
    rowCount: number;
};

export type AnalysisReportFullPreflightEvidence = {
    sourceCustomerId: string;
    sourceAnalysisId: string;
    listCreatedAtIso: string;
    explicitSourceAnalysisId: string | null;
    historyOrderPin: AnalysisReportFullHistoryOrderPinEvidence;
    deletionTargetAnalysisId: string | null;
    deletionTargetListCreatedAtIso: string | null;
    deletionPlanId: string | null;
    accountId: string | null;
    catalogComplete: boolean;
    rowCount: number | null;
    chronologyBasis: 'history-order-newest-first';
    historyOrderVerified: boolean;
};

export type AnalysisReportFullRunEvidence = {
    runId: string;
    runOutputRoot: string;
    browserProject: string;
    browserName: string;
    browserVersion: string;
    sourceCustomerId: string;
    sourceAnalysisId: string;
    deletionMode: string;
    featureStages: ReturnType<AnalysisReportFullStageTracker['toRecord']>;
    preflight: AnalysisReportFullPreflightEvidence | null;
    reportView: AnalysisReportViewRunEvidence | null;
    displaySettings: AnalysisReportDisplayItemSettingsEvidence | null;
    shareQr: AnalysisReportShareQrRunEvidence | null;
    shareEmail: AnalysisReportShareEmailRunEvidence | null;
    reportPdf: AnalysisReportPdfRunEvidence | null;
    reportHistory: AnalysisReportHistoryRunEvidence | null;
    reportDeletion: AnalysisReportDeletionRunEvidence | null;
    combinedPassed: boolean;
    failureFeature: string | null;
    failureStep: string | null;
    testmoNote: string;
};

export function analysisReportFullEvidenceBody(evidence: AnalysisReportFullRunEvidence): string {
    return JSON.stringify(evidence, null, 2);
}

export async function attachAnalysisReportFullEvidence(
    testInfo: TestInfo,
    evidence: AnalysisReportFullRunEvidence
): Promise<void> {
    await testInfo.attach('analysis-report-full-smoke.json', {
        body: analysisReportFullEvidenceBody(evidence),
        contentType: 'application/json',
    });
}

export function deriveCombinedPass(evidence: AnalysisReportFullRunEvidence): boolean {
    const core = [
        'login',
        'preflight',
        'reportView',
        'displaySettings',
        'shareQr',
        'shareEmail',
        'reportPdf',
        'reportHistory',
    ] as const;
    for (const feature of core) {
        if (evidence.featureStages[feature] !== 'Passed' && evidence.featureStages[feature] !== 'Skipped') {
            return false;
        }
    }
    if (evidence.deletionMode === 'off') {
        return evidence.featureStages.reportDeletion === 'Skipped';
    }
    if (evidence.featureStages.reportDeletion !== 'Passed') {
        return false;
    }
    if (evidence.deletionMode === 'delete-once') {
        return (
            evidence.reportDeletion?.actualDeletionReported === true &&
            evidence.reportDeletion?.deletionCoverage === 'ui-confirmation-and-customer-list-redirect'
        );
    }
    if (evidence.deletionMode === 'cancel') {
        return (
            evidence.featureStages.reportDeletion === 'Passed' &&
            evidence.reportDeletion?.deletionCoverage === 'ui-confirmation-and-customer-list-redirect'
        );
    }
    return false;
}
