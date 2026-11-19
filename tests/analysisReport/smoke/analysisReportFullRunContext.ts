import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';

function defaultRunId(testInfo: TestInfo): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stamp}-${testInfo.project.name}-${testInfo.testId.slice(0, 8)}`;
}

export type AnalysisReportFullRunContext = {
    runId: string;
    runOutputRoot: string;
};

export function resolveAnalysisReportFullRunContext(testInfo: TestInfo): AnalysisReportFullRunContext {
    const runId = process.env.ANALYSIS_REPORT_FULL_RUN_ID?.trim() || defaultRunId(testInfo);
    if (!process.env.ANALYSIS_REPORT_FULL_RUN_ID?.trim()) {
        process.env.ANALYSIS_REPORT_FULL_RUN_ID = runId;
    }
    const runOutputRoot = path.join('test-output', 'analysisReportFull', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    return { runId, runOutputRoot };
}

export function resolveAnalysisReportFullSmokeOutputRoot(): {
    runId: string;
    runOutputRoot: string;
    junitPath: string;
} {
    const runId =
        process.env.ANALYSIS_REPORT_FULL_RUN_ID?.trim() ||
        new Date().toISOString().replace(/[:.]/g, '-');
    if (!process.env.ANALYSIS_REPORT_FULL_RUN_ID?.trim()) {
        process.env.ANALYSIS_REPORT_FULL_RUN_ID = runId;
    }
    const runOutputRoot = path.join('test-output', 'analysisReportFull', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    const junitPath =
        process.env.ANALYSIS_REPORT_FULL_JUNIT?.trim() ||
        path.join(runOutputRoot, 'results-analysisReportFull.xml');
    return { runId, runOutputRoot, junitPath };
}
