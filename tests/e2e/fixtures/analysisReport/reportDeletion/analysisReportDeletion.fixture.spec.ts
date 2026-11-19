import { test, expect } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    selectOldestCustomerHistoryReport,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionOldestSelection';
import {
    analysisReportDeletionStateDir,
    ANALYSIS_REPORT_DELETION_LOCK_FILENAME,
    loadDeletionPlan,
    updateDeletionPlan,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';
import {
    runAnalysisReportDeletionFromCustomerHistory,
    runAnalysisReportDeletionStandalone,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionRunOrchestrator';
import type { AnalysisReportDeletionRunConfig } from '../../../../analysisReport/reportDeletion/analysisReportDeletionConfig';
import { collectFixtureCustomerHistoryRows } from '../../../../analysisReport/reportDeletion/analysisReportDeletionHistoryCatalog.fixture';
import { loadCustomerHistoryCatalogFromNetwork } from '../../../../analysisReport/reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID } from '../../../../analysisReport/reportDeletion/analysisReportDeletionFixtureContracts';
import {
    ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID,
    ANALYSIS_REPORT_DELETION_FIXTURE_OLDEST_ANALYSIS_ID,
    ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN,
    installAnalysisReportDeletionFixtureShell,
} from './analysisReportDeletionFixtureShell';

const ORIGIN = ANALYSIS_REPORT_DELETION_FIXTURE_ORIGIN;
const CUSTOMER_ID = ANALYSIS_REPORT_DELETION_FIXTURE_CUSTOMER_ID;

let stateDir = '';

test.beforeEach(() => {
    stateDir = mkdtempSync(path.join(tmpdir(), 'analysis-report-deletion-'));
    process.env.ANALYSIS_REPORT_DELETION_STATE_DIR = stateDir;
});

test.afterEach(() => {
    delete process.env.ANALYSIS_REPORT_DELETION_STATE_DIR;
    delete process.env.ANALYSIS_REPORT_DELETION_MODE;
    delete process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID;
    delete process.env.ANALYSIS_REPORT_DELETION_PLAN_ID;
    if (stateDir) {
        rmSync(stateDir, { recursive: true, force: true });
    }
});

async function gotoHistory(page: import('@playwright/test').Page): Promise<void> {
    await installAnalysisReportDeletionFixtureShell(page);
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
}

test('off mode skips login and mutation', async ({ page, browser }, testInfo) => {
    const config: AnalysisReportDeletionRunConfig = {
        mode: 'off',
        customerId: null,
        planId: null,
        appOrigin: ORIGIN,
        tieBreakAnalysisId: null,
        deleteApiUrl: null,
    };
    const { evidence, primaryError } = await runAnalysisReportDeletionStandalone({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config,
    });
    expect(primaryError).toBeNull();
    expect(evidence.stages.login).toBe('Skipped');
    expect(evidence.actualDeletionReported).toBe(false);
});

test('oldest selection reuses an already captured catalog', async ({ page }) => {
    await gotoHistory(page);
    const catalog = await loadCustomerHistoryCatalogFromNetwork(page, ORIGIN, CUSTOMER_ID, { reload: false });
    const selection = await selectOldestCustomerHistoryReport(
        page,
        ORIGIN,
        CUSTOMER_ID,
        ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
        null,
        { catalog }
    );
    expect(selection.analysisId).toBe(ANALYSIS_REPORT_DELETION_FIXTURE_OLDEST_ANALYSIS_ID);
});

test('oldest selection uses measuredAt not display order', async ({ page }) => {
    await gotoHistory(page);
    const selection = await selectOldestCustomerHistoryReport(
        page,
        ORIGIN,
        CUSTOMER_ID,
        ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
        null
    );
    expect(selection.analysisId).toBe(ANALYSIS_REPORT_DELETION_FIXTURE_OLDEST_ANALYSIS_ID);
});

test('tied earliest dates require explicit tie-break', async ({ page }) => {
    await installAnalysisReportDeletionFixtureShell(page, { tiedOldest: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    await expect(
        selectOldestCustomerHistoryReport(
            page,
            ORIGIN,
            CUSTOMER_ID,
            ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
            null
        )
    ).rejects.toThrow(/tied across/i);
});

test('protected oldest target rejects without substitution', async ({ page }) => {
    await installAnalysisReportDeletionFixtureShell(page, { protectedOldest: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    await expect(
        selectOldestCustomerHistoryReport(
            page,
            ORIGIN,
            CUSTOMER_ID,
            ANALYSIS_REPORT_DELETION_FIXTURE_ACCOUNT_ID,
            null
        )
    ).rejects.toThrow(/protected/);
});

test('missing row measured-at blocks catalog', async ({ page }) => {
    await installAnalysisReportDeletionFixtureShell(page, { omitMeasuredAt: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    await expect(collectFixtureCustomerHistoryRows(page, CUSTOMER_ID)).rejects.toThrow(/data-measured-at/);
});

test('cancel-only pins plan; delete-once reuses it', async ({ page, browser }, testInfo) => {
    test.setTimeout(120000);
    await gotoHistory(page);
    const cancelConfig: AnalysisReportDeletionRunConfig = {
        mode: 'cancel',
        customerId: CUSTOMER_ID,
        planId: null,
        appOrigin: ORIGIN,
        tieBreakAnalysisId: null,
        deleteApiUrl: null,
    };
    const cancelRun = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: cancelConfig,
    });
    expect(cancelRun.primaryError).toBeNull();
    expect(cancelRun.evidence.plan).not.toBeNull();
    expect(cancelRun.evidence.plan!.lifecycle).toBe('cancel_verified');
    expect(cancelRun.evidence.actualDeletionReported).toBe(false);

    const planId = cancelRun.evidence.plan!.planId;
    const deleteConfig: AnalysisReportDeletionRunConfig = {
        mode: 'delete-once',
        customerId: CUSTOMER_ID,
        planId,
        appOrigin: ORIGIN,
        tieBreakAnalysisId: null,
        deleteApiUrl: null,
    };
    await gotoHistory(page);
    const deleteRun = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: deleteConfig,
    });
    expect(deleteRun.primaryError).toBeNull();
    expect(deleteRun.evidence.actualDeletionReported).toBe(true);
    const finalPlan = loadDeletionPlan(planId);
    expect(finalPlan.lifecycle).toBe('completed');
});

test('completed plan blocks another delete-once submission', async ({ page, browser }, testInfo) => {
    test.setTimeout(120000);
    await gotoHistory(page);
    const planId = (
        await runAnalysisReportDeletionFromCustomerHistory({
            page,
            browser,
            testInfo,
            appOrigin: ORIGIN,
            config: {
                mode: 'cancel',
                customerId: CUSTOMER_ID,
                planId: null,
                appOrigin: ORIGIN,
                tieBreakAnalysisId: null,
                deleteApiUrl: null,
            },
        })
    ).evidence.plan!.planId;

    await gotoHistory(page);
    await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'delete-once',
            customerId: CUSTOMER_ID,
            planId,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });

    updateDeletionPlan(planId, { lifecycle: 'completed' });
    await gotoHistory(page);
    const blocked = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'delete-once',
            customerId: CUSTOMER_ID,
            planId,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });
    expect(blocked.primaryError).toBeTruthy();
});

