import { test, expect } from '@playwright/test';
import {
    ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID,
    rejectDestructiveRepeatRun,
    resolveAnalysisReportFullSmokeConfig,
} from '../../../../analysisReport/smoke/analysisReportFullSmokeConfig';
import { assertDeletionPlanNotLegacyReconciled } from '../../../../analysisReport/smoke/analysisReportFullDeletionGuards';
import { deriveCombinedPass, type AnalysisReportFullRunEvidence } from '../../../../analysisReport/smoke/analysisReportFullReporting';
import { defaultLegacyFinalizePlanId } from '../../../../analysisReport/smoke/analysisReportLegacyPlanFinalizeRun';
import { AnalysisReportFullStageTracker, deletionMustRemainNotReached } from '../../../../analysisReport/smoke/analysisReportFullStageTracker';
import { assertPlanAllowsDeleteOnce, loadDeletionPlan, updateDeletionPlan } from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ANALYSIS_REPORT_DELETION_PLANS_FILENAME } from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';

let stateDir = '';

test.beforeEach(() => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'analysis-report-full-smoke-'));
    process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
    process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    process.env.ANALYSIS_REPORT_DELETION_MODE = 'off';
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
    delete process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID;
    delete process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID;
    delete process.env.ANALYSIS_REPORT_VIEW_TIE_BREAK_ANALYSIS_ID;
    delete process.env.ANALYSIS_REPORT_DELETION_MODE;
    delete process.env.ANALYSIS_REPORT_DELETION_PLAN_ID;
    delete process.env.PLAYWRIGHT_REPEAT_EACH;
    if (stateDir) {
        rmSync(stateDir, { recursive: true, force: true });
    }
});

test('reject repeatEach>1 destructive config', () => {
    process.env.PLAYWRIGHT_REPEAT_EACH = '2';
    expect(() => rejectDestructiveRepeatRun()).toThrow(/repeatEach/);
});

test('legacy reconciled plan cannot be submitted', () => {
    const planId = '11111111-1111-4111-8111-111111111111';
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify(
            {
                schemaVersion: 1,
                plans: {
                    [planId]: {
                        planId,
                        lifecycle: 'reconciled_absent',
                        analysisId: '22222222-2222-4222-8222-222222222222',
                        customerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                    },
                },
            },
            null,
            2
        ),
        'utf8'
    );
    expect(() => assertPlanAllowsDeleteOnce(loadDeletionPlan(planId))).toThrow(/non-submittable/);
    expect(() => assertDeletionPlanNotLegacyReconciled(ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID)).toThrow(
        /legacy reconciled/
    );
});

test('api success with verification failure does not count as combined pass', () => {
    const evidence = {
        deletionMode: 'delete-once',
        featureStages: {
            login: 'Passed',
            preflight: 'Passed',
            reportView: 'Passed',
            displaySettings: 'Passed',
            shareQr: 'Passed',
            shareEmail: 'Passed',
            reportPdf: 'Passed',
            reportHistory: 'Passed',
            reportDeletion: 'Passed',
        },
        reportDeletion: {
            actualDeletionReported: false,
            stages: { apiResult: 'Passed', freshHistoryAbsenceVerification: 'Failed' },
        },
    } as unknown as AnalysisReportFullRunEvidence;
    expect(deriveCombinedPass(evidence)).toBe(false);
});

test('earlier failure keeps deletion Not reached', () => {
    const tracker = new AnalysisReportFullStageTracker();
    tracker.pass('login');
    tracker.pass('preflight');
    tracker.fail('reportView');
    expect(deletionMustRemainNotReached(tracker)).toBe(true);
    expect(tracker.outcome('reportDeletion')).toBe('Not reached');
});

test('preflight failure leaves downstream features Not reached', () => {
    const tracker = new AnalysisReportFullStageTracker();
    tracker.pass('login');
    tracker.fail('preflight');
    const blocked = [
        'reportView',
        'displaySettings',
        'shareQr',
        'shareEmail',
        'reportPdf',
        'reportHistory',
        'reportDeletion',
    ] as const;
    for (const feature of blocked) {
        expect(tracker.outcome(feature)).toBe('Not reached');
    }
});

test('displaySettings failure leaves later combined features Not reached', () => {
    const tracker = new AnalysisReportFullStageTracker();
    tracker.pass('login');
    tracker.pass('preflight');
    tracker.pass('reportView');
    tracker.enter('displaySettings');
    tracker.fail('displaySettings');
    tracker.markOpenFailed();
    expect(tracker.outcome('displaySettings')).toBe('Failed');
    for (const feature of ['shareQr', 'shareEmail', 'reportPdf', 'reportHistory', 'reportDeletion'] as const) {
        expect(tracker.outcome(feature)).toBe('Not reached');
    }
});

test('embedded delete-once allows omitting external plan id', () => {
    process.env.ANALYSIS_REPORT_DELETION_MODE = 'delete-once';
    const config = resolveAnalysisReportFullSmokeConfig('https://app-stg.epose.com');
    expect(config.deletionPlanId).toBeNull();
    expect(config.embeddedDeletionPlan).toBe(true);
});

