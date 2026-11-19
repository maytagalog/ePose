import type { Page, Response, Route } from '@playwright/test';
import {
    VERIFIED_DELETE_REPORT_PATH,
    VERIFIED_DELETE_REPORT_URL,
    type VerifiedDeleteReportRequestBody,
} from './analysisReportStagingContracts';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import { assertDeleteRequestMatchesPinnedTarget } from './analysisReportDeletionAuthContext';
import type { AnalysisReportDeletionPlan } from './analysisReportDeletionPlanLedger';

export function resolveLiveDeletionRequestUrl(configuredUrl: string | null | undefined): string {
    const trimmed = configuredUrl?.trim();
    if (trimmed) {
        return trimmed;
    }
    return VERIFIED_DELETE_REPORT_URL;
}

function parseDeleteRequestBody(postData: string | null): VerifiedDeleteReportRequestBody | null {
    if (!postData) {
        return null;
    }
    try {
        const parsed = JSON.parse(postData) as VerifiedDeleteReportRequestBody;
        if (!parsed.accountId?.trim() || !parsed.id?.trim()) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function beginAnalysisReportDeleteResponseCapture(
    page: Page,
    plan: AnalysisReportDeletionPlan,
    requestUrl: string,
    options?: { timeoutMs?: number }
): Promise<Response> {
    return page.waitForResponse(
        async (response) => {
            if (response.status() === -1) {
                return false;
            }
            if (!response.url().includes(requestUrl) || response.request().method() !== 'POST') {
                return false;
            }
            const body = parseDeleteRequestBody(response.request().postData());
            if (!body) {
                return false;
            }
            try {
                assertDeleteRequestMatchesPinnedTarget(body, {
                    accountId: plan.accountId,
                    deleteRequestId: plan.deleteRequestId,
                    customerId: plan.customerId,
                });
            } catch {
                return false;
            }
            return body.id === plan.deleteRequestId;
        },
        { timeout: options?.timeoutMs ?? 30000 }
    );
}

const FIRST_DELETE_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS = 15000;
const DEFAULT_DELETE_REQUEST_GUARD_UNROUTE_TIMEOUT_MS = 5000;

type GuardInstallState = 'installing' | 'active' | 'failed' | 'disposed';

export type DeleteRequestGuardInstallDiagnostics = {
    startedAtIso: string;
    endedAtIso: string | null;
    routePattern: string;
    requestUrl: string;
    durationMs: number | null;
    outcome: 'installed' | 'timeout' | 'error';
    errorMessage: string | null;
};

export class AnalysisReportDeleteRequestGuardInstallError extends AnalysisReportDeletionFlowError {
    readonly installDiagnostics: DeleteRequestGuardInstallDiagnostics;

    constructor(message: string, installDiagnostics: DeleteRequestGuardInstallDiagnostics) {
        super(message);
        this.name = 'AnalysisReportDeleteRequestGuardInstallError';
        this.installDiagnostics = installDiagnostics;
    }
}

function resolveGuardRouteInstallTimeoutMs(): number {
    const fromEnv = process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS;
    if (fromEnv) {
        const parsed = Number(fromEnv);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_DELETE_REQUEST_GUARD_ROUTE_INSTALL_TIMEOUT_MS;
}

function resolveGuardUnrouteTimeoutMs(): number {
    const fromEnv = process.env.ANALYSIS_REPORT_DELETE_REQUEST_GUARD_UNROUTE_TIMEOUT_MS;
    if (fromEnv) {
        const parsed = Number(fromEnv);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_DELETE_REQUEST_GUARD_UNROUTE_TIMEOUT_MS;
}

async function unrouteDeleteGuardBounded(
    page: Page,
    routePattern: string,
    routeHandler: (route: Route) => Promise<void>
): Promise<void> {
    const timeoutMs = resolveGuardUnrouteTimeoutMs();
    try {
        await Promise.race([
            page.unroute(routePattern, routeHandler),
            new Promise<void>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Delete request guard unroute did not complete within ${timeoutMs}ms.`));
                }, timeoutMs);
            }),
        ]);
    } catch {
        /* best-effort bounded cleanup */
    }
}

/**
 * Playwright glob for delete_report POST interception. Pin/target checks stay in the route handler.
 * String globs are a mitigation for trace-observed route registration hangs; causation was not reproduced in isolation.
 */
export function resolveDeleteRequestRoutePattern(requestUrl: string): string {
    const trimmed = requestUrl.trim();
    if (!trimmed) {
        return `**${VERIFIED_DELETE_REPORT_PATH}`;
    }
    try {
        const pathname = new URL(trimmed).pathname;
        const segments = pathname.split('/').filter(Boolean);
        const tail = segments[segments.length - 1] ?? 'delete_report';
        return `**/*${tail}*`;
    } catch {
        return trimmed.includes('delete_report') ? '**/*delete_report*' : `**${VERIFIED_DELETE_REPORT_PATH}`;
    }
}

export type AnalysisReportDeleteRequestGuardSession = {
    awaitFirstAllowedDeleteRequest(): Promise<void>;
    consumeViolation(): AnalysisReportDeletionFlowError | null;
    installDiagnostics(): DeleteRequestGuardInstallDiagnostics;
    dispose(): Promise<void>;
};

type GuardInternals = {
    installState: GuardInstallState;
    matchingDeleteRequestsAllowed: number;
    violation: AnalysisReportDeletionFlowError | null;
    firstRequestWaiters: Array<{
        resolve: () => void;
        reject: (error: Error) => void;
    }>;
};

function recordGuardViolation(state: GuardInternals, error: AnalysisReportDeletionFlowError): void {
    if (!state.violation) {
        state.violation = error;
    }
    for (const waiter of state.firstRequestWaiters.splice(0)) {
        waiter.reject(state.violation);
    }
}

function resolveFirstRequestWaiters(state: GuardInternals): void {
    for (const waiter of state.firstRequestWaiters.splice(0)) {
        waiter.resolve();
    }
}

function matchesDeleteRequestUrl(url: URL, requestUrl: string): boolean {
    return url.href.includes(requestUrl);
}

export async function beginAnalysisReportDeleteRequestGuard(
    page: Page,
    plan: AnalysisReportDeletionPlan,
    requestUrl: string
): Promise<AnalysisReportDeleteRequestGuardSession> {
    const state: GuardInternals = {
        installState: 'installing',
        matchingDeleteRequestsAllowed: 0,
        violation: null,
        firstRequestWaiters: [],
    };

    const routePattern = resolveDeleteRequestRoutePattern(requestUrl);
    const installStartedAt = Date.now();
    const installDiagnostics: DeleteRequestGuardInstallDiagnostics = {
        startedAtIso: new Date(installStartedAt).toISOString(),
        endedAtIso: null,
        routePattern,
        requestUrl,
        durationMs: null,
        outcome: 'error',
        errorMessage: null,
    };

    const routeHandler = async (route: Route): Promise<void> => {
        const request = route.request();
        const isDeletePost =
            request.method() === 'POST' && matchesDeleteRequestUrl(new URL(request.url()), requestUrl);

        if (state.installState !== 'active') {
            if (isDeletePost) {
                await route.abort('blockedbyclient');
                return;
            }
            await route.fallback();
            return;
        }

        if (!isDeletePost) {
            await route.fallback();
            return;
        }

        const body = parseDeleteRequestBody(request.postData());
        if (!body) {
            recordGuardViolation(
                state,
                new AnalysisReportDeletionFlowError(
                    'Delete request guard blocked POST with missing or invalid JSON body.'
                )
            );
            await route.abort('blockedbyclient');
            return;
        }

        try {
            assertDeleteRequestMatchesPinnedTarget(body, {
                accountId: plan.accountId,
                deleteRequestId: plan.deleteRequestId,
                customerId: plan.customerId,
            });
        } catch (error) {
            recordGuardViolation(
                state,
                error instanceof AnalysisReportDeletionFlowError
                    ? error
                    : new AnalysisReportDeletionFlowError(
                          error instanceof Error ? error.message : 'Delete request target validation failed.'
                      )
            );
            await route.abort('blockedbyclient');
            return;
        }

        if (body.id !== plan.deleteRequestId) {
            recordGuardViolation(
                state,
                new AnalysisReportDeletionFlowError(
                    `Delete request id ${body.id} != pinned deleteRequestId ${plan.deleteRequestId}.`
                )
            );
            await route.abort('blockedbyclient');
            return;
        }

        if (state.matchingDeleteRequestsAllowed >= 1) {
            recordGuardViolation(
                state,
                new AnalysisReportDeletionFlowError(
                    'Duplicate analysis-report delete request blocked after first submission.'
                )
            );
            await route.abort('blockedbyclient');
            return;
        }

        state.matchingDeleteRequestsAllowed += 1;
        resolveFirstRequestWaiters(state);
        await route.fallback();
    };

    const installTimeoutMs = resolveGuardRouteInstallTimeoutMs();
    let routeInstallSettled = false;
    const routeInstallPromise = page.route(routePattern, routeHandler).then(() => {
        routeInstallSettled = true;
    });

    try {
        await Promise.race([
            routeInstallPromise,
            new Promise<void>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new AnalysisReportDeleteRequestGuardInstallError(
                            `Delete request guard route registration did not complete within ${installTimeoutMs}ms (pattern=${routePattern}).`,
                            installDiagnostics
                        )
                    );
                }, installTimeoutMs);
            }),
        ]);
        installDiagnostics.outcome = 'installed';
        installDiagnostics.endedAtIso = new Date().toISOString();
        installDiagnostics.durationMs = Date.now() - installStartedAt;
    } catch (error) {
        installDiagnostics.endedAtIso = new Date().toISOString();
        installDiagnostics.durationMs = Date.now() - installStartedAt;
        installDiagnostics.errorMessage =
            error instanceof Error ? error.message.slice(0, 400) : 'delete_request_guard_install_failed';
        installDiagnostics.outcome =
            error instanceof AnalysisReportDeleteRequestGuardInstallError ? 'timeout' : 'error';
        state.installState = 'failed';
        if (routeInstallSettled) {
            await unrouteDeleteGuardBounded(page, routePattern, routeHandler);
        }
        for (const waiter of state.firstRequestWaiters.splice(0)) {
            waiter.reject(
                error instanceof Error
                    ? error
                    : new AnalysisReportDeletionFlowError('Delete request guard install failed.')
            );
        }
        if (error instanceof AnalysisReportDeleteRequestGuardInstallError) {
            error.installDiagnostics.outcome = installDiagnostics.outcome;
            error.installDiagnostics.endedAtIso = installDiagnostics.endedAtIso;
            error.installDiagnostics.durationMs = installDiagnostics.durationMs;
            error.installDiagnostics.errorMessage = installDiagnostics.errorMessage;
            throw error;
        }
        throw new AnalysisReportDeleteRequestGuardInstallError(
            installDiagnostics.errorMessage ?? 'Delete request guard install failed.',
            installDiagnostics
        );
    } finally {
        if (!routeInstallSettled && installDiagnostics.outcome !== 'installed') {
            routeInstallPromise.catch(() => {
                /* late install after failure: handler stays in failed state and blocks delete POSTs */
            });
        }
    }

    state.installState = 'active';

    return {
        async awaitFirstAllowedDeleteRequest(): Promise<void> {
        if (state.violation) {
            throw state.violation;
        }
        if (state.matchingDeleteRequestsAllowed >= 1) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    const index = state.firstRequestWaiters.findIndex((entry) => entry.resolve === resolve);
                    if (index >= 0) {
                        state.firstRequestWaiters.splice(index, 1);
                    }
                    reject(
                        new AnalysisReportDeletionFlowError(
                            'Delete request guard timed out waiting for first allowed delete request.'
                        )
                    );
                }, FIRST_DELETE_REQUEST_TIMEOUT_MS);

                state.firstRequestWaiters.push({
                    resolve: () => {
                        clearTimeout(timer);
                        resolve();
                    },
                    reject: (error) => {
                        clearTimeout(timer);
                        reject(error);
                    },
                });

                if (state.matchingDeleteRequestsAllowed >= 1) {
                    clearTimeout(timer);
                    state.firstRequestWaiters.pop();
                    resolve();
                } else if (state.violation) {
                    clearTimeout(timer);
                    state.firstRequestWaiters.pop();
                    reject(state.violation);
                }
            });
            if (state.violation) {
                throw state.violation;
            }
        },

        consumeViolation(): AnalysisReportDeletionFlowError | null {
            const violation = state.violation;
            state.violation = null;
            return violation;
        },

        installDiagnostics(): DeleteRequestGuardInstallDiagnostics {
            return { ...installDiagnostics };
        },

        async dispose(): Promise<void> {
            if (state.installState === 'disposed' || state.installState === 'failed') {
                return;
            }
            state.installState = 'disposed';
            await unrouteDeleteGuardBounded(page, routePattern, routeHandler);
            const pendingViolation =
                state.violation ??
                (state.matchingDeleteRequestsAllowed > 1
                    ? new AnalysisReportDeletionFlowError(
                          'Duplicate analysis-report delete request blocked after first submission.'
                      )
                    : null);
            for (const waiter of state.firstRequestWaiters.splice(0)) {
                waiter.reject(
                    pendingViolation ??
                        new AnalysisReportDeletionFlowError('Delete request guard disposed before first request.')
                );
            }
            state.violation = pendingViolation;
        },
    };
}

