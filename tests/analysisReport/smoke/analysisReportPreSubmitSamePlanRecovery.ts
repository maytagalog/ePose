import type { Page, TestInfo } from '@playwright/test';
import { loginExistingUserForPart2 } from '../../login/existingUserLoginFlow';
import {
    assertDeletionLockHolderDefinitelyNotRunning,
    loadDeletionPlan,
    readDeletionSubmissionLockRecord,
    releaseDeletionSubmissionLockForPlan,
    restoreReservedPlanToCancelVerifiedWithAudit,
    type AnalysisReportDeletionPlan,
    type AnalysisReportDeletionRecoveryAuditEvent,
    type DeletionSubmissionLockRecord,
} from '../reportDeletion/analysisReportDeletionPlanLedger';
import { AnalysisReportDeletionPlanError } from '../reportDeletion/analysisReportDeletionErrors';
import { resolveAnalysisReportFullRunContext } from './analysisReportFullRunContext';
import { assertHistoryOrderResumeChronologyDeclared } from '../reportDeletion/analysisReportDeletionPlanChronology';
import { revalidateCombinedPinnedDeletionPlanOnHistory } from './analysisReportCombinedHistoryOrderSelection';
import { assertHistoryRowPresent } from '../reportDeletion/analysisReportDeletionHistoryCatalog';
import {
    postureAnalysisFullListPathname,
} from '../../CIRS/postureAnalysis/postureAnalysisLocators';

export const DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_PLAN_ID = '0bc2a4e7-db7a-4fe4-a067-ad3a3466cb60';
export const DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
export const DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID =
    'ca31a6cb-548b-4f32-a409-53cf4e38ce5b';

export type PreSubmitSamePlanRecoveryEvidence = {
    planId: string;
    customerId: string;
    targetAnalysisId: string;
    lockHolderPid: number | null;
    lockReleased: boolean;
    cancelVerifiedAtRetained: string;
    priorReservedAt: string | null;
    historyOrderNewestVerified: boolean;
    domRowPresent: boolean;
    evidenceRef: string;
    auditEvent: AnalysisReportDeletionRecoveryAuditEvent;
    notes: string[];
};

export function resolvePreSubmitSamePlanRecoveryPlanId(): string {
    return (
        process.env.ANALYSIS_REPORT_PRE_SUBMIT_SAME_PLAN_RECOVERY_PLAN_ID?.trim() ||
        DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_PLAN_ID
    );
}

export function resolvePreSubmitSamePlanRecoveryCustomerId(): string {
    return (
        process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID?.trim() ||
        process.env.ANALYSIS_REPORT_PRE_SUBMIT_SAME_PLAN_RECOVERY_CUSTOMER_ID?.trim() ||
        DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_CUSTOMER_ID
    );
}

export function resolvePreSubmitSamePlanRecoveryTargetAnalysisId(): string {
    return (
        process.env.ANALYSIS_REPORT_DELETION_TARGET_ANALYSIS_ID?.trim() ||
        process.env.ANALYSIS_REPORT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID?.trim() ||
        DEFAULT_PRE_SUBMIT_SAME_PLAN_RECOVERY_TARGET_ANALYSIS_ID
    );
}

