import type { Browser, Page, TestInfo } from '@playwright/test';
import {
    assertPlanAllowsDeleteOnce,
    loadDeletionPlan,
    readDeletionSubmissionLockRecord,
} from './analysisReportDeletionPlanLedger';
import { AnalysisReportDeletionPlanError } from './analysisReportDeletionErrors';
import {
    assertHistoryOrderResumeChronologyDeclared,
    resolveDeletionPlanChronologyBasis,
} from './analysisReportDeletionPlanChronology';
import {
    finalizeAnalysisReportDeletionRun,
    runAnalysisReportDeletionStandalone,
    type RunAnalysisReportDeletionOptions,
} from './analysisReportDeletionRunOrchestrator';
import type { AnalysisReportDeletionRunConfig } from './analysisReportDeletionConfig';

export const DEFAULT_RESUME_DELETE_ONCE_PLAN_ID = '0bc2a4e7-db7a-4fe4-a067-ad3a3466cb60';
export const DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
export const DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID = 'ca31a6cb-548b-4f32-a409-53cf4e38ce5b';

export function resolveResumeDeleteOncePlanId(): string {
    return process.env.ANALYSIS_REPORT_DELETION_PLAN_ID?.trim() || DEFAULT_RESUME_DELETE_ONCE_PLAN_ID;
}

export function resolveResumeDeleteOnceCustomerId(): string {
    return process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID?.trim() || DEFAULT_RESUME_DELETE_ONCE_CUSTOMER_ID;
}

export function resolveResumeDeleteOnceTargetAnalysisId(): string {
    return (
        process.env.ANALYSIS_REPORT_DELETION_TARGET_ANALYSIS_ID?.trim() ||
        DEFAULT_RESUME_DELETE_ONCE_TARGET_ANALYSIS_ID
    );
}

/**
 * Ledger-only guards before login: cancel_verified, no submission intent, identity match, no active lock.
 */
export function assertDeletionResumeDeleteOncePrechecks(options: {
    planId: string;
    customerId: string;
    targetAnalysisId: string;
}): void {
    const lock = readDeletionSubmissionLockRecord();
    if (lock) {
        throw new AnalysisReportDeletionPlanError(
            `Deletion submission lock still present for plan ${lock.planId}; finish or recover before resume.`
        );
    }

    const plan = loadDeletionPlan(options.planId);
    assertPlanAllowsDeleteOnce(plan);
    if (plan.submittedAt !== null) {
        throw new AnalysisReportDeletionPlanError(
            `Plan ${plan.planId} already has submission intent (submittedAt=${plan.submittedAt}).`
        );
    }
    if (plan.customerId !== options.customerId) {
        throw new AnalysisReportDeletionPlanError(
            `Plan customerId ${plan.customerId} != expected ${options.customerId}.`
        );
    }
    if (plan.analysisId !== options.targetAnalysisId) {
        throw new AnalysisReportDeletionPlanError(
            `Plan analysisId ${plan.analysisId} != expected pinned target ${options.targetAnalysisId}; no substitution.`
        );
    }
    assertHistoryOrderResumeChronologyDeclared(plan);
    void resolveDeletionPlanChronologyBasis(plan);
}

export async function runAnalysisReportDeletionResumeDeleteOnce(
    options: RunAnalysisReportDeletionOptions & {
        planId: string;
        customerId: string;
        targetAnalysisId: string;
    }
): Promise<{ evidence: Awaited<ReturnType<typeof runAnalysisReportDeletionStandalone>>['evidence']; primaryError: unknown }> {
    assertDeletionResumeDeleteOncePrechecks({
        planId: options.planId,
        customerId: options.customerId,
        targetAnalysisId: options.targetAnalysisId,
    });

    const config: AnalysisReportDeletionRunConfig = {
        mode: 'delete-once',
        customerId: options.customerId,
        planId: options.planId,
        appOrigin: options.appOrigin,
        tieBreakAnalysisId: null,
        deleteApiUrl: options.config?.deleteApiUrl ?? null,
    };

    return runAnalysisReportDeletionStandalone({
        ...options,
        config,
    });
}

export async function finalizeAnalysisReportDeletionResumeDeleteOnce(
    testInfo: TestInfo,
    evidence: Awaited<ReturnType<typeof runAnalysisReportDeletionStandalone>>['evidence'],
    primaryError: unknown
): Promise<void> {
    await finalizeAnalysisReportDeletionRun(testInfo, evidence, primaryError);
}
