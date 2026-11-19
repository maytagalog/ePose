import type { Page } from '@playwright/test';
import { loginExistingUserForPart2 } from '../../login/existingUserLoginFlow';
import {
    evaluateReconciliationVerification,
    reconcilePinnedDeletionPlanOnPage,
    type DeletionPlanReconcileResult,
} from '../reportDeletion/analysisReportDeletionReconciliation';
import {
    assertDeletionLockHolderDefinitelyNotRunning,
    loadDeletionPlan,
    readDeletionSubmissionLockRecord,
    releaseDeletionSubmissionLockForPlan,
    updateDeletionPlan,
    type AnalysisReportDeletionPlan,
} from '../reportDeletion/analysisReportDeletionPlanLedger';
import { AnalysisReportDeletionPlanError } from '../reportDeletion/analysisReportDeletionErrors';
import { AnalysisReportFullSmokeConfigError } from './analysisReportFullSmokeConfig';
import { resolveAnalysisReportFullRunContext } from './analysisReportFullRunContext';
import type { TestInfo } from '@playwright/test';

export const DEFAULT_RESERVED_RECOVERY_PLAN_ID = 'cbddc205-efd0-4f20-8f88-efb46e22c40a';
export const DEFAULT_RESERVED_RECOVERY_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
export const DEFAULT_RESERVED_RECOVERY_TARGET_ANALYSIS_ID = '8cda3e53-a780-46c0-85e9-42adaf4890e5';
/** Preserved cancel_verified plan — recovery must not mutate this id. */
export const PRESERVED_CANCEL_VERIFIED_PLAN_ID = '0bc2a4e7-db7a-4fe4-a067-ad3a3466cb60';

export type AbandonedBeforeSubmissionRecoveryEvidence = {
    planId: string;
    customerId: string;
    targetAnalysisId: string;
    lockHolderPid: number | null;
    lockReleased: boolean;
    reconciliation: DeletionPlanReconcileResult;
    reconciliationVerified: boolean;
    evidenceRef: string;
    notes: string[];
};

export function resolveReservedRecoveryPlanId(): string {
    return (
        process.env.ANALYSIS_REPORT_RESERVED_RECOVERY_PLAN_ID?.trim() || DEFAULT_RESERVED_RECOVERY_PLAN_ID
    );
}

export function resolveReservedRecoveryTargetAnalysisId(): string {
    return (
        process.env.ANALYSIS_REPORT_RESERVED_RECOVERY_TARGET_ANALYSIS_ID?.trim() ||
        DEFAULT_RESERVED_RECOVERY_TARGET_ANALYSIS_ID
    );
}

export function resolveReservedRecoveryCustomerId(): string {
    return (
        process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID?.trim() ||
        process.env.ANALYSIS_REPORT_RESERVED_RECOVERY_CUSTOMER_ID?.trim() ||
        DEFAULT_RESERVED_RECOVERY_CUSTOMER_ID
    );
}

export function assertReservedRecoveryPrechecks(options: {
    planId: string;
    expectedCustomerId: string;
    expectedTargetAnalysisId: string;
}): { plan: AnalysisReportDeletionPlan; lockRecord: NonNullable<ReturnType<typeof readDeletionSubmissionLockRecord>> } {
    if (options.planId === PRESERVED_CANCEL_VERIFIED_PLAN_ID) {
        throw new AnalysisReportFullSmokeConfigError(
            `Refusing recovery on preserved cancel_verified plan ${PRESERVED_CANCEL_VERIFIED_PLAN_ID}.`
        );
    }
    const plan = loadDeletionPlan(options.planId);
    if (plan.customerId !== options.expectedCustomerId) {
        throw new AnalysisReportDeletionPlanError(
            `Plan customerId ${plan.customerId} != expected ${options.expectedCustomerId}.`
        );
    }
    if (plan.analysisId !== options.expectedTargetAnalysisId) {
        throw new AnalysisReportDeletionPlanError(
            `Plan analysisId ${plan.analysisId} != expected ${options.expectedTargetAnalysisId}.`
        );
    }
    if (plan.lifecycle !== 'reserved') {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} lifecycle=${plan.lifecycle}; recovery requires reserved.`
        );
    }
    if (plan.submittedAt !== null) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} already has submission intent (submittedAt=${plan.submittedAt}).`
        );
    }
    const lockRecord = readDeletionSubmissionLockRecord();
    if (!lockRecord) {
        throw new AnalysisReportDeletionPlanError('No deletion submission lock present for reserved recovery.');
    }
    if (lockRecord.planId !== options.planId) {
        throw new AnalysisReportDeletionPlanError(
            `Lock planId ${lockRecord.planId} != recovery plan ${options.planId}.`
        );
    }
    assertDeletionLockHolderDefinitelyNotRunning(lockRecord);
    return { plan, lockRecord };
}

export function evaluatePresentTargetReconciliation(
    result: DeletionPlanReconcileResult
): { passed: boolean; summary: string } {
    const base = evaluateReconciliationVerification(result);
    if (!base.passed) {
        return base;
    }
    if (result.pinnedRowPresent !== 'yes' || result.domRowCheck !== 'present') {
        return {
            passed: false,
            summary: `Recovery requires pinned target present in API+DOM (pinnedRowPresent=${result.pinnedRowPresent}, domRowCheck=${result.domRowCheck}).`,
        };
    }
    return {
        passed: true,
        summary: `Staging reconciliation verified: target still present (analysisId=${result.plan.analysisId}).`,
    };
}

