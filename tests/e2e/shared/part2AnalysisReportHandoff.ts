import type { Browser, Page, TestInfo } from '@playwright/test';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    finalizeAnalysisReportFullRun,
    runAnalysisReportFullStandalone,
} from '../../analysisReport/smoke/analysisReportFullRunOrchestrator';
import {
    resolveAnalysisReportFullSmokeConfig,
    type AnalysisReportFullSmokeConfig,
} from '../../analysisReport/smoke/analysisReportFullSmokeConfig';
import type { AnalysisReportFullRunEvidence } from '../../analysisReport/smoke/analysisReportFullReporting';
import type { CustomerHistoryCatalogLoadResult } from '../../analysisReport/reportDeletion/analysisReportCustomerHistoryApiCatalog';

export type Part2CirsCustomerIdentity = {
    customerId: string;
    customerName: string | null;
    customerFurigana: string | null;
};

const HANDOFF_ENV_KEYS = [
    'ANALYSIS_REPORT_VIEW_CUSTOMER_ID',
    'ANALYSIS_REPORT_VIEW_CUSTOMER_NAME',
    'ANALYSIS_REPORT_VIEW_CUSTOMER_FURIGANA',
    'ANALYSIS_REPORT_VIEW_ANALYSIS_ID',
    'ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST',
    'ANALYSIS_REPORT_DELETION_PLAN_ID',
] as const;

export type Part2AnalysisReportHandoffEnvSnapshot = Record<(typeof HANDOFF_ENV_KEYS)[number], string | undefined>;

export function snapshotPart2AnalysisReportHandoffEnv(): Part2AnalysisReportHandoffEnvSnapshot {
    const snap = {} as Part2AnalysisReportHandoffEnvSnapshot;
    for (const key of HANDOFF_ENV_KEYS) {
        snap[key] = process.env[key];
    }
    return snap;
}

export function applyPart2AnalysisReportHandoffEnv(identity: Part2CirsCustomerIdentity): void {
    process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID = identity.customerId;
    if (identity.customerName?.trim()) {
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_NAME = identity.customerName.trim();
    } else {
        delete process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_NAME;
    }
    if (identity.customerFurigana?.trim()) {
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_FURIGANA = identity.customerFurigana.trim();
    } else {
        delete process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_FURIGANA;
    }
    delete process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID;
    process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST = '1';
    delete process.env.ANALYSIS_REPORT_DELETION_PLAN_ID;
}

export function restorePart2AnalysisReportHandoffEnv(snapshot: Part2AnalysisReportHandoffEnvSnapshot): void {
    for (const key of HANDOFF_ENV_KEYS) {
        const value = snapshot[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

export function resolvePart2AnalysisReportSmokeConfig(appOrigin: string = STG_APP_ORIGIN): AnalysisReportFullSmokeConfig {
    return {
        ...resolveAnalysisReportFullSmokeConfig(appOrigin),
        shareEmailValidationMode: 'ui-send-confirmation',
    };
}

export type Part2AnalysisReportPhaseResult = {
    evidence: AnalysisReportFullRunEvidence;
    primaryError: unknown;
};

export async function runPart2AnalysisReportPhase(options: {
    page: Page;
    browser: Browser;
    testInfo: TestInfo;
    account: { email: string; password: string };
    identity: Part2CirsCustomerIdentity;
    appOrigin?: string;
    cirsHandoffCatalog?: CustomerHistoryCatalogLoadResult | null;
}): Promise<Part2AnalysisReportPhaseResult> {
    const appOrigin = options.appOrigin ?? STG_APP_ORIGIN;
    const envSnapshot = snapshotPart2AnalysisReportHandoffEnv();
    applyPart2AnalysisReportHandoffEnv(options.identity);
    try {
        if (!options.cirsHandoffCatalog?.catalogComplete || !options.cirsHandoffCatalog.accountId) {
            throw new Error(
                'Part 2 Analysis Report requires a complete customer history catalog from the CIRS list handoff.'
            );
        }
        const config = resolvePart2AnalysisReportSmokeConfig(appOrigin);
        const result = await runAnalysisReportFullStandalone({
            page: options.page,
            browser: options.browser,
            testInfo: options.testInfo,
            account: options.account,
            appOrigin,
            config,
            part2HandoffCatalog: options.cirsHandoffCatalog ?? null,
        });
        await finalizeAnalysisReportFullRun(options.testInfo, result.evidence, result.primaryError);
        return result;
    } finally {
        restorePart2AnalysisReportHandoffEnv(envSnapshot);
    }
}
