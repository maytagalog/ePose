import type { TestInfo } from '@playwright/test';
import type { AnalysisReportHistorySourceIdentity } from './analysisReportHistorySourceIdentity';
import type {
    AnalysisReportHistorySetupStage,
    AnalysisReportHistoryStage,
    StageOutcome,
} from './analysisReportHistoryStageTracker';

export type AnalysisReportHistoryRunEvidence = {
    runId: string;
    runOutputRoot: string;
    browserProject: string;
    browserName: string;
    browserVersion: string | null;
    customerId: string;
    analysisId: string;
    sourceIdentity: AnalysisReportHistorySourceIdentity | null;
    stages: Record<AnalysisReportHistoryStage, StageOutcome>;
    setup: Record<AnalysisReportHistorySetupStage, StageOutcome>;
    failureStep: string | null;
};

export function analysisReportHistoryEvidenceBody(evidence: AnalysisReportHistoryRunEvidence): string {
    return JSON.stringify(
        {
            ...evidence,
            testMoMappingNote:
                'JUnit exposes one testcase (analysisReportHistoryStandalone). Nested Playwright steps and this JSON attachment retain stage outcomes; map stages to TestMo manually when submitting.',
        },
        null,
        2
    );
}

export async function attachAnalysisReportHistoryEvidence(
    testInfo: TestInfo,
    evidence: AnalysisReportHistoryRunEvidence
): Promise<void> {
    try {
        await testInfo.attach('analysis-report-history-evidence', {
            body: analysisReportHistoryEvidenceBody(evidence),
            contentType: 'application/json',
        });
    } catch (error) {
        console.warn('Failed to attach analysis-report-history-evidence:', error);
    }
}
