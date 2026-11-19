import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { OldestReportSelection } from './analysisReportDeletionOldestSelection';
import { AnalysisReportDeletionPlanError } from './analysisReportDeletionErrors';

const DEFAULT_STATE_DIR = path.join(process.cwd(), 'test-state', 'analysisReportDeletion');

export function analysisReportDeletionStateDir(): string {
    return process.env.ANALYSIS_REPORT_DELETION_STATE_DIR?.trim() || DEFAULT_STATE_DIR;
}
export const ANALYSIS_REPORT_DELETION_PLANS_FILENAME = 'deletion-plans.json';
export const ANALYSIS_REPORT_DELETION_LOCK_FILENAME = 'deletion.lock';

export type DeletionPlanLifecycle =
    | 'prepared'
    | 'cancel_verified'
    | 'reserved'
    | 'submitted'
    | 'completed'
    | 'uncertain'
    | 'failed'
    | 'reconciled_absent'
    | 'abandoned_before_submission';

export type AnalysisReportDeletionRecoveryAuditEvent = {
    at: string;
    kind: 'pre_submit_same_plan_cancel_verified_restore';
    priorLifecycle: DeletionPlanLifecycle;
    priorReservedAt: string | null;
    priorLock: DeletionSubmissionLockRecord | null;
    recoveryEvidenceRef: string;
    notes: string[];
    targetAnalysisId: string;
    historyOrderNewestVerified: boolean;
    /** Original cancel-only verification timestamp retained on plan. */
    cancelVerifiedAt: string;
};

export type AnalysisReportDeletionPlan = {
    planId: string;
    createdAt: string;
    appOrigin: string;
    customerId: string;
    analysisId: string;
    measuredAtIso: string;
    measuredAtDisplay: string;
    listCreatedAtIso: string;
    accountId: string;
    deleteRequestId: string;
    rowCountAtSelection: number;
    lifecycle: DeletionPlanLifecycle;
    cancelVerifiedAt: string | null;
    reservedAt: string | null;
    submittedAt: string | null;
    completedAt: string | null;
    lastError: string | null;
    reconciledAbsentAt?: string | null;
    abandonedBeforeSubmissionAt?: string | null;
    reconciliationEvidenceRef?: string | null;
    chronologyBasis?: 'measuredAt' | 'history-order-newest-first' | null;
    recoveryAuditEvents?: AnalysisReportDeletionRecoveryAuditEvent[];
};

export type DeletionSubmissionLockRecord = {
    planId: string;
    pid: number;
    at: string;
};

type PlansDocument = {
    schemaVersion: 1;
    plans: Record<string, AnalysisReportDeletionPlan>;
};

function plansPath(): string {
    return path.join(analysisReportDeletionStateDir(), ANALYSIS_REPORT_DELETION_PLANS_FILENAME);
}

function lockPath(): string {
    return path.join(analysisReportDeletionStateDir(), ANALYSIS_REPORT_DELETION_LOCK_FILENAME);
}

function ensureStateDir(): void {
    mkdirSync(analysisReportDeletionStateDir(), { recursive: true });
}

function readPlansDoc(): PlansDocument {
    ensureStateDir();
    const file = plansPath();
    try {
        const raw = readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw) as PlansDocument;
        if (parsed.schemaVersion !== 1 || !parsed.plans) {
            throw new AnalysisReportDeletionPlanError('Invalid deletion plans schema.');
        }
        return parsed;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { schemaVersion: 1, plans: {} };
        }
        throw error;
    }
}

function writePlansDocAtomic(doc: PlansDocument): void {
    ensureStateDir();
    const file = plansPath();
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    renameSync(tmp, file);
}

