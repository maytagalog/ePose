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
    restoreReservedPlanToCancelVerifiedWithAudit,
    type AnalysisReportDeletionPlan,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';
import {
    assertPreSubmitSamePlanRecoveryPrechecks,
    DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_CUSTOMER_ID,
    DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_PLAN_ID,
    DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID,
    finalizePreSubmitSamePlanCancelVerifiedRecovery,
} from '../../../../analysisReport/smoke/analysisReportPreSubmitSamePlanRecovery';
import { collectFixtureCustomerHistoryRows } from '../../../../analysisReport/reportDeletion/analysisReportDeletionHistoryCatalog.fixture';
import { ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID } from '../../../../analysisReport/reportDeletion/analysisReportDeletionFixtureContracts';
import {
    ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN,
    installAnalysisReportDeletionFixtureShell,
} from '../reportDeletion/analysisReportDeletionFixtureShell';

const PLAN_ID = DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_PLAN_ID;
const CUSTOMER_ID = ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID;
const STAGING_CUSTOMER_ID = DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_CUSTOMER_ID;
const ORIGIN = ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN;

let stateDir = '';

function seedReservedHistoryOrderPlan(overrides?: Partial<AnalysisReportDeletionPlan>): void {
    const plan: AnalysisReportDeletionPlan = {
        planId: PLAN_ID,
        createdAt: '2026-11-13T13:39:34.837Z',
        appOrigin: ORIGIN,
        customerId: CUSTOMER_ID,
        analysisId: DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID,
        measuredAtIso: '2025-11-19T09:58:35.000Z',
        measuredAtDisplay: '2025-11-19',
        listCreatedAtIso: '2025-11-19T09:58:35.000Z',
        accountId: ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
        deleteRequestId: DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID,
        rowCountAtSelection: 17,
        lifecycle: 'reserved',
        cancelVerifiedAt: '2026-11-13T13:41:11.706Z',
        reservedAt: '2026-11-13T13:52:48.219Z',
        submittedAt: null,
        completedAt: null,
        lastError: null,
        chronologyBasis: 'history-order-newest-first',
        ...overrides,
    };
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify({ schemaVersion: 1, plans: { [PLAN_ID]: plan } }, null, 2),
        'utf8'
    );
}

function writeLock(planId: string, pid: number): void {
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_LOCK_FILENAME),
        JSON.stringify({ planId, pid, at: '2026-11-13T13:52:48.218Z' }),
        'utf8'
    );
}

test.beforeEach(() => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'pre-submit-same-plan-recovery-'));
    process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
    process.env.ANALYSIS_REPORT_DELETION_CHRONOLOGY_BASIS = 'history-order-newest-first';
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
    delete process.env.ANALYSIS_REPORT_DELETION_CHRONOLOGY_BASIS;
    if (stateDir) {
        rmSync(stateDir, { recursive: true, force: true });
    }
});

test('precheck passes when lock holder pid is not running', () => {
    seedReservedHistoryOrderPlan();
    writeLock(PLAN_ID, 999_999);
    const { plan } = assertPreSubmitSamePlanRecoveryPrechecks({
        planId: PLAN_ID,
        expectedCustomerId: CUSTOMER_ID,
        expectedTargetAnalysisId: DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID,
    });
    expect(plan.cancelVerifiedAt).toBeTruthy();
    expect(plan.submittedAt).toBeNull();
});

test('ledger restore records audit and retains cancelVerifiedAt', () => {
    seedReservedHistoryOrderPlan();
    const prior = loadDeletionPlan(PLAN_ID);
    const auditEvent = {
        at: new Date().toISOString(),
        kind: 'pre_submit_same_plan_cancel_verified_restore' as const,
        priorLifecycle: 'reserved' as const,
        priorReservedAt: prior.reservedAt,
        priorLock: { planId: PLAN_ID, pid: 1, at: 'x' },
        recoveryEvidenceRef: 'fixture-evidence.json',
        notes: ['fixture'],
        targetAnalysisId: prior.analysisId,
        historyOrderNewestVerified: true,
        cancelVerifiedAt: prior.cancelVerifiedAt!,
    };
    const updated = restoreReservedPlanToCancelVerifiedWithAudit({
        planId: PLAN_ID,
        auditEvent,
        expectedLifecycle: 'reserved',
        expectedSubmittedAt: null,
        expectedReservedAt: prior.reservedAt,
    });
    expect(updated.lifecycle).toBe('cancel_verified');
    expect(updated.cancelVerifiedAt).toBe(prior.cancelVerifiedAt);
    expect(updated.reservedAt).toBeNull();
    expect(updated.recoveryAuditEvents?.[0]?.priorReservedAt).toBe(prior.reservedAt);
    assertPlanAllowsDeleteOnce(updated);
});

test('fixture staging revalidation restores cancel_verified and releases lock', async ({ page }) => {
    test.setTimeout(120000);
    await installAnalysisReportDeletionFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    const pin = (await collectFixtureCustomerHistoryRows(page, CUSTOMER_ID))[0]!;
    seedReservedHistoryOrderPlan({
        customerId: CUSTOMER_ID,
        analysisId: pin.analysisId,
        deleteRequestId: pin.analysisId,
        listCreatedAtIso: pin.chronologyIso,
        measuredAtIso: pin.chronologyIso,
    });
    writeLock(PLAN_ID, 999_999);

    const recovery = await finalizePreSubmitSamePlanCancelVerifiedRecovery({
        page,
        appOrigin: ORIGIN,
        planId: PLAN_ID,
        expectedCustomerId: CUSTOMER_ID,
        expectedTargetAnalysisId: pin.analysisId,
        evidenceRef: path.join(stateDir, 'recovery.json'),
    });

    expect(recovery.lockReleased).toBe(true);
    expect(recovery.historyOrderNewestVerified).toBe(true);
    expect(readDeletionSubmissionLockRecord()).toBeNull();

    const plan = loadDeletionPlan(PLAN_ID);
    expect(plan.lifecycle).toBe('cancel_verified');
    expect(plan.cancelVerifiedAt).toBe(recovery.cancelVerifiedAtRetained);
    expect(plan.recoveryAuditEvents?.length).toBe(1);

    expect(() =>
        assertPreSubmitSamePlanRecoveryPrechecks({
            planId: PLAN_ID,
            expectedCustomerId: CUSTOMER_ID,
            expectedTargetAnalysisId: pin.analysisId,
        })
    ).toThrow(/requires reserved/);
});

test('precheck requires matching staging customer id when plan uses staging customer', () => {
    seedReservedHistoryOrderPlan({
        appOrigin: 'https://app-stg.epose.com',
        customerId: STAGING_CUSTOMER_ID,
    });
    writeLock(PLAN_ID, 999_999);
    expect(() =>
        assertPreSubmitSamePlanRecoveryPrechecks({
            planId: PLAN_ID,
            expectedCustomerId: CUSTOMER_ID,
            expectedTargetAnalysisId: DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID,
        })
    ).toThrow(/customerId/);
});