test('external delete-once rejects blocking lifecycles', () => {
    const planId = '55555555-5555-4555-8555-555555555555';
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify(
            {
                schemaVersion: 1,
                plans: {
                    [planId]: {
                        planId,
                        lifecycle: 'submitted',
                        analysisId: '66666666-6666-4666-8666-666666666666',
                        customerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                        createdAt: new Date().toISOString(),
                        appOrigin: 'https://app-stg.epose.com',
                        measuredAtIso: '2024-01-01T00:00:00.000Z',
                        measuredAtDisplay: 'x',
                        listCreatedAtIso: '2024-01-01T00:00:00.000Z',
                        accountId: 'acct',
                        deleteRequestId: '66666666-6666-4666-8666-666666666666',
                        rowCountAtSelection: 1,
                        cancelVerifiedAt: new Date().toISOString(),
                        reservedAt: null,
                        submittedAt: new Date().toISOString(),
                        completedAt: null,
                        lastError: null,
                    },
                },
            },
            null,
            2
        ),
        'utf8'
    );
    process.env.ANALYSIS_REPORT_DELETION_MODE = 'delete-once';
    process.env.ANALYSIS_REPORT_DELETION_PLAN_ID = planId;
    expect(() => resolveAnalysisReportFullSmokeConfig('https://app-stg.epose.com')).toThrow(/lifecycle/);
});

test('cancel mode requires embedded plan without external plan id', () => {
    process.env.ANALYSIS_REPORT_DELETION_MODE = 'cancel';
    const config = resolveAnalysisReportFullSmokeConfig('https://app-stg.epose.com');
    expect(config.embeddedDeletionPlan).toBe(true);
    expect(config.deletionPlanId).toBeNull();
    process.env.ANALYSIS_REPORT_DELETION_PLAN_ID = '77777777-7777-4777-8777-777777777777';
    expect(() => resolveAnalysisReportFullSmokeConfig('https://app-stg.epose.com')).toThrow(
        /do not set ANALYSIS_REPORT_DELETION_PLAN_ID/
    );
});

test('defaultLegacyFinalizePlanId resolves pinned legacy plan', () => {
    expect(defaultLegacyFinalizePlanId()).toBe(ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID);
});

test('embedded delete-once combined pass requires simplified deletion coverage', () => {
    const evidence = {
        deletionMode: 'delete-once',
        featureStages: {
            login: 'Passed',
            preflight: 'Passed',
            reportView: 'Passed',
            displaySettings: 'Passed',
            shareQr: 'Passed',
            shareEmail: 'Passed',
            reportPdf: 'Passed',
            reportHistory: 'Passed',
            reportDeletion: 'Passed',
        },
        reportDeletion: {
            actualDeletionReported: true,
            deletionCoverage: 'ui-confirmation-and-customer-list-redirect',
            stages: {
                cancellationVerification: 'Passed',
                deletionSubmission: 'Passed',
                successUiNavigation: 'Passed',
                apiResult: 'Skipped',
                freshHistoryAbsenceVerification: 'Skipped',
            },
            plan: { lifecycle: 'completed' },
        },
    } as unknown as AnalysisReportFullRunEvidence;
    expect(deriveCombinedPass(evidence)).toBe(true);
});

test('off mode config resolves without deletion plan', () => {
    const config = resolveAnalysisReportFullSmokeConfig('https://app-stg.epose.com');
    expect(config.deletionMode).toBe('off');
    expect(config.deletionPlanId).toBeNull();
    expect(config.source.analysisId).toBe('');
    expect(config.explicitSourceAnalysisId).toBeNull();
});

test('combined config requires customer id only', () => {
    delete process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID;
    expect(() => resolveAnalysisReportFullSmokeConfig('https://app-stg.epose.com')).toThrow(/ANALYSIS_REPORT_VIEW_CUSTOMER_ID/);
});

test('reconciled_absent lifecycle blocks delete-once eligibility', () => {
    const planId = '33333333-3333-4333-8333-333333333333';
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify(
            {
                schemaVersion: 1,
                plans: {
                    [planId]: {
                        planId,
                        lifecycle: 'cancel_verified',
                        analysisId: '44444444-4444-4444-8444-444444444444',
                        customerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                        createdAt: new Date().toISOString(),
                        appOrigin: 'https://app-stg.epose.com',
                        measuredAtIso: '2024-01-01T00:00:00.000Z',
                        measuredAtDisplay: 'x',
                        listCreatedAtIso: '2024-01-01T00:00:00.000Z',
                        accountId: 'acct',
                        deleteRequestId: '44444444-4444-4444-8444-444444444444',
                        rowCountAtSelection: 1,
                        cancelVerifiedAt: null,
                        reservedAt: null,
                        submittedAt: null,
                        completedAt: null,
                        lastError: null,
                    },
                },
            },
            null,
            2
        ),
        'utf8'
    );
    updateDeletionPlan(planId, { lifecycle: 'reconciled_absent', reconciledAbsentAt: new Date().toISOString() });
    expect(() => assertPlanAllowsDeleteOnce(loadDeletionPlan(planId))).toThrow(/non-submittable/);
});
