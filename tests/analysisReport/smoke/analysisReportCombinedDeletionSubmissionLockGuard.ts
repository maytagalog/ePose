import {
    loadDeletionPlan,
    readDeletionSubmissionLockRecord,
} from '../reportDeletion/analysisReportDeletionPlanLedger';
import { AnalysisReportFullSmokeConfigError } from './analysisReportFullSmokeConfig';

const BLOCKING_LIFECYCLES_WITH_LOCK = new Set([
    'submitted',
    'completed',
    'uncertain',
    'reconciled_absent',
    'reserved',
    'abandoned_before_submission',
]);

/**
 * Read-only guard before display settings, share-email, or embedded deletion plan creation.
 * Atomic acquireDeletionSubmissionLock remains the final reservation guard.
 */
export function assertCombinedSmokeNotBlockedByDeletionSubmissionLock(): void {
    const lock = readDeletionSubmissionLockRecord();
    if (!lock) {
        return;
    }

    try {
        process.kill(lock.pid, 0);
        throw new AnalysisReportFullSmokeConfigError(
            `Deletion submission lock holder pid ${lock.pid} still running for plan ${lock.planId}; fail closed.`
        );
    } catch (error) {
        if (error instanceof AnalysisReportFullSmokeConfigError) {
            throw error;
        }
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ESRCH') {
            throw new AnalysisReportFullSmokeConfigError(
                `Cannot verify deletion lock holder pid ${lock.pid}; fail closed (${code ?? 'unknown'}).`
            );
        }
    }

    let plan;
    try {
        plan = loadDeletionPlan(lock.planId);
    } catch {
        throw new AnalysisReportFullSmokeConfigError(
            `Deletion submission lock references missing plan ${lock.planId}.`
        );
    }

    if (plan.lifecycle === 'reserved' && plan.submittedAt === null) {
        throw new AnalysisReportFullSmokeConfigError(
            `Plan ${plan.planId} is reserved (pre-submit) with an active submission lock; run abandoned-before-submission recovery before combined mutations.`
        );
    }

    if (plan.submittedAt !== null || plan.lifecycle === 'submitted') {
        throw new AnalysisReportFullSmokeConfigError(
            `Plan ${lock.planId} has deletion submission intent; stop for review before combined mutations.`
        );
    }

    if (BLOCKING_LIFECYCLES_WITH_LOCK.has(plan.lifecycle)) {
        throw new AnalysisReportFullSmokeConfigError(
            `Plan ${lock.planId} lifecycle=${plan.lifecycle} blocks combined smoke while submission lock is present.`
        );
    }
}
