import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';
import { fromRepo } from '../../../../../configs/playwright/paths';

function defaultRunId(testInfo: TestInfo): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stamp}-${testInfo.project.name}-${testInfo.testId.slice(0, 8)}`;
}

export type ComparisonReportShareEmailRunContext = {
    runId: string;
    runOutputRoot: string;
};

export function resolveComparisonReportShareEmailRunContext(
    testInfo: TestInfo
): ComparisonReportShareEmailRunContext {
    let runId = process.env.ANALYSIS_REPORT_COMPARISON_EMAIL_RUN_ID?.trim();
    if (!runId) {
        runId = defaultRunId(testInfo);
        process.env.ANALYSIS_REPORT_COMPARISON_EMAIL_RUN_ID = runId;
    }
    const runOutputRoot = fromRepo('test-output', 'comparisonReportEmail', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    return { runId, runOutputRoot };
}

export function resolveComparisonReportShareEmailSmokeOutputRoot(): {
    runId: string;
    runOutputRoot: string;
    junitPath: string;
} {
    const runId =
        process.env.ANALYSIS_REPORT_COMPARISON_EMAIL_RUN_ID?.trim() ||
        new Date().toISOString().replace(/[:.]/g, '-');
    if (!process.env.ANALYSIS_REPORT_COMPARISON_EMAIL_RUN_ID?.trim()) {
        process.env.ANALYSIS_REPORT_COMPARISON_EMAIL_RUN_ID = runId;
    }
    const runOutputRoot = fromRepo('test-output', 'comparisonReportEmail', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    const junitPath =
        process.env.ANALYSIS_REPORT_COMPARISON_EMAIL_JUNIT?.trim() ||
        path.join(runOutputRoot, 'results-comparisonReportEmail.xml');
    return { runId, runOutputRoot, junitPath };
}