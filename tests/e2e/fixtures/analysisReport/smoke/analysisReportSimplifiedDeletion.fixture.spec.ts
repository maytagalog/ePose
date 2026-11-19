import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { AnalysisReportDeletionStageTracker } from '../../../../analysisReport/reportDeletion/analysisReportDeletionStageTracker';
import {
    reportCombinedSimplifiedCancelPassed,
    reportCombinedSimplifiedDeleteOncePassed,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionReporting';
import {
    ANALYSIS_REPORT_DELETION_PLANS_FILENAME,
    acquireDeletionSubmissionLock,
    createDeletionPlan,
    loadDeletionPlan,
    persistDeletionSubmissionIntent,
    releaseDeletionSubmissionLock,
    type AnalysisReportDeletionPlan,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';
import { ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID } from '../../../../analysisReport/reportDeletion/analysisReportDeletionFixtureContracts';
import {
    COMBINED_SIMPLIFIED_DELETION_COVERAGE,
    executeAnalysisReportSimplifiedDeletionCancelFlow,
    executeAnalysisReportSimplifiedDeletionOnceFlow,
    openPinnedHistoryOrderNewestReport,
} from '../../../../analysisReport/smoke/analysisReportSimplifiedDeletionFlow';
import { runCombinedEmbeddedDeleteOncePhase } from '../../../../analysisReport/smoke/analysisReportFullDeletionPhase';
import { historyOrderPinToDeletionSelection } from '../../../../analysisReport/smoke/analysisReportCombinedHistoryOrderSelection';
import { resolveAnalysisReportFullSmokeConfig } from '../../../../analysisReport/smoke/analysisReportFullSmokeConfig';
import {
    ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN,
    installAnalysisReportDeletionFixtureShell,
} from '../reportDeletion/analysisReportDeletionFixtureShell';
import { assertHistoryOrderNewestRowMatchesPin } from '../../../../analysisReport/reportHistory/analysisReportHistoryNewestFirstPin';
import { gotoCustomerReportHistoryList } from '../../../../analysisReport/reportDeletion/analysisReportDeletionNavigation';
import { VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH } from '../../../../analysisReport/reportDeletion/analysisReportStagingContracts';

const ORIGIN = ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID;
/** Newest-first row in default deletion shell (reversed catalog). */
const NEWEST_ANALYSIS_ID = '33333333-3333-4333-8333-333333333333';
const WRONG_CUSTOMER_LANDING = '99999999-9999-4999-8999-999999999999';
const STAGING_PLAN_ID = '0bc2a4e7-db7a-4fe4-a067-ad3a3466cb60';
const STAGING_CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';

let stateDir = '';

function seedStagingCancelVerifiedPlan(): void {
    const plan: AnalysisReportDeletionPlan = {
        planId: STAGING_PLAN_ID,
        createdAt: '2026-11-13T13:39:34.837Z',
        appOrigin: 'https://app-stg.epose.com',
        customerId: STAGING_CUSTOMER_ID,
        analysisId: 'ca31a6cb-548b-4f32-a409-53cf4e38ce5b',
        measuredAtIso: '2025-11-19T09:58:35.000Z',
        measuredAtDisplay: '2025-11-19',
        listCreatedAtIso: '2025-11-19T09:58:35.000Z',
        accountId: 'fixture-account',
        deleteRequestId: 'ca31a6cb-548b-4f32-a409-53cf4e38ce5b',
        rowCountAtSelection: 16,
        lifecycle: 'cancel_verified',
        cancelVerifiedAt: '2026-11-13T13:41:11.706Z',
        reservedAt: null,
        submittedAt: null,
        completedAt: null,
        lastError: null,
        chronologyBasis: 'history-order-newest-first',
    };
    writeFileSync(
        path.join(stateDir, ANALYSIS_REPORT_DELETION_PLANS_FILENAME),
        JSON.stringify({ schemaVersion: 1, plans: { [STAGING_PLAN_ID]: plan } }, null, 2),
        'utf8'
    );
}

async function gotoHistory(page: import('@playwright/test').Page, shellFlags?: Parameters<typeof installAnalysisReportDeletionFixtureShell>[1]): Promise<void> {
    await installAnalysisReportDeletionFixtureShell(page, shellFlags);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
}

function fixtureDeletionPlan(): AnalysisReportDeletionPlan {
    const selection = historyOrderPinToDeletionSelection({
        customerId: CUSTOMER_ID,
        analysisId: NEWEST_ANALYSIS_ID,
        listCreatedAtIso: '2022-12-01T08:00:00.000Z',
        accountId: ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
        rowCount: 3,
        catalogComplete: true,
        firstPageSortType: 'DESC',
        chronologyBasis: 'history-order-newest-first',
        selectionIndex: 0,
    });
    return createDeletionPlan(ORIGIN, selection);
}

test('simplified deletion coverage label is fixed', () => {
    expect(COMBINED_SIMPLIFIED_DELETION_COVERAGE).toBe('ui-confirmation-and-customer-list-redirect');
});

test('simplified delete-once pass ignores api and absence stages', () => {
    const tracker = new AnalysisReportDeletionStageTracker();
    tracker.pass('cancellationVerification');
    tracker.pass('deletionSubmission');
    tracker.pass('successUiNavigation');
    tracker.skip('apiResult');
    tracker.skip('freshHistoryAbsenceVerification');
    expect(reportCombinedSimplifiedDeleteOncePassed(tracker)).toBe(true);
    expect(tracker.outcome('apiResult')).toBe('Skipped');
});

test('simplified cancel pass does not require delete submission', () => {
    const tracker = new AnalysisReportDeletionStageTracker();
    tracker.pass('cancellationVerification');
    expect(reportCombinedSimplifiedCancelPassed(tracker)).toBe(true);
    expect(reportCombinedSimplifiedDeleteOncePassed(tracker)).toBe(false);
});

test.describe('browser: simplified combined deletion helpers', () => {
    test.beforeEach(() => {
        stateDir = mkdtempSync(path.join(tmpdir(), 'simplified-deletion-browser-'));
        process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
    });

    test.afterEach(() => {
        delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
        if (stateDir) {
            rmSync(stateDir, { recursive: true, force: true });
        }
    });

    test('history → pin → cancel → confirm once → /customers list', async ({ page, browser }, testInfo) => {
        test.setTimeout(120000);
        await gotoHistory(page, { deleteLandsOnCustomerPage: true });
        const plan = fixtureDeletionPlan();
        const { primaryError, evidence } = await runCombinedEmbeddedDeleteOncePhase({
            page,
            browser,
            testInfo,
            appOrigin: ORIGIN,
            plan,
            account: { email: 'fixture@test.local', password: 'x' },
        });
        expect(primaryError).toBeNull();
        expect(evidence.actualDeletionReported).toBe(true);
        expect(evidence.deletionCoverage).toBe('ui-confirmation-and-customer-list-redirect');
        await expect(page).toHaveURL(new RegExp(`${VERIFIED_DELETE_SUCCESS_NAVIGATION_PATH}/?$`));
        const finalPlan = loadDeletionPlan(plan.planId);
        expect(finalPlan.lifecycle).toBe('completed');
        expect(finalPlan.submittedAt).toBeTruthy();
    });

    test('mismatched newest-row pin fails before confirm', async ({ page }) => {
        await gotoHistory(page, { deleteLandsOnCustomerPage: true });
        const plan = {
            ...fixtureDeletionPlan(),
            analysisId: '22222222-2222-4222-8222-222222222222',
            deleteRequestId: '22222222-2222-4222-8222-222222222222',
        };
        await expect(assertHistoryOrderNewestRowMatchesPin(page, CUSTOMER_ID, plan.analysisId)).rejects.toThrow(
            /no substitution/
        );
        await expect(
            openPinnedHistoryOrderNewestReport(page, ORIGIN, plan)
        ).rejects.toThrow(/no substitution/);
    });

    test('incorrect landing pathname fails before customer-list contract', async ({ page }) => {
        await gotoHistory(page, {
            deleteLandsOnCustomerPage: true,
            wrongDeleteLandingCustomerId: WRONG_CUSTOMER_LANDING,
        });
        const plan = fixtureDeletionPlan();
        await openPinnedHistoryOrderNewestReport(page, ORIGIN, plan);
        await executeAnalysisReportSimplifiedDeletionCancelFlow(page, plan);
        await gotoCustomerReportHistoryList(page, ORIGIN, CUSTOMER_ID);
        await openPinnedHistoryOrderNewestReport(page, ORIGIN, plan);
        await expect(executeAnalysisReportSimplifiedDeletionOnceFlow(page, ORIGIN, plan)).rejects.toThrow(
            /expected pathname \/customers/
        );
    });

    test('submission intent is persisted before confirm navigation', async ({ page }) => {
        await gotoHistory(page, { deleteLandsOnCustomerPage: true });
        const plan = fixtureDeletionPlan();
        await openPinnedHistoryOrderNewestReport(page, ORIGIN, plan);
        await executeAnalysisReportSimplifiedDeletionCancelFlow(page, plan);
        await gotoCustomerReportHistoryList(page, ORIGIN, CUSTOMER_ID);
        await openPinnedHistoryOrderNewestReport(page, ORIGIN, plan);
        acquireDeletionSubmissionLock(plan.planId);
        let submittedAtBeforeNavigation: string | null = null;
        try {
            await executeAnalysisReportSimplifiedDeletionOnceFlow(page, ORIGIN, plan, {
                onBeforeDestructiveSubmit: () => {
                    const updated = persistDeletionSubmissionIntent(plan.planId);
                    submittedAtBeforeNavigation = updated.submittedAt;
                },
            });
        } finally {
            try {
                releaseDeletionSubmissionLock();
            } catch {
                /* lock may already be released after completed flow */
            }
        }
        expect(submittedAtBeforeNavigation).toBeTruthy();
        expect(loadDeletionPlan(plan.planId).submittedAt).toBe(submittedAtBeforeNavigation);
    });
});

test.describe('ledger/config', () => {
    test.beforeEach(() => {
        stateDir = mkdtempSync(path.join(tmpdir(), 'simplified-deletion-config-'));
        process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
        process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID = STAGING_CUSTOMER_ID;
        process.env.ANALYSIS_REPORT_DELETION_MODE = 'delete-once';
        process.env.ANALYSIS_REPORT_DELETION_PLAN_ID = STAGING_PLAN_ID;
    });

    test.afterEach(() => {
        delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
        delete process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID;
        delete process.env.ANALYSIS_REPORT_DELETION_MODE;
        delete process.env.ANALYSIS_REPORT_DELETION_PLAN_ID;
        if (stateDir) {
            rmSync(stateDir, { recursive: true, force: true });
        }
    });

    test('external cancel_verified plan resolves for simplified combined delete-once', () => {
        seedStagingCancelVerifiedPlan();
        const config = resolveAnalysisReportFullSmokeConfig('https://app-stg.epose.com');
        expect(config.embeddedDeletionPlan).toBe(false);
        expect(config.deletionPlanId).toBe(STAGING_PLAN_ID);
        expect(loadDeletionPlan(STAGING_PLAN_ID).lifecycle).toBe('cancel_verified');
    });
});

test('CIRS handoff env flag is in-run only (no cross-test session transfer)', () => {
    expect(process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST).toBeUndefined();
    process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST = '1';
    expect(process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST).toBe('1');
    delete process.env.ANALYSIS_REPORT_FULL_START_ON_CIRS_LIST;
    // Flag only affects preflight/orchestrator reads within the same Playwright test Page; it does not carry cookies/storage across runs.
});
