import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
    ANALYSIS_REPORT_DELETION_LOCK_FILENAME,
    ANALYSIS_REPORT_DELETION_PLANS_FILENAME,
    assertPlanAllowsDeleteOnce,
    loadDeletionPlan,
    readDeletionSubmissionLockRecord,
    updateDeletionPlan,
    type AnalysisReportDeletionPlan,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';
import {
    assertReservedRecoveryPrechecks,
    evaluatePresentTargetReconciliation,
    PRESERVED_CANCEL_VERIFIED_PLAN_ID,
    DEFAULT_RESERVED_RECOVERY_PLAN_ID,
    DEFAULT_RESERVED_RECOVERY_CUSTOMER_ID,
    DEFAULT_RESERVED_RECOVERY_TARGET_ANALYSIS_ID,
} from '../../../../analysisReport/smoke/analysisReportReservedPlanRecovery';
import { assertCombinedSmokeNotBlockedByDeletionSubmissionLock } from '../../../../analysisReport/smoke/analysisReportCombinedDeletionSubmissionLockGuard';
import { AnalysisReportFullSmokeConfigError } from '../../../../analysisReport/smoke/analysisReportFullSmokeConfig';
import type { DeletionPlanReconcileResult } from '../../../../analysisReport/reportDeletion/analysisReportDeletionReconciliation';

const RESERVED_PLAN_ID = DEFAULT_RESERVED_RECOVERY_PLAN_ID;
const CUSTOMER_ID = DEFAULT_RESERVED_RECOVERY_CUSTOMER_ID;
const TARGET_ID = DEFAULT_RESERVED_RECOVERY_TARGET_ANALYSIS_ID;

let stateDir = '';

function seedReservedPlan(): void {
    const plan: AnalysisReportDeletionPlan = {
        planId: RESERVED_PLAN_ID,
        createdAt: '2026-11-13T12:00:00.000Z',
        appOrigin: 'https://app-stg.epose.com',
        customerId: CUSTOMER_ID,
        analysisId: TARGET_ID,
        measuredAtIso: '2025-11-19T08:00:00.000Z',
        measuredAtDisplay: '2025/11/19',
        listCreatedAtIso: '2025-11-19T08:00:00.000Z',
        accountId: 'fixture-account',
        deleteRequestId: TARGET_ID,
        rowCountAtSelection: 17,
        lifecycle: 'reserved',
        cancelVerifiedAt: '2026-11-13T11:00:00.000Z',
        reservedAt: '2026-11-13T12:50:00.000Z',
        submittedAt: null,
        completedAt: null,
        lastError: null,
    };
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify({ schemaVersion: 1, plans: { [RESERVED_PLAN_ID]: plan } }, null, 2),
        'utf8'
    );
}

function writeLock(planId: string, pid: number): void {
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_LOCK_FILENAME),
        JSON.stringify({ planId, pid, at: new Date().toISOString() }),
        'utf8'
    );
}

test.beforeEach(() => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'reserved-plan-recovery-'));
    process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
    if (stateDir) {
        rmSync(stateDir, { recursive: true, force: true });
    }
});

test('precheck passes when lock holder pid is not running', () => {
    seedReservedPlan();
    writeLock(RESERVED_PLAN_ID, 999_999);
    const { plan } = assertReservedRecoveryPrechecks({
        planId: RESERVED_PLAN_ID,
        expectedCustomerId: CUSTOMER_ID,
        expectedTargetAnalysisId: TARGET_ID,
    });
    expect(plan.lifecycle).toBe('reserved');
    expect(plan.submittedAt).toBeNull();
});

test('precheck refuses preserved cancel_verified plan id', () => {
    seedReservedPlan();
    expect(() =>
        assertReservedRecoveryPrechecks({
            planId: PRESERVED_CANCEL_VERIFIED_PLAN_ID,
            expectedCustomerId: CUSTOMER_ID,
            expectedTargetAnalysisId: TARGET_ID,
        })
    ).toThrow(/preserved cancel_verified/);
});

test('present-target reconciliation verdict requires API+DOM present', () => {
    seedReservedPlan();
    const base: DeletionPlanReconcileResult = {
        environment: 'live-staging',
        provesStagingReportState: true,
        reconciliationVerified: true,
        planId: RESERVED_PLAN_ID,
        plan: loadDeletionPlan(RESERVED_PLAN_ID),
        submissionLockPresent: true,
        apiCatalog: 'complete',
        historyCatalog: 'complete',
        rowCount: 1,
        pinnedRowPresent: 'yes',
        pinnedStillOldestMeasured: 'unknown',
        domRowCheck: 'present',
        routeVerification: 'passed',
        listReadiness: 'passed',
        notes: [],
    };
    expect(evaluatePresentTargetReconciliation(base).passed).toBe(true);
    expect(evaluatePresentTargetReconciliation({ ...base, domRowCheck: 'absent' }).passed).toBe(false);
});

test('combined preflight guard blocks reserved lock with dead holder', () => {
    seedReservedPlan();
    writeLock(RESERVED_PLAN_ID, 999_999);
    expect(() => assertCombinedSmokeNotBlockedByDeletionSubmissionLock()).toThrow(
        AnalysisReportFullSmokeConfigError
    );
    expect(() => assertCombinedSmokeNotBlockedByDeletionSubmissionLock()).toThrow(/abandoned-before-submission/);
});

test('abandoned_before_submission is permanently non-submittable', () => {
    seedReservedPlan();
    updateDeletionPlan(RESERVED_PLAN_ID, {
        lifecycle: 'abandoned_before_submission',
        abandonedBeforeSubmissionAt: new Date().toISOString(),
    });
    expect(() => assertPlanAllowsDeleteOnce(loadDeletionPlan(RESERVED_PLAN_ID))).toThrow(/permanently non-submittable/);
});

test('readDeletionSubmissionLockRecord parses lock file', () => {
    seedReservedPlan();
    writeLock(RESERVED_PLAN_ID, process.pid);
    const record = readDeletionSubmissionLockRecord();
    expect(record?.planId).toBe(RESERVED_PLAN_ID);
    expect(record?.pid).toBe(process.pid);
});
