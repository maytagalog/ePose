import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';
import { fromRepo } from '../../../../../configs/playwright/paths';

function defaultRunId(testInfo: TestInfo): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${stamp}-${testInfo.project.name}-${testInfo.testId.slice(0, 8)}`;
}

export type ComparisonReportShareQrRunContext = {
    runId: string;
    runOutputRoot: string;
};

export function resolveComparisonReportShareQrRunContext(testInfo: TestInfo): ComparisonReportShareQrRunContext {
    let runId = process.env.ANALYSIS_REPORT_COMPARISON_QR_RUN_ID?.trim();
    if (!runId) {
        runId = defaultRunId(testInfo);
        process.env.ANALYSIS_REPORT_COMPARISON_QR_RUN_ID = runId;
    }
    const runOutputRoot = fromRepo('test-output', 'comparisonReportQR', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    return { runId, runOutputRoot };
}

export function resolveComparisonReportShareQrSmokeOutputRoot(): {
    runId: string;
    runOutputRoot: string;
    junitPath: string;
} {
    const runId =
        process.env.ANALYSIS_REPORT_COMPARISON_QR_RUN_ID?.trim() ||
        new Date().toISOString().replace(/[:.]/g, '-');
    if (!process.env.ANALYSIS_REPORT_COMPARISON_QR_RUN_ID?.trim()) {
        process.env.ANALYSIS_REPORT_COMPARISON_QR_RUN_ID = runId;
    }
    const runOutputRoot = fromRepo('test-output', 'comparisonReportQR', runId);
    mkdirSync(runOutputRoot, { recursive: true });
    const junitPath =
        process.env.ANALYSIS_REPORT_COMPARISON_QR_JUNIT?.trim() ||
        path.join(runOutputRoot, 'results-comparisonReportQR.xml');
    return { runId, runOutputRoot, junitPath };
}