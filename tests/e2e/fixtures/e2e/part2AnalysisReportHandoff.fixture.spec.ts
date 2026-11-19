import { test, expect } from '@playwright/test';
import {
    applyPart2AnalysisReportHandoffEnv,
    resolvePart2AnalysisReportSmokeConfig,
    restorePart2AnalysisReportHandoffEnv,
    snapshotPart2AnalysisReportHandoffEnv,
} from '../../shared/part2AnalysisReportHandoff';
import { STG_APP_ORIGIN } from '../../../login/existingUserLoginFlow';

const DYNAMIC_CUSTOMER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('handoff env applies dynamic customer and clears pinned analysis id', () => {
    const snap = snapshotPart2AnalysisReportHandoffEnv();
    try {
        applyPart2AnalysisReportHandoffEnv({
            customerId: DYNAMIC_CUSTOMER,
            customerName: 'Fixture Customer',
            customerFurigana: 'フィクスチャー',
        });
        expect(process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID).toBe(DYNAMIC_CUSTOMER);
        expect(process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST).toBe('1');
        expect(process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID).toBeUndefined();
        expect(process.env.ANALYSIS_REPORT_DELETION_PLAN_ID).toBeUndefined();
        const config = resolvePart2AnalysisReportSmokeConfig(STG_APP_ORIGIN);
        expect(config.source.customerId).toBe(DYNAMIC_CUSTOMER);
        expect(config.deletionMode).toBe('off');
        expect(config.deletionPlanId).toBeNull();
        expect(config.embeddedDeletionPlan).toBe(false);
    } finally {
        restorePart2AnalysisReportHandoffEnv(snap);
    }
    expect(process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST).toBe(snap.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST);
});

test('deletion-once requires explicit mode env', () => {
    const snap = snapshotPart2AnalysisReportHandoffEnv();
    const priorMode = process.env.ANALYSIS_REPORT_DELETION_MODE;
    try {
        applyPart2AnalysisReportHandoffEnv({
            customerId: DYNAMIC_CUSTOMER,
            customerName: null,
            customerFurigana: null,
        });
        expect(resolvePart2AnalysisReportSmokeConfig(STG_APP_ORIGIN).deletionMode).toBe('off');
        process.env.ANALYSIS_REPORT_DELETION_MODE = 'delete-once';
        process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID = DYNAMIC_CUSTOMER;
        const enabled = resolvePart2AnalysisReportSmokeConfig(STG_APP_ORIGIN);
        expect(enabled.deletionMode).toBe('delete-once');
        expect(enabled.embeddedDeletionPlan).toBe(true);
    } finally {
        if (priorMode === undefined) {
            delete process.env.ANALYSIS_REPORT_DELETION_MODE;
        } else {
            process.env.ANALYSIS_REPORT_DELETION_MODE = priorMode;
        }
        delete process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID;
        restorePart2AnalysisReportHandoffEnv(snap);
    }
});
