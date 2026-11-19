import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
    evaluateReconciliationVerification,
    reconcilePinnedDeletionPlanOnPage,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionReconciliation';
import {
    ANALYSIS_REPORT_DELETION_PLANS_FILENAME,
    type AnalysisReportDeletionPlan,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';
import { postureAnalysisFullListPathname } from '../../../../CIRS/postureAnalysis/postureAnalysisLocators';
import { VERIFIED_FETCH_CUSTOMER_REPORT_URL } from '../../../../analysisReport/reportDeletion/analysisReportStagingContracts';
const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://analysis-report-deletion-reconcile.test';
const CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
const PINNED_ANALYSIS_ID = '25190ae1-f5e3-40a8-b284-5a84caefaf35';
const ACCOUNT_ID = 'reconcile-fixture-account';
const PLAN_ID = 'reconcile-fixture-plan';

function collectorShell(): string {
    return fs.readFileSync(
        path.join(fixturesDir, 'analysisReportHistoryNetworkCollectorShell.html'),
        'utf8'
    );
}

function seedPlan(): void {
    const plan: AnalysisReportDeletionPlan = {
        planId: PLAN_ID,
        createdAt: new Date().toISOString(),
        appOrigin: ORIGIN,
        customerId: CUSTOMER_ID,
        analysisId: PINNED_ANALYSIS_ID,
        measuredAtIso: '2024-08-05T03:45:51.000Z',
        measuredAtDisplay: '2024.08.05 12:45',
        listCreatedAtIso: '2024-08-05T03:45:51.000Z',
        accountId: ACCOUNT_ID,
        deleteRequestId: PINNED_ANALYSIS_ID,
        rowCountAtSelection: 17,
        lifecycle: 'uncertain',
        cancelVerifiedAt: null,
        reservedAt: null,
        submittedAt: new Date().toISOString(),
        completedAt: null,
        lastError: null,
    };
    const stateDir = process.env.ANALYSIS_REPORT_DELETION_STATE_DIR!;
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify({ schemaVersion: 1, plans: { [PLAN_ID]: plan } }, null, 2),
        'utf8'
    );
}

function navigationQuery(scenario: string): string {
    return `?scenario=${scenario}&customerId=${CUSTOMER_ID}&accountId=${ACCOUNT_ID}&apiUrl=${encodeURIComponent(VERIFIED_FETCH_CUSTOMER_REPORT_URL)}`;
}

let stateDir = '';

test.beforeEach(() => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'analysis-report-deletion-reconcile-'));
    process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
    process.env.ANALYSIS_REPORT_CUSTOMER_HISTORY_FIRST_PAGE_WAIT_MS = '8000';
    seedPlan();
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
    delete process.env.ANALYSIS_REPORT_CUSTOMER_HISTORY_FIRST_PAGE_WAIT_MS;
    if (stateDir) {
        rmSync(stateDir, { recursive: true, force: true });
    }
});