test('API failure does not report actual deletion passed', async ({ page, browser }, testInfo) => {
    await installAnalysisReportDeletionFixtureShell(page, { failDeleteApi: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    const cancel = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'cancel',
            customerId: CUSTOMER_ID,
            planId: null,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });
    const planId = cancel.evidence.plan!.planId;
    await installAnalysisReportDeletionFixtureShell(page, { failDeleteApi: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    const failed = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'delete-once',
            customerId: CUSTOMER_ID,
            planId,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });
    expect(failed.primaryError).toBeTruthy();
    expect(failed.evidence.actualDeletionReported).toBe(false);
    expect(failed.evidence.stages.apiResult).not.toBe('Passed');
    const finalPlan = loadDeletionPlan(planId);
    expect(['uncertain', 'submitted']).toContain(finalPlan.lifecycle);
    expect(existsSync(path.join(analysisReportDeletionStateDir(), ANALYSIS_REPORT_DELETION_LOCK_FILENAME))).toBe(
        true
    );
});

test('stalled delete response after confirm remains uncertain with lock', async ({ page, browser }, testInfo) => {
    test.setTimeout(120000);
    await installAnalysisReportDeletionFixtureShell(page, { stallDeleteResponse: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    const cancel = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'cancel',
            customerId: CUSTOMER_ID,
            planId: null,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });
    const planId = cancel.evidence.plan!.planId;
    await installAnalysisReportDeletionFixtureShell(page, { stallDeleteResponse: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    const failed = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'delete-once',
            customerId: CUSTOMER_ID,
            planId,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });
    expect(failed.primaryError).toBeTruthy();
    expect(failed.evidence.actualDeletionReported).toBe(false);
    expect(failed.evidence.stages.apiResult).not.toBe('Passed');
    const finalPlan = loadDeletionPlan(planId);
    expect(['uncertain', 'submitted']).toContain(finalPlan.lifecycle);
    expect(existsSync(path.join(analysisReportDeletionStateDir(), ANALYSIS_REPORT_DELETION_LOCK_FILENAME))).toBe(
        true
    );
});

test('success response with row still present fails verification', async ({ page, browser }, testInfo) => {
    test.setTimeout(120000);
    await installAnalysisReportDeletionFixtureShell(page, { surviveAfterDelete: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    const cancel = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'cancel',
            customerId: CUSTOMER_ID,
            planId: null,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });
    const planId = cancel.evidence.plan!.planId;
    await installAnalysisReportDeletionFixtureShell(page, { surviveAfterDelete: true });
    await page.goto(`${ORIGIN}/customers/${CUSTOMER_ID}/posture-analysis-report`);
    const failed = await runAnalysisReportDeletionFromCustomerHistory({
        page,
        browser,
        testInfo,
        appOrigin: ORIGIN,
        config: {
            mode: 'delete-once',
            customerId: CUSTOMER_ID,
            planId,
            appOrigin: ORIGIN,
            tieBreakAnalysisId: null,
            deleteApiUrl: null,
        },
    });
    expect(failed.primaryError).toBeTruthy();
    expect(failed.evidence.actualDeletionReported).toBe(false);
});