export function createDeletionPlan(
    appOrigin: string,
    selection: OldestReportSelection
): AnalysisReportDeletionPlan {
    const doc = readPlansDoc();
    const plan: AnalysisReportDeletionPlan = {
        planId: randomUUID(),
        createdAt: new Date().toISOString(),
        appOrigin,
        customerId: selection.customerId,
        analysisId: selection.analysisId,
        measuredAtIso: selection.measuredAtIso,
        measuredAtDisplay: selection.measuredAtDisplay,
        listCreatedAtIso: selection.listCreatedAtIso,
        accountId: selection.accountId,
        deleteRequestId: selection.deleteRequestId,
        rowCountAtSelection: selection.rowCount,
        lifecycle: 'prepared',
        cancelVerifiedAt: null,
        reservedAt: null,
        submittedAt: null,
        completedAt: null,
        lastError: null,
        chronologyBasis: selection.chronologyBasis ?? null,
    };
    doc.plans[plan.planId] = plan;
    writePlansDocAtomic(doc);
    return plan;
}

export function loadDeletionPlan(planId: string): AnalysisReportDeletionPlan {
    const doc = readPlansDoc();
    const plan = doc.plans[planId];
    if (!plan) {
        throw new AnalysisReportDeletionPlanError(`Deletion plan not found: ${planId}`);
    }
    return plan;
}

export function updateDeletionPlan(
    planId: string,
    patch: Partial<AnalysisReportDeletionPlan>
): AnalysisReportDeletionPlan {
    const doc = readPlansDoc();
    const existing = doc.plans[planId];
    if (!existing) {
        throw new AnalysisReportDeletionPlanError(`Deletion plan not found: ${planId}`);
    }
    const updated = { ...existing, ...patch, planId: existing.planId };
    doc.plans[planId] = updated;
    writePlansDocAtomic(doc);
    return updated;
}

const BLOCKING_LIFECYCLES_FOR_NEW_WORK = new Set<DeletionPlanLifecycle>([
    'submitted',
    'completed',
    'uncertain',
    'failed',
    'reserved',
    'reconciled_absent',
    'abandoned_before_submission',
]);

const PERMANENTLY_NON_SUBMITTABLE_LIFECYCLES = new Set<DeletionPlanLifecycle>([
    'reconciled_absent',
    'abandoned_before_submission',
]);