async function installReconcileHarness(
    page: import('@playwright/test').Page,
    scenario: string,
    options?: { hidePinnedDomRow?: boolean }
): Promise<void> {
    await page.route(`${ORIGIN}/**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/posture-analysis-report')) {
            let body = collectorShell()
                .replace(
                    "const CUSTOMER_ID = params.get('customerId') || 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';",
                    `const CUSTOMER_ID = params.get('customerId') || '${CUSTOMER_ID}';`
                )
                .replace(
                    "const scenario = params.get('scenario') || 'short17';",
                    `const scenario = params.get('scenario') || '${scenario}';`
                );
            if (options?.hidePinnedDomRow) {
                body = body.replace(
                    `data-analysis-id="${PINNED_ANALYSIS_ID}"`,
                    `data-analysis-id="${PINNED_ANALYSIS_ID}" hidden="true"`
                );
            }
            await route.fulfill({ contentType: 'text/html', body });
            return;
        }
        await route.abort();
    });
    await page.route(VERIFIED_FETCH_CUSTOMER_REPORT_URL, async (route) => {
        const rows = Array.from({ length: 16 }, (_, i) => ({
            id: `80000000-0000-4000-8000-0000000000${String(i + 11).padStart(2, '0')}`,
            analysisId: `70000000-0000-4000-8000-0000000000${String(i + 11).padStart(2, '0')}`,
            customerId: CUSTOMER_ID,
            createdAt: `2024-08-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`,
        }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    await page.goto(`${ORIGIN}${postureAnalysisFullListPathname(CUSTOMER_ID)}${navigationQuery(scenario)}`, {
        waitUntil: 'domcontentloaded',
    });
}

test('complete API absence with DOM row still visible fails verification', () => {
    const result = {
        environment: 'live-staging' as const,
        provesStagingReportState: false,
        reconciliationVerified: false,
        planId: PLAN_ID,
        plan: {
            planId: PLAN_ID,
            customerId: CUSTOMER_ID,
            analysisId: PINNED_ANALYSIS_ID,
        } as AnalysisReportDeletionPlan,
        submissionLockPresent: false,
        apiCatalog: 'complete' as const,
        historyCatalog: 'complete' as const,
        rowCount: 16,
        pinnedRowPresent: 'no' as const,
        pinnedStillOldestMeasured: 'no' as const,
        domRowCheck: 'unknown' as const,
        routeVerification: 'passed' as const,
        listReadiness: 'passed' as const,
        notes: ['DOM absence check failed: pinned analysis row still visible.'],
    };
    const verdict = evaluateReconciliationVerification(result);
    expect(verdict.passed).toBe(false);
    expect(verdict.summary).toMatch(/DOM row check/);
});

test('incomplete API catalog fails verification without wiping partial counts', async ({ page }) => {
    await installReconcileHarness(page, 'noFetch');
    const result = await reconcilePinnedDeletionPlanOnPage(page, ORIGIN, PLAN_ID, null);
    expect(result.apiCatalog).toBe('unknown');
    expect(result.historyCatalog).toBe('unknown');
    expect(result.rowCount).toBeNull();
    expect(result.provesStagingReportState).toBe(false);
    expect(evaluateReconciliationVerification(result).passed).toBe(false);
});

test('route verification timeout keeps API catalog fields on the result', () => {
    const result = {
        environment: 'live-staging' as const,
        provesStagingReportState: false,
        reconciliationVerified: false,
        planId: PLAN_ID,
        plan: { planId: PLAN_ID, customerId: CUSTOMER_ID, analysisId: PINNED_ANALYSIS_ID } as AnalysisReportDeletionPlan,
        submissionLockPresent: true,
        apiCatalog: 'complete' as const,
        historyCatalog: 'complete' as const,
        rowCount: 16,
        pinnedRowPresent: 'no' as const,
        pinnedStillOldestMeasured: 'no' as const,
        domRowCheck: 'skipped' as const,
        routeVerification: 'timeout' as const,
        listReadiness: 'skipped' as const,
        notes: ['Route verification timeout: analysis full-list route ...'],
    };
    expect(result.rowCount).toBe(16);
    expect(result.pinnedRowPresent).toBe('no');
    expect(evaluateReconciliationVerification(result).passed).toBe(false);
});

test('route verification failure preserves complete API evidence', async ({ page }) => {
    await installReconcileHarness(page, 'short17');
    const result = await reconcilePinnedDeletionPlanOnPage(page, ORIGIN, PLAN_ID, null, {
        routeVerificationAppOrigin: 'https://app-stg.epose.com',
    });
    expect(result.apiCatalog).toBe('complete');
    expect(result.rowCount).toBe(16);
    expect(result.pinnedRowPresent).toBe('no');
    expect(result.routeVerification).toBe('failed');
    expect(result.listReadiness).toBe('skipped');
    expect(result.domRowCheck).toBe('skipped');
    expect(result.provesStagingReportState).toBe(false);
    expect(result.reconciliationVerified).toBe(false);
    expect(evaluateReconciliationVerification(result).passed).toBe(false);
});
