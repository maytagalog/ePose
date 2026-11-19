import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
    ANALYSIS_REPORT_DELETION_LOCK_FILENAME,
    ANALYSIS_REPORT_DELETION_PLANS_FILENAME,
    type AnalysisReportDeletionPlan,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';
import {
    assertDeletionResumeDeleteOncePrechecks,
    DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID,
    DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
    DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionResumeDeleteOnce';
import { assertHistoryOrderResumeChronologyDeclared } from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanChronology';
import { runAnalysisReportDeletionStandalone } from '../../../../analysisReport/reportDeletion/analysisReportDeletionRunOrchestrator';
import { collectFixtureCustomerHistoryRows } from '../../../../analysisReport/reportDeletion/analysisReportDeletionHistoryCatalog.fixture';
import { ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID } from '../../../../analysisReport/reportDeletion/analysisReportDeletionFixtureContracts';
import {
    ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN,
    installAnalysisReportDeletionFixtureShell,
} from './analysisReportDeletionFixtureShell';

let stateDir = '';

function seedCancelVerifiedPlan(overrides?: Partial<AnalysisReportDeletionPlan>): void {
    const plan: AnalysisReportDeletionPlan = {
        planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
        createdAt: '2026-11-13T10:00:00.000Z',
        appOrigin: 'https://app-stg.epose.com',
        customerId: DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID,
        analysisId: DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID,
        measuredAtIso: '2025-11-19T08:00:00.000Z',
        measuredAtDisplay: '2025/11/19',
        listCreatedAtIso: '2025-11-19T08:00:00.000Z',
        accountId: 'fixture-account',
        deleteRequestId: DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID,
        rowCountAtSelection: 17,
        lifecycle: 'cancel_verified',
        cancelVerifiedAt: '2026-11-13T11:00:00.000Z',
        reservedAt: null,
        submittedAt: null,
        completedAt: null,
        lastError: null,
        chronologyBasis: 'history-order-newest-first',
        ...overrides,
    };
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify({ schemaVersion: 1, plans: { [DEFAULT_RESUME_DELETE_ONCE_PLAN_ID]: plan } }, null, 2),
        'utf8'
    );
}

test.beforeEach(() => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'deletion-resume-delete-once-'));
    process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
    delete process.env.ANALYSIS_REPORT_DELETION_CHRONOLOGY_BASIS;
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
    delete process.env.ANALYSIS_REPORT_DELETION_CHRONOLOGY_BASIS;
    if (stateDir) {
        rmSync(stateDir, { recursive: true, force: true });
    }
});

test('resume precheck accepts cancel_verified history-order plan', () => {
    seedCancelVerifiedPlan();
    expect(() =>
        assertDeletionResumeDeleteOncePrechecks({
            planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
            customerId: DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID,
            targetAnalysisId: DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID,
        })
    ).not.toThrow();
});

test('resume precheck rejects wrong analysis id', () => {
    seedCancelVerifiedPlan();
    expect(() =>
        assertDeletionResumeDeleteOncePrechecks({
            planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
            customerId: DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID,
            targetAnalysisId: '11111111-1111-4111-8111-111111111111',
        })
    ).toThrow(/no substitution/);
});

test('resume precheck requires history-order chronology declaration', () => {
    seedCancelVerifiedPlan({ chronologyBasis: null });
    expect(() =>
        assertHistoryOrderResumeChronologyDeclared({
            planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
            createdAt: '',
            appOrigin: '',
            customerId: DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID,
            analysisId: DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID,
            measuredAtIso: '',
            measuredAtDisplay: '',
            listCreatedAtIso: '',
            accountId: '',
            deleteRequestId: '',
            rowCountAtSelection: 0,
            lifecycle: 'cancel_verified',
            cancelVerifiedAt: null,
            reservedAt: null,
            submittedAt: null,
            completedAt: null,
            lastError: null,
        })
    ).toThrow(/history-order-newest-first/);
});

test('resume delete-once orchestration records guard install evidence', async ({ page, browser }, testInfo) => {
    test.setTimeout(120000);
    const origin = ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN;
    const customerId = ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID;
    await installAnalysisReportDeletionFixtureShell(page);
    await page.goto(`${origin}/customers/${customerId}/posture-analysis-report`);
    const pin = (await collectFixtureCustomerHistoryRows(page, customerId))[0]!;
    seedCancelVerifiedPlan({
        appOrigin: origin,
        customerId,
        analysisId: pin.analysisId,
        deleteRequestId: pin.analysisId,
        listCreatedAtIso: pin.chronologyIso,
        measuredAtIso: pin.chronologyIso,
        measuredAtDisplay: pin.chronologyIso.slice(0, 10),
        accountId: ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
        chronologyBasis: 'history-order-newest-first',
    });
    process.env.ANALYSIS_REPORT_DELETION_CHRONOLOGY_BASIS = 'history-order-newest-first';
    assertDeletionResumeDeleteOncePrechecks({
        planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
        customerId,
        targetAnalysisId: pin.analysisId,
    });

    const { evidence, primaryError } = await runAnalysisReportDeletionStandalone({
        page,
        browser,
        testInfo,
        appOrigin: origin,
        startOnCustomerHistory: true,
        config: {
            mode: 'delete-once',
            customerId,
            planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
            appOrigin: origin,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });

    expect(primaryError).toBeNull();
    expect(evidence.deleteRequestGuardInstall?.outcome).toBe('installed');
    expect(evidence.deleteRequestGuardInstall?.routePattern).toBe('**/*delete_report*');
    expect(evidence.stages.deletionSubmission).toBe('Passed');
    expect(evidence.stages.deleteConfirmationDialog).toBe('Passed');
});

test('resume precheck rejects active submission lock', () => {
    seedCancelVerifiedPlan();
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_LOCK_FILENAME),
        JSON.stringify({ planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID, pid: 12345, at: new Date().toISOString() }),
        'utf8'
    );
    expect(() =>
        assertDeletionResumeDeleteOncePrechecks({
            planId: DEFAULT_RESUME_DELETE_ONCE_PLAN_ID,
            customerId: DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID,
            targetAnalysisId: DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID,
        })
    ).toThrow(/submission lock still present/);
});
