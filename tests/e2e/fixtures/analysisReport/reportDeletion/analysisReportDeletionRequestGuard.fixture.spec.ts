import { test, expect } from '@playwright/test';
import {
    AnalysisReportDeleteRequestGuardInstallError,
    beginAnalysisReportDeleteRequestGuard,
    beginAnalysisReportDeleteResponseCapture,
    assertDeleteResponseSuccess,
    resolveDeleteRequestRoutePattern,
} from '../../../../analysisReport/reportDeletion/analysisReportDeletionRequest';
import { executeAnalysisReportDeletionOnce } from '../../../../analysisReport/reportDeletion/analysisReportDeletionFlow';
import { VERIFIED_DELETE_REPORT_URL } from '../../../../analysisReport/reportDeletion/analysisReportStagingContracts';
import type { AnalysisReportDeletionPlan } from '../../../../analysisReport/reportDeletion/analysisReportDeletionPlanLedger';

const GUARD_ORIGIN = 'https://delete-guard.test';
const DELETE_URL = `${GUARD_ORIGIN}/delete_report`;
const ACCOUNT_ID = 'fixture-account-id';
const CUSTOMER_ID = 'ce3f36fd-07c3-4eda-ad87-35631acc39cc';
const ANALYSIS_ID = '25190ae1-f5e3-40a8-b284-5a84caefaf35';

function pinnedPlan(): AnalysisReportDeletionPlan {
    return {
        planId: 'guard-test-plan',
        createdAt: new Date().toISOString(),
        appOrigin: GUARD_ORIGIN,
        customerId: CUSTOMER_ID,
        analysisId: ANALYSIS_ID,
        measuredAtIso: '2024-01-01T00:00:00.000Z',
        measuredAtDisplay: '2024.01.01',
        listCreatedAtIso: '2024-01-01T00:00:00.000Z',
        accountId: ACCOUNT_ID,
        deleteRequestId: ANALYSIS_ID,
        rowCountAtSelection: 1,
        lifecycle: 'reserved',
        cancelVerifiedAt: null,
        reservedAt: null,
        submittedAt: null,
        completedAt: null,
        lastError: null,
    };
}

async function installSameOriginDeleteBackend(
    page: import('@playwright/test').Page,
    onHit?: () => void
): Promise<void> {
    await page.route(`${GUARD_ORIGIN}/**`, async (route) => {
        const request = route.request();
        if (request.method() === 'POST' && request.url().endsWith('/delete_report')) {
            onHit?.();
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    });
}

async function postDelete(
    page: import('@playwright/test').Page,
    body: { accountId: string; id: string }
): Promise<{ ok: boolean }> {
    return page.evaluate(
        async ({ url, payload }) => {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                return { ok: response.ok };
            } catch {
                return { ok: false };
            }
        },
        { url: DELETE_URL, payload: body }
    );
}

test('bounded install failure rejects; late route cannot delete', async ({ page }) => {
    test.setTimeout(15000);
    const plan = pinnedPlan();
    let serverHits = 0;
    await installSameOriginDeleteBackend(page, () => {
        serverHits += 1;
    });
    await page.goto(GUARD_ORIGIN);

    const routePattern = resolveDeleteRequestRoutePattern(DELETE_URL);
    let releaseGuardInstall: (() => void) | undefined;
    const guardInstallGate = new Promise<void>((resolve) => {
        releaseGuardInstall = resolve;
    });
    const realRoute = page.route.bind(page);
    page.route = async (pattern, handler) => {
        if (pattern === routePattern) {
            await guardInstallGate;
        }
        return realRoute(pattern, handler);
    };

    const previousInstallTimeout = process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS;
    process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS = '300';
    await expect(beginAnalysisReportDeleteRequestGuard(page, plan, DELETE_URL)).rejects.toBeInstanceOf(
        AnalysisReportDeleteRequestGuardInstallError
    );
    if (previousInstallTimeout === undefined) {
        delete process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS;
    } else {
        process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS = previousInstallTimeout;
    }

    releaseGuardInstall?.();
    await page.waitForTimeout(100);
    const result = await postDelete(page, { accountId: ACCOUNT_ID, id: ANALYSIS_ID });
    expect(result.ok).toBe(false);
    expect(serverHits).toBe(0);
    await page.unroute(routePattern);
});

test('delete-once aborts before destructive stages when guard install fails', async ({ page }) => {
    test.setTimeout(15000);
    const plan = pinnedPlan();
    await installSameOriginDeleteBackend(page);
    await page.goto(GUARD_ORIGIN);

    const routePattern = resolveDeleteRequestRoutePattern(DELETE_URL);
    const realRoute = page.route.bind(page);
    page.route = async (pattern, handler) => {
        if (pattern === routePattern) {
            return new Promise(() => {
                /* stall guard install */
            });
        }
        return realRoute(pattern, handler);
    };
    const previousInstallTimeout = process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS;
    process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS = '200';

    await expect(
        executeAnalysisReportDeletionOnce(page, GUARD_ORIGIN, plan, DELETE_URL)
    ).rejects.toBeInstanceOf(AnalysisReportDeleteRequestGuardInstallError);

    if (previousInstallTimeout === undefined) {
        delete process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS;
    } else {
        process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS = previousInstallTimeout;
    }
});

test('staging-like stack: guard install completes with diagnostics', async ({ page }) => {
    const plan = pinnedPlan();
    const onRequest = (): void => {
        /* mirrors CustomerHistoryNetworkCaptureSession listeners */
    };
    const onResponse = (): void => {
        /* mirrors CustomerHistoryNetworkCaptureSession listeners */
    };
    page.on('request', onRequest);
    page.on('response', onResponse);
    await page.route('https://api-stg.epose.com/**', async (route) => {
        await route.fallback();
    });
    await page.goto('about:blank');

    const installStarted = Date.now();
    const guard = await beginAnalysisReportDeleteRequestGuard(page, plan, VERIFIED_DELETE_REPORT_URL);
    const diagnostics = guard.installDiagnostics();

    expect(diagnostics.outcome).toBe('installed');
    expect(diagnostics.routePattern).toBe(resolveDeleteRequestRoutePattern(VERIFIED_DELETE_REPORT_URL));
    expect(diagnostics.durationMs).not.toBeNull();
    expect(diagnostics.durationMs!).toBeLessThan(5000);
    expect(Date.now() - installStarted).toBeLessThan(5000);

    page.off('request', onRequest);
    page.off('response', onResponse);
    await guard.dispose();
});

test('submission intent persisted before click still permits request #1', async ({ page }) => {
    const plan = pinnedPlan();
    let serverHits = 0;
    await installSameOriginDeleteBackend(page, () => {
        serverHits += 1;
    });
    await page.goto(GUARD_ORIGIN);
    const guard = await beginAnalysisReportDeleteRequestGuard(page, plan, DELETE_URL);
    try {
        await postDelete(page, { accountId: ACCOUNT_ID, id: ANALYSIS_ID });
        await guard.awaitFirstAllowedDeleteRequest();
        expect(serverHits).toBe(1);
    } finally {
        await guard.dispose();
    }
});

test('request #2 is aborted before reaching the server', async ({ page }) => {
    const plan = pinnedPlan();
    let serverHits = 0;
    await installSameOriginDeleteBackend(page, () => {
        serverHits += 1;
    });
    await page.goto(GUARD_ORIGIN);
    const guard = await beginAnalysisReportDeleteRequestGuard(page, plan, DELETE_URL);
    try {
        await postDelete(page, { accountId: ACCOUNT_ID, id: ANALYSIS_ID });
        await guard.awaitFirstAllowedDeleteRequest();
        await postDelete(page, { accountId: ACCOUNT_ID, id: ANALYSIS_ID });
        await page.waitForTimeout(300);
        expect(serverHits).toBe(1);
        const violation = guard.consumeViolation();
        expect(violation?.message).toMatch(/Duplicate/);
    } finally {
        await guard.dispose();
    }
});

test('wrong-target request is aborted', async ({ page }) => {
    const plan = pinnedPlan();
    let serverHits = 0;
    await installSameOriginDeleteBackend(page, () => {
        serverHits += 1;
    });
    await page.goto(GUARD_ORIGIN);
    const guard = await beginAnalysisReportDeleteRequestGuard(page, plan, DELETE_URL);
    try {
        await postDelete(page, { accountId: ACCOUNT_ID, id: '00000000-0000-4000-8000-000000000099' });
        await page.waitForTimeout(300);
        expect(serverHits).toBe(0);
        await expect(guard.awaitFirstAllowedDeleteRequest()).rejects.toThrow(/deleteRequestId/);
        expect(guard.consumeViolation()?.message).toMatch(/deleteRequestId/);
    } finally {
        await guard.dispose();
    }
});

test('missing response cannot produce apiResult Passed', async ({ page }) => {
    test.setTimeout(60000);
    const plan = pinnedPlan();
    await page.route(`${GUARD_ORIGIN}/**`, async (route) => {
        const request = route.request();
        if (request.method() === 'POST' && request.url().endsWith('/delete_report')) {
            await route.abort('failed');
            return;
        }
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    });
    await page.goto(GUARD_ORIGIN);
    const guard = await beginAnalysisReportDeleteRequestGuard(page, plan, DELETE_URL);
    const responsePromise = beginAnalysisReportDeleteResponseCapture(page, plan, DELETE_URL, {
        timeoutMs: 5000,
    });
    try {
        await postDelete(page, { accountId: ACCOUNT_ID, id: ANALYSIS_ID });
        await guard.awaitFirstAllowedDeleteRequest();
        await expect(responsePromise).rejects.toThrow(/Timeout/i);
        await expect(assertDeleteResponseSuccess({ status: () => -1 } as never)).rejects.toThrow(/status -1/);
    } finally {
        await guard.dispose();
    }
});

test('guard violations do not surface as unhandled request listener errors', async ({ page }) => {
    const plan = pinnedPlan();
    await installSameOriginDeleteBackend(page);
    await page.goto(GUARD_ORIGIN);
    const unhandled: unknown[] = [];
    page.on('pageerror', (error) => unhandled.push(error));
    const guard = await beginAnalysisReportDeleteRequestGuard(page, plan, DELETE_URL);
    try {
        await postDelete(page, { accountId: ACCOUNT_ID, id: ANALYSIS_ID });
        await guard.awaitFirstAllowedDeleteRequest();
        await postDelete(page, { accountId: ACCOUNT_ID, id: ANALYSIS_ID });
        await page.waitForTimeout(200);
        expect(unhandled.filter((entry) => String(entry).includes('Duplicate'))).toHaveLength(0);
        expect(guard.consumeViolation()?.message).toMatch(/Duplicate/);
    } finally {
        await guard.dispose();
    }
});