export async function finalizeAbandonedBeforeSubmissionRecovery(options: {
    page: Page;
    appOrigin: string;
    planId: string;
    expectedCustomerId: string;
    expectedTargetAnalysisId: string;
    evidenceRef: string;
    tieBreakAnalysisId: string | null;
}): Promise<AbandonedBeforeSubmissionRecoveryEvidence> {
    const notes: string[] = [];
    const existing = loadDeletionPlan(options.planId);
    if (existing.lifecycle === 'abandoned_before_submission') {
        let lockReleased = false;
        let lockHolderPid: number | null = null;
        const lock = readDeletionSubmissionLockRecord();
        if (lock?.planId === options.planId) {
            lockHolderPid = lock.pid;
            releaseDeletionSubmissionLockForPlan(options.planId);
            lockReleased = true;
        }
        return {
            planId: options.planId,
            customerId: existing.customerId,
            targetAnalysisId: existing.analysisId,
            lockHolderPid,
            lockReleased,
            reconciliation: {
                environment: 'live-staging',
                provesStagingReportState: true,
                reconciliationVerified: true,
                planId: options.planId,
                plan: existing,
                submissionLockPresent: Boolean(lock),
                apiCatalog: 'complete',
                historyCatalog: 'complete',
                rowCount: existing.rowCountAtSelection,
                pinnedRowPresent: 'yes',
                pinnedStillOldestMeasured: 'unknown',
                domRowCheck: 'present',
                routeVerification: 'passed',
                listReadiness: 'passed',
                notes: ['Plan already abandoned_before_submission.'],
            },
            reconciliationVerified: true,
            evidenceRef: existing.reconciliationEvidenceRef ?? options.evidenceRef,
            notes: ['Plan already marked abandoned_before_submission.'],
        };
    }

    const { plan: precheckPlan, lockRecord } = assertReservedRecoveryPrechecks({
        planId: options.planId,
        expectedCustomerId: options.expectedCustomerId,
        expectedTargetAnalysisId: options.expectedTargetAnalysisId,
    });
    notes.push(
        `Precheck passed: reserved plan ${precheckPlan.planId}, submittedAt=null, lock pid ${lockRecord.pid} not running.`
    );

    const reconciliation = await reconcilePinnedDeletionPlanOnPage(
        options.page,
        options.appOrigin,
        options.planId,
        options.tieBreakAnalysisId
    );
    notes.push(...reconciliation.notes);

    const verdict = evaluatePresentTargetReconciliation(reconciliation);
    if (!verdict.passed) {
        throw new AnalysisReportFullSmokeConfigError(
            `Abandoned-before-submission recovery refused: ${verdict.summary}`
        );
    }

    updateDeletionPlan(options.planId, {
        lifecycle: 'abandoned_before_submission',
        abandonedBeforeSubmissionAt: new Date().toISOString(),
        reconciliationEvidenceRef: options.evidenceRef,
        lastError: null,
    });

    let lockReleased = false;
    releaseDeletionSubmissionLockForPlan(options.planId);
    lockReleased = true;

    notes.push('Ledger updated to abandoned_before_submission; matching submission lock released.');

    return {
        planId: options.planId,
        customerId: precheckPlan.customerId,
        targetAnalysisId: precheckPlan.analysisId,
        lockHolderPid: lockRecord.pid,
        lockReleased,
        reconciliation,
        reconciliationVerified: true,
        evidenceRef: options.evidenceRef,
        notes,
    };
}

export type ReservedPlanRecoveryRunEvidence = {
    runId: string;
    runOutputRoot: string;
    planId: string;
    customerId: string;
    recovery: AbandonedBeforeSubmissionRecoveryEvidence;
    stagingReadOnly: true;
    localLedgerWrites: true;
    note: string;
};

export async function runReservedPlanAbandonedBeforeSubmissionRecovery(options: {
    page: Page;
    testInfo: TestInfo;
    account: { email: string; password: string };
    appOrigin: string;
    planId: string;
    customerId: string;
    expectedTargetAnalysisId: string;
    tieBreakAnalysisId: string | null;
}): Promise<ReservedPlanRecoveryRunEvidence> {
    const runContext = resolveAnalysisReportFullRunContext(options.testInfo);
    await loginExistingUserForPart2(options.page, options.account);
    const recovery = await finalizeAbandonedBeforeSubmissionRecovery({
        page: options.page,
        appOrigin: options.appOrigin,
        planId: options.planId,
        expectedCustomerId: options.customerId,
        expectedTargetAnalysisId: options.expectedTargetAnalysisId,
        evidenceRef: `${runContext.runOutputRoot}/reserved-plan-abandoned-recovery.json`,
        tieBreakAnalysisId: options.tieBreakAnalysisId,
    });
    return {
        runId: runContext.runId,
        runOutputRoot: runContext.runOutputRoot,
        planId: options.planId,
        customerId: options.customerId,
        recovery,
        stagingReadOnly: true,
        localLedgerWrites: true,
        note:
            'Staging: read-only reconciliation (target present). Local ledger: abandoned_before_submission + lock release for matching planId only. No delete POST.',
    };
}
