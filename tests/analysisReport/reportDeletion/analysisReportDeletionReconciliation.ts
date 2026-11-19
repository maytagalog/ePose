import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    assertPostureAnalysisFullListRoute,
    postureAnalysisFullListPathname,
} from '../../CIRS/postureAnalysis/postureAnalysisLocators';
import { assertCustomerReportHistoryListReady } from '../reportHistory/analysisReportHistoryCustomerReadiness';
import { loadDeletionPlan, type AnalysisReportDeletionPlan } from './analysisReportDeletionPlanLedger';
import {
    ANALYSIS_REPORT_DELETION_LOCK_FILENAME,
    analysisReportDeletionStateDir,
} from './analysisReportDeletionPlanLedger';
import { loadCustomerHistoryCatalogFromNetwork } from './analysisReportCustomerHistoryApiCatalog';
import { assertHistoryRowPresent, assertHistoryRowAbsent } from './analysisReportDeletionHistoryCatalog';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import { isDeletionFixtureOrigin } from './analysisReportDeletionFixtureMode';

export type DeletionReconcileEnvironment = 'fixture-synthetic' | 'live-staging';

export type ReconcileUiCheckOutcome = 'passed' | 'failed' | 'timeout' | 'skipped' | 'unknown';

export type DeletionPlanReconcileResult = {
    environment: DeletionReconcileEnvironment;
    provesStagingReportState: boolean;
    reconciliationVerified: boolean;
    planId: string;
    plan: AnalysisReportDeletionPlan;
    submissionLockPresent: boolean;
    /** Complete validated API pagination finished. */
    apiCatalog: 'complete' | 'incomplete' | 'unknown';
    /** @deprecated Alias of apiCatalog for older evidence readers. */
    historyCatalog: 'complete' | 'unknown';
    rowCount: number | null;
    pinnedRowPresent: 'yes' | 'no' | 'unknown';
    pinnedStillOldestMeasured: 'yes' | 'no' | 'unknown';
    domRowCheck: 'present' | 'absent' | 'skipped' | 'unknown';
    routeVerification: ReconcileUiCheckOutcome;
    listReadiness: ReconcileUiCheckOutcome;
    notes: string[];
};

export type ReconciliationVerificationVerdict = {
    passed: boolean;
    summary: string;
};

const ROUTE_VERIFY_TIMEOUT_MS = 15000;
const LIST_READINESS_TIMEOUT_MS = 15000;

function readSubmissionLockPlanId(): string | null {
    const lockPath = path.join(analysisReportDeletionStateDir(), ANALYSIS_REPORT_DELETION_LOCK_FILENAME);
    if (!existsSync(lockPath)) {
        return null;
    }
    try {
        const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as { planId?: string };
        return parsed.planId?.trim() ?? null;
    } catch {
        return null;
    }
}

function reconcileEnvironmentForPage(page: Page, appOrigin: string): DeletionReconcileEnvironment {
    return isDeletionFixtureOrigin(page.url()) || isDeletionFixtureOrigin(appOrigin)
        ? 'fixture-synthetic'
        : 'live-staging';
}

function chronologyIsoFromCatalogRows(rows: Array<{ chronologyIso: string; analysisId: string }>): {
    oldestAnalysisId: string | null;
} {
    if (rows.length === 0) {
        return { oldestAnalysisId: null };
    }
    let oldest = rows[0]!;
    for (const row of rows) {
        if (Date.parse(row.chronologyIso) < Date.parse(oldest.chronologyIso)) {
            oldest = row;
        }
    }
    return { oldestAnalysisId: oldest.analysisId };
}

function errorSummary(error: unknown, maxLen = 200): string {
    if (error instanceof AnalysisReportDeletionFlowError) {
        return error.message.slice(0, maxLen);
    }
    if (error instanceof Error) {
        return error.message.slice(0, maxLen);
    }
    return 'unknown error';
}

function isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message.toLowerCase();
    return message.includes('timeout') || message.includes('timed out');
}

async function verifyHistoryListRoute(
    page: Page,
    customerId: string,
    appOrigin: string,
    timeoutMs: number
): Promise<void> {
    const expectedPath = postureAnalysisFullListPathname(customerId);
    if (!page.url().includes(expectedPath.split('?')[0]!)) {
        await page.goto(`${appOrigin}${expectedPath}`, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
        });
    }
    await assertPostureAnalysisFullListRoute(page, customerId, appOrigin, {
        pollTimeoutMs: timeoutMs,
    });
}