/** @deprecated Use beginAnalysisReportDeleteRequestGuard; retained for compatibility in tests. */
export function installDuplicateDeleteRequestGuard(_page: Page, _requestUrl: string): void {
    throw new AnalysisReportDeletionFlowError(
        'installDuplicateDeleteRequestGuard removed; use beginAnalysisReportDeleteRequestGuard.'
    );
}

/** @deprecated Persistent submission intent is ledger-only via persistDeletionSubmissionIntent. */
export function markDeleteRequestSubmitted(_page: Page): void {
    /* no-op — submission intent is not coupled to in-page request counting */
}

/**
 * Mirrors useDeleteReport onSuccess: truthy mutation result `.data` (= HTTP response body from postHTTP).
 * Does not require a nested JSON `.data` property unless the HTTP body itself is structured that way.
 */
export async function assertDeleteResponseSuccess(response: Response): Promise<void> {
    if (response.status() === -1) {
        throw new AnalysisReportDeletionFlowError(
            'Delete API response did not complete (transport status -1); cannot prove deletion success.'
        );
    }
    const status = response.status();
    if (status < 200 || status >= 300) {
        const body = await response.text().catch(() => '');
        throw new AnalysisReportDeletionFlowError(
            `Delete API failed status=${status} body=${body.slice(0, 200)}`
        );
    }
    const text = (await response.text()).trim();
    if (!text) {
        throw new AnalysisReportDeletionFlowError(
            'Delete API returned empty body; staging onSuccess requires truthy repository `data`.'
        );
    }
    try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed === null || parsed === false) {
            throw new AnalysisReportDeletionFlowError(
                'Delete API JSON body is falsy; staging onSuccess checks truthy repository `data`.'
            );
        }
    } catch (error) {
        if (error instanceof AnalysisReportDeletionFlowError) {
            throw error;
        }
        if (!text) {
            throw new AnalysisReportDeletionFlowError('Delete API body falsy after non-JSON response.');
        }
    }
}