export function assertPreSubmitSamePlanRecoveryPrechecks(options: {
    planId: string;
    expectedCustomerId: string;
    expectedTargetAnalysisId: string;
}): { plan: AnalysisReportDeletionPlan; lockRecord: DeletionSubmissionLockRecord } {
    const plan = loadDeletionPlan(options.planId);
    if (plan.customerId !== options.expectedCustomerId) {
        throw new AnalysisReportDeletionPlanError(
            `Plan customerId ${plan.customerId} != expected ${options.expectedCustomerId}.`
        );
    }
    if (plan.analysisId !== options.expectedTargetAnalysisId) {
        throw new AnalysisReportDeletionPlanError(
            `Plan analysisId ${plan.analysisId} != expected pinned target ${options.expectedTargetAnalysisId}; no substitution.`
        );
    }
    if (plan.deleteRequestId !== options.expectedTargetAnalysisId) {
        throw new AnalysisReportDeletionPlanError(
            `Plan deleteRequestId ${plan.deleteRequestId} != expected ${options.expectedTargetAnalysisId}.`
        );
    }
    if (plan.lifecycle !== 'reserved') {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} lifecycle=${plan.lifecycle}; same-plan pre-submit recovery requires reserved.`
        );
    }
    if (plan.submittedAt !== null) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} already has submission intent (submittedAt=${plan.submittedAt}).`
        );
    }
    if (!plan.cancelVerifiedAt?.trim()) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} missing cancelVerifiedAt; retain prior cancel verification before recovery.`
        );
    }
    assertHistoryOrderResumeChronologyDeclared(plan);

    const lockRecord = readDeletionSubmissionLockRecord();
    if (!lockRecord) {
        throw new AnalysisReportDeletionPlanError('No deletion submission lock present for same-plan recovery.');
    }
    if (lockRecord.planId !== options.planId) {
        throw new AnalysisReportDeletionPlanError(
            `Lock planId ${lockRecord.planId} != recovery plan ${options.planId}.`
        );
    }
    assertDeletionLockHolderDefinitelyNotRunning(lockRecord);
    return { plan, lockRecord };
}

function assertLedgerAndLockUnchangedForRecovery(options: {
    planId: string;
    expectedReservedAt: string | null;
    expectedLock: DeletionSubmissionLockRecord;
}): void {
    const plan = loadDeletionPlan(options.planId);
    if (plan.lifecycle !== 'reserved' || plan.submittedAt !== null) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${options.planId} changed before ledger recovery commit.`
        );
    }
    if (plan.reservedAt !== options.expectedReservedAt) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${options.planId} reservedAt changed during staging validation.`
        );
    }
    const lock = readDeletionSubmissionLockRecord();
    if (
        !lock ||
        lock.planId !== options.expectedLock.planId ||
        lock.pid !== options.expectedLock.pid ||
        lock.at !== options.expectedLock.at
    ) {
        throw new AnalysisReportDeletionPlanError(
            'Deletion submission lock changed concurrently during staging validation.'
        );
    }
}

export async function finalizePreSubmitSamePlanCancelVerifiedRecovery(options: {
    page: Page;
    appOrigin: string;
    planId: string;
    expectedCustomerId: string;
    expectedTargetAnalysisId: string;
    evidenceRef: string;
}): Promise<PreSubmitSamePlanRecoveryEvidence> {
    const notes: string[] = [];
    const { plan: precheckPlan, lockRecord } = assertPreSubmitSamePlanRecoveryPrechecks({
        planId: options.planId,
        expectedCustomerId: options.expectedCustomerId,
        expectedTargetAnalysisId: options.expectedTargetAnalysisId,
    });
    const expectedReservedAt = precheckPlan.reservedAt;
    const cancelVerifiedAt = precheckPlan.cancelVerifiedAt!;
    notes.push(
        `Precheck: reserved plan ${precheckPlan.planId}, submittedAt=null, lock pid ${lockRecord.pid} not running, cancelVerifiedAt=${cancelVerifiedAt}.`
    );

    const historyPath = postureAnalysisFullListPathname(precheckPlan.customerId);
    if (!options.page.url().includes(historyPath.split('?')[0]!)) {
        await options.page.goto(`${options.appOrigin}${historyPath}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
    }

    await revalidateCombinedPinnedDeletionPlanOnHistory(
        options.page,
        options.appOrigin,
        precheckPlan
    );
    notes.push('Fresh complete history catalog: pinned target still history-order newest.');

    await assertHistoryRowPresent(options.page, precheckPlan.customerId, precheckPlan.analysisId);
    notes.push('DOM row check: pinned target present.');

    assertLedgerAndLockUnchangedForRecovery({
        planId: options.planId,
        expectedReservedAt,
        expectedLock: lockRecord,
    });

    const auditEvent: AnalysisReportDeletionRecoveryAuditEvent = {
        at: new Date().toISOString(),
        kind: 'pre_submit_same_plan_cancel_verified_restore',
        priorLifecycle: 'reserved',
        priorReservedAt: expectedReservedAt,
        priorLock: { ...lockRecord },
        recoveryEvidenceRef: options.evidenceRef,
        notes: [...notes],
        targetAnalysisId: precheckPlan.analysisId,
        historyOrderNewestVerified: true,
        cancelVerifiedAt,
    };

    restoreReservedPlanToCancelVerifiedWithAudit({
        planId: options.planId,
        auditEvent,
        expectedLifecycle: 'reserved',
        expectedSubmittedAt: null,
        expectedReservedAt,
    });
    notes.push('Ledger: audit event recorded; lifecycle restored to cancel_verified (reservedAt cleared).');

    releaseDeletionSubmissionLockForPlan(options.planId);
    notes.push('Matching submission lock released.');

    return {
        planId: options.planId,
        customerId: precheckPlan.customerId,
        targetAnalysisId: precheckPlan.analysisId,
        lockHolderPid: lockRecord.pid,
        lockReleased: true,
        cancelVerifiedAtRetained: cancelVerifiedAt,
        priorReservedAt: expectedReservedAt,
        historyOrderNewestVerified: true,
        domRowPresent: true,
        evidenceRef: options.evidenceRef,
        auditEvent,
        notes,
    };
}

export type PreSubmitSamePlanRecoveryRunEvidence = {
    runId: string;
    runOutputRoot: string;
    planId: string;
    customerId: string;
    recovery: PreSubmitSamePlanRecoveryEvidence;
    stagingReadOnly: true;
    localLedgerWrites: true;
    note: string;
};

export async function runPreSubmitSamePlanCancelVerifiedRecovery(options: {
    page: Page;
    testInfo: TestInfo;
    account: { email: string; password: string };
    appOrigin: string;
    planId: string;
    customerId: string;
    expectedTargetAnalysisId: string;
}): Promise<PreSubmitSamePlanRecoveryRunEvidence> {
    const runContext = resolveAnalysisReportFullRunContext(options.testInfo);
    await loginExistingUserForPart2(options.page, options.account);
    const recovery = await finalizePreSubmitSamePlanCancelVerifiedRecovery({
        page: options.page,
        appOrigin: options.appOrigin,
        planId: options.planId,
        expectedCustomerId: options.customerId,
        expectedTargetAnalysisId: options.expectedTargetAnalysisId,
        evidenceRef: `${runContext.runOutputRoot}/pre-submit-same-plan-recovery.json`,
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
            'Staging: read-only history-order revalidation + DOM presence. Local ledger: audited cancel_verified restore + matching lock release. No delete POST.',
    };
}