export function evaluateReconciliationVerification(
    result: DeletionPlanReconcileResult
): ReconciliationVerificationVerdict {
    if (result.environment === 'fixture-synthetic') {
        return {
            passed: false,
            summary: 'Fixture/synthetic reconciliation is diagnostic only; it does not prove staging report state.',
        };
    }
    if (result.apiCatalog !== 'complete') {
        return {
            passed: false,
            summary: `API catalog is not complete (${result.apiCatalog}); cannot prove staging report presence or absence.`,
        };
    }
    if (result.pinnedRowPresent === 'unknown') {
        return {
            passed: false,
            summary: 'Pinned row presence is unknown despite API catalog completion.',
        };
    }
    if (result.routeVerification !== 'passed') {
        return {
            passed: false,
            summary: `History route verification ${result.routeVerification}; UI scope for staging proof was not established.`,
        };
    }
    if (result.listReadiness !== 'passed') {
        return {
            passed: false,
            summary: `History list readiness ${result.listReadiness}; DOM checks are not authoritative.`,
        };
    }
    if (result.pinnedRowPresent === 'yes' && result.domRowCheck !== 'present') {
        return {
            passed: false,
            summary: `API reports pinned row present but DOM row check is ${result.domRowCheck}.`,
        };
    }
    if (result.pinnedRowPresent === 'no' && result.domRowCheck !== 'absent') {
        return {
            passed: false,
            summary: `API reports pinned row absent but DOM row check is ${result.domRowCheck}.`,
        };
    }
  if (!result.provesStagingReportState || !result.reconciliationVerified) {
        return {
            passed: false,
            summary: 'Reconciliation evidence incomplete; staging report state was not proved.',
        };
    }
    return {
        passed: true,
        summary: `Staging reconciliation verified: pinned row ${result.pinnedRowPresent} (rowCount=${result.rowCount}).`,
    };
}

export type ReconcilePinnedDeletionPlanOptions = {
    /** Staging origin used for route/list UI checks; defaults to `appOrigin`. */
    routeVerificationAppOrigin?: string;
};

