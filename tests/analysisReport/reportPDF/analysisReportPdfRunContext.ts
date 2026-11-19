import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';

function defaultRunId(testInfo: TestInfo): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stamp}-${testInfo.project.name}-${testInfo.testId.slice(0, 8)}`;
}

export type AnalysisReportPdfRunContext = {
    runId: string;
    runOutputRoot: string;
    artifactDir: string;
};

export function resolveAnalysisReportPdfRunContext(testInfo: TestInfo): AnalysisReportPdfRunContext {
    const runId = process.env.ANALYSIS_REPORT_PDF_RUN_ID?.trim() || defaultRunId(testInfo);
    const runOutputRoot = path.join('test-output', 'analysisReportPDF', runId);
    const artifactDir = path.join(runOutputRoot, 'artifacts');
    mkdirSync(artifactDir, { recursive: true });
    return { runId, runOutputRoot, artifactDir };
}

export function resolveSmokeRunOutputRoot(): { runId: string; runOutputRoot: string; junitPath: string } {
    const runId =
        process.env.ANALYSIS_REPORT_PDF_RUN_ID?.trim() ||
        new Date().toISOString().replace(/[:.]/g, '-');
    const runOutputRoot = path.join('test-output', 'analysisReportPDF', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    const junitPath =
        process.env.ANALYSIS_REPORT_PDF_JUNIT?.trim() ||
        path.join(runOutputRoot, 'results-analysisReportPDF.xml');
    return { runId, runOutputRoot, junitPath };
}