export function assertPlanAllowsCancelOrReserve(plan: AnalysisReportDeletionPlan): void {
    if (BLOCKING_LIFECYCLES_FOR_NEW_WORK.has(plan.lifecycle)) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} lifecycle=${plan.lifecycle} blocks new cancel/reserve work.`
        );
    }
}

export function assertPlanAllowsDeleteOnce(plan: AnalysisReportDeletionPlan): void {
    if (PERMANENTLY_NON_SUBMITTABLE_LIFECYCLES.has(plan.lifecycle)) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} lifecycle=${plan.lifecycle} is permanently non-submittable.`
        );
    }
    if (plan.lifecycle !== 'cancel_verified') {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} lifecycle=${plan.lifecycle} is not eligible for delete-once (need cancel_verified from cancel-only run).`
        );
    }
}

export function readDeletionSubmissionLockRecord(): DeletionSubmissionLockRecord | null {
    const lock = lockPath();
    if (!existsSync(lock)) {
        return null;
    }
    try {
        const parsed = JSON.parse(readFileSync(lock, 'utf8')) as {
            planId?: string;
            pid?: number;
            at?: string;
        };
        const planId = parsed.planId?.trim();
        if (!planId) {
            return null;
        }
        const pid = typeof parsed.pid === 'number' ? parsed.pid : Number(parsed.pid);
        if (!Number.isInteger(pid) || pid <= 0) {
            return null;
        }
        return {
            planId,
            pid,
            at: typeof parsed.at === 'string' ? parsed.at : '',
        };
    } catch {
        return null;
    }
}

export function readDeletionSubmissionLockPlanId(): string | null {
    return readDeletionSubmissionLockRecord()?.planId ?? null;
}

/**
 * Fail closed when the lock holder process may still be running or cannot be verified dead.
 */
export function assertDeletionLockHolderDefinitelyNotRunning(record: DeletionSubmissionLockRecord): void {
    try {
        process.kill(record.pid, 0);
        throw new AnalysisReportDeletionPlanError(
            `Deletion submission lock holder pid ${record.pid} still running (planId=${record.planId}).`
        );
    } catch (error) {
        if (error instanceof AnalysisReportDeletionPlanError) {
            throw error;
        }
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ESRCH') {
            return;
        }
        throw new AnalysisReportDeletionPlanError(
            `Cannot verify deletion lock holder pid ${record.pid}; fail closed (${code ?? 'unknown'}).`
        );
    }
}

export function releaseDeletionSubmissionLockForPlan(planId: string): void {
    const lock = lockPath();
    if (!existsSync(lock)) {
        throw new AnalysisReportDeletionPlanError('No deletion submission lock present.');
    }
    const lockRecord = readDeletionSubmissionLockRecord();
    if (!lockRecord || lockRecord.planId !== planId) {
        throw new AnalysisReportDeletionPlanError(
            `Lock ownership mismatch: lock references ${lockRecord?.planId ?? 'unknown'}, expected ${planId}.`
        );
    }
    const lockRecordAgain = readDeletionSubmissionLockRecord();
    if (!lockRecordAgain || lockRecordAgain.planId !== planId) {
        throw new AnalysisReportDeletionPlanError(
            `Deletion submission lock changed concurrently before release (expected ${planId}).`
        );
    }
    releaseDeletionSubmissionLock();
}

/** Persist submission intent in ledger before clicking delete Confirm (lock must already exist). */
export function persistDeletionSubmissionIntent(planId: string): AnalysisReportDeletionPlan {
    if (!existsSync(lockPath())) {
        throw new AnalysisReportDeletionPlanError(
            'Cannot persist deletion submission intent without submission lock.'
        );
    }
    return updateDeletionPlan(planId, {
        lifecycle: 'submitted',
        submittedAt: new Date().toISOString(),
    });
}

export function acquireDeletionSubmissionLock(planId: string): void {
    ensureStateDir();
    const lock = lockPath();
    try {
        writeFileSync(lock, JSON.stringify({ planId, pid: process.pid, at: new Date().toISOString() }), {
            flag: 'wx',
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            const existing = readFileSync(lock, 'utf8');
            throw new AnalysisReportDeletionPlanError(
                `Deletion submission lock held; refuses concurrent/rerun delete: ${existing}`
            );
        }
        throw error;
    }
    updateDeletionPlan(planId, { lifecycle: 'reserved', reservedAt: new Date().toISOString() });
}

export function releaseDeletionSubmissionLock(): void {
    try {
        unlinkSync(lockPath());
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}

/**
 * Restore a stalled reserved plan back to cancel_verified under an audit trail. Fails closed on ledger drift.
 */
export function restoreReservedPlanToCancelVerifiedWithAudit(options: {
    planId: string;
    auditEvent: AnalysisReportDeletionRecoveryAuditEvent;
    expectedLifecycle: 'reserved';
    expectedSubmittedAt: null;
    expectedReservedAt: string | null;
}): AnalysisReportDeletionPlan {
    const doc = readPlansDoc();
    const existing = doc.plans[options.planId];
    if (!existing) {
        throw new AnalysisReportDeletionPlanError(`Deletion plan not found: ${options.planId}`);
    }
    if (existing.lifecycle !== options.expectedLifecycle) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${options.planId} lifecycle=${existing.lifecycle}; expected ${options.expectedLifecycle} before recovery.`
        );
    }
    if (existing.submittedAt !== options.expectedSubmittedAt) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${options.planId} submittedAt=${existing.submittedAt}; recovery requires submittedAt=null.`
        );
    }
    if (existing.reservedAt !== options.expectedReservedAt) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${options.planId} reservedAt changed concurrently (expected ${options.expectedReservedAt}).`
        );
    }
    if (!existing.cancelVerifiedAt?.trim()) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${options.planId} missing cancelVerifiedAt; cannot restore without prior cancel verification evidence.`
        );
    }

    const updated: AnalysisReportDeletionPlan = {
        ...existing,
        lifecycle: 'cancel_verified',
        reservedAt: null,
        lastError: null,
        recoveryAuditEvents: [...(existing.recoveryAuditEvents ?? []), options.auditEvent],
    };
    doc.plans[options.planId] = updated;
    writePlansDocAtomic(doc);
    return updated;
}