export async function reconcilePinnedDeletionPlanOnPage(
    page: Page,
    appOrigin: string,
    planId: string,
    tieBreakAnalysisId: string | null,
    options?: ReconcilePinnedDeletionPlanOptions
): Promise<DeletionPlanReconcileResult> {
    void tieBreakAnalysisId;
    const routeAppOrigin = options?.routeVerificationAppOrigin ?? appOrigin;
    const environment = reconcileEnvironmentForPage(page, appOrigin);
    const plan = loadDeletionPlan(planId);
    const notes: string[] = [];
    if (environment === 'fixture-synthetic') {
        notes.push(
            'Fixture/synthetic DOM — results do not prove staging report presence, absence, or measured-at chronology.'
        );
    }
    const lockPlanId = readSubmissionLockPlanId();

    let apiCatalog: DeletionPlanReconcileResult['apiCatalog'] = 'unknown';
    let rowCount: number | null = null;
    let pinnedRowPresent: 'yes' | 'no' | 'unknown' = 'unknown';
    let pinnedStillOldestMeasured: 'yes' | 'no' | 'unknown' = 'unknown';
    let domRowCheck: DeletionPlanReconcileResult['domRowCheck'] = 'skipped';
    let routeVerification: ReconcileUiCheckOutcome = environment === 'fixture-synthetic' ? 'skipped' : 'unknown';
    let listReadiness: ReconcileUiCheckOutcome = environment === 'fixture-synthetic' ? 'skipped' : 'unknown';

    try {
        const catalog = await loadCustomerHistoryCatalogFromNetwork(page, appOrigin, plan.customerId, {
            reload: true,
            postCaptureUiVerification: false,
            allowEmptyHistory: true,
        });
        if (catalog.catalogComplete) {
            apiCatalog = 'complete';
            rowCount = catalog.rows.length;
            pinnedRowPresent = catalog.rows.some((row) => row.analysisId === plan.analysisId) ? 'yes' : 'no';
            const { oldestAnalysisId } = chronologyIsoFromCatalogRows(catalog.rows);
            if (oldestAnalysisId) {
                pinnedStillOldestMeasured = oldestAnalysisId === plan.analysisId ? 'yes' : 'no';
                notes.push(
                    'pinnedStillOldestMeasured uses API list createdAt chronology only (no measured-at enrichment during reconcile).'
                );
            } else {
                pinnedStillOldestMeasured = 'no';
            }
        } else {
            apiCatalog = 'incomplete';
            notes.push('API catalog returned catalogComplete=false.');
        }
    } catch (error) {
        apiCatalog = 'unknown';
        notes.push(errorSummary(error));
    }

    if (environment === 'live-staging' && apiCatalog === 'complete') {
        try {
            await verifyHistoryListRoute(page, plan.customerId, routeAppOrigin, ROUTE_VERIFY_TIMEOUT_MS);
            routeVerification = 'passed';
        } catch (error) {
            routeVerification = isTimeoutError(error) ? 'timeout' : 'failed';
            notes.push(`Route verification ${routeVerification}: ${errorSummary(error, 160)}`);
        }

        if (routeVerification === 'passed') {
            try {
                await assertCustomerReportHistoryListReady(page, plan.customerId);
                listReadiness = 'passed';
            } catch (error) {
                listReadiness = isTimeoutError(error) ? 'timeout' : 'failed';
                notes.push(`List readiness ${listReadiness}: ${errorSummary(error, 160)}`);
            }
        } else {
            listReadiness = 'skipped';
            domRowCheck = 'skipped';
            notes.push('DOM row check skipped because route verification did not pass.');
        }

        if (routeVerification === 'passed' && listReadiness === 'passed') {
            if (pinnedRowPresent === 'yes') {
                try {
                    await assertHistoryRowPresent(page, plan.customerId, plan.analysisId);
                    domRowCheck = 'present';
                } catch (error) {
                    domRowCheck = 'unknown';
                    notes.push(`DOM present check failed: ${errorSummary(error, 120)}`);
                }
            } else if (pinnedRowPresent === 'no') {
                try {
                    await assertHistoryRowAbsent(page, plan.customerId, plan.analysisId);
                    domRowCheck = 'absent';
                } catch (error) {
                    domRowCheck = 'unknown';
                    notes.push(`DOM absence check failed: ${errorSummary(error, 120)}`);
                }
            }
        }
    }

    if (lockPlanId && lockPlanId !== planId) {
        notes.push(`Submission lock references a different planId (${lockPlanId}).`);
    }

    const historyCatalog: 'complete' | 'unknown' = apiCatalog === 'complete' ? 'complete' : 'unknown';

    const provesStagingReportState =
        environment === 'live-staging' &&
        apiCatalog === 'complete' &&
        pinnedRowPresent !== 'unknown' &&
        routeVerification === 'passed' &&
        listReadiness === 'passed' &&
        ((pinnedRowPresent === 'yes' && domRowCheck === 'present') ||
            (pinnedRowPresent === 'no' && domRowCheck === 'absent'));

    const reconciliationVerified = provesStagingReportState;

    return {
        environment,
        provesStagingReportState,
        reconciliationVerified,
        planId,
        plan,
        submissionLockPresent: lockPlanId === planId,
        apiCatalog,
        historyCatalog,
        rowCount,
        pinnedRowPresent,
        pinnedStillOldestMeasured,
        domRowCheck,
        routeVerification,
        listReadiness,
        notes,
    };
}

export function reconcileDeletionPlanLedgerOnly(planId: string): Pick<
    DeletionPlanReconcileResult,
    | 'environment'
    | 'provesStagingReportState'
    | 'reconciliationVerified'
    | 'planId'
    | 'plan'
    | 'submissionLockPresent'
    | 'notes'
> {
    const plan = loadDeletionPlan(planId);
    const lockPlanId = readSubmissionLockPlanId();
    const notes: string[] = [];
    if (lockPlanId && lockPlanId !== planId) {
        notes.push(`Submission lock references a different planId (${lockPlanId}).`);
    }
    return {
        environment: 'live-staging',
        provesStagingReportState: false,
        reconciliationVerified: false,
        planId,
        plan,
        submissionLockPresent: lockPlanId === planId,
        notes,
    };
}
