import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';

function defaultRunId(testInfo: TestInfo): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stamp}-${testInfo.project.name}-${testInfo.testId.slice(0, 8)}`;
}

export type AnalysisReportDeletionRunContext = {
    runId: string;
    runOutputRoot: string;
};

export function resolveAnalysisReportDeletionRunContext(testInfo: TestInfo): AnalysisReportDeletionRunContext {
    const runId = process.env.ANALYSIS_REPORT_DELETION_RUN_ID?.trim() || defaultRunId(testInfo);
    const runOutputRoot = path.join('test-output', 'analysisReportDeletion', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    return { runId, runOutputRoot };
}

export function resolveDeletionSmokeRunOutputRoot(): {
    runId: string;
    runOutputRoot: string;
    junitPath: string;
} {
    const runId =
        process.env.ANALYSIS_REPORT_DELETION_RUN_ID?.trim() ||
        new Date().toISOString().replace(/[:.]/g, '-');
    if (!process.env.ANALYSIS_REPORT_DELETION_RUN_ID?.trim()) {
        process.env.ANALYSIS_REPORT_DELETION_RUN_ID = runId;
    }
    const runOutputRoot = path.join('test-output', 'analysisReportDeletion', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    const junitPath =
        process.env.ANALYSIS_REPORT_DELETION_JUNIT?.trim() ||
        path.join(runOutputRoot, 'results-analysisReportDeletion.xml');
    return { runId, runOutputRoot, junitPath };
}
