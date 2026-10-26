import { type Page, type Response } from '@playwright/test';

const CUSTOMER_SERVICE_ID_BODY =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CirsRecordCustomerServicesError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CirsRecordCustomerServicesError';
    }
}

/** Trace: GET …/fetch_customer_services?…&customerId={uuid}&orderBy=desc&limit=3 */
export const FETCH_CUSTOMER_SERVICES_URL =
    'https://api-stg.epose.com/customer_interaction_record/fetch_customer_services';

export const FETCH_CUSTOMER_SERVICES_PATH = '/customer_interaction_record/fetch_customer_services';

/**
 * Trace evidence for list ordering (Desktop/untitled folder/trace.zip network, customer detail fetch):
 * - Query includes `customerId`, `orderBy=desc`, and `limit=3` on customer preview.
 * - No ePose frontend bundle in this repo maps API array index → DOM row index.
 */
export const FETCH_CUSTOMER_SERVICES_ORDER_EVIDENCE = {
    traceQueryParams: ['customerId=', 'orderBy=desc', 'limit=3'] as const,
    apiResponseOrderMeaning: 'desc query param suggests newest-first JSON array order',
    uiRenderOrderMapping: 'unresolved_no_frontend_source_in_repo',
    countMatchDoesNotProveOrder: true as const,
} as const;

export type FetchCustomerServicesEntry = {
    customerServiceId: string;
    numericId: number | null;
    createdAt: string | null;
};

export type CustomerServicesListSnapshot = {
    customerServiceIdsInApiOrder: string[];
    entries: FetchCustomerServicesEntry[];
    /** Request URL that produced this snapshot (for failure attachments). */
    requestUrl: string;
};

export function parseFetchRequestCustomerId(requestUrl: string): string | null {
    try {
        return new URL(requestUrl).searchParams.get('customerId');
    } catch {
        return null;
    }
}

export function isFetchCustomerServicesRequestUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}` === FETCH_CUSTOMER_SERVICES_URL;
    } catch {
        return false;
    }
}

/** Customer detail preview uses limit=3 (trace). Full-list query shape is unverified in repo. */
export type FetchCustomerServicesCaptureKind = 'customer_preview' | 'full_list' | 'any';

export function requestMatchesFetchCaptureKind(
    requestUrl: string,
    kind: FetchCustomerServicesCaptureKind
): boolean {
    if (kind === 'any') {
        return true;
    }
    let limit: string | null = null;
    try {
        limit = new URL(requestUrl).searchParams.get('limit');
    } catch {
        return false;
    }
    if (kind === 'customer_preview') {
        return limit === '3';
    }
    // Full-list page may use a different limit or omit it — only exclude the known preview limit=3.
    return limit !== '3';
}

export function parseFetchCustomerServicesResponse(
    body: unknown,
    requestUrl = ''
): CustomerServicesListSnapshot {
    if (!Array.isArray(body)) {
        throw new CirsRecordCustomerServicesError(
            'fetch_customer_services response was not a JSON array (expected ordered customer service rows).'
        );
    }
    const customerServiceIdsInApiOrder: string[] = [];
    const entries: FetchCustomerServicesEntry[] = [];
    for (const [index, item] of body.entries()) {
        if (!item || typeof item !== 'object') {
            throw new CirsRecordCustomerServicesError(
                `fetch_customer_services entry at index ${index} was not an object.`
            );
        }
        const row = item as Record<string, unknown>;
        const customerServiceId = row.customerServiceId;
        if (typeof customerServiceId !== 'string' || !CUSTOMER_SERVICE_ID_BODY.test(customerServiceId)) {
            throw new CirsRecordCustomerServicesError(
                `fetch_customer_services entry at index ${index} missing customerServiceId UUID.`
            );
        }
        const numericId = typeof row.id === 'number' ? row.id : null;
        const createdAt = typeof row.createdAt === 'string' ? row.createdAt : null;
        customerServiceIdsInApiOrder.push(customerServiceId);
        entries.push({ customerServiceId, numericId, createdAt });
    }
    return { customerServiceIdsInApiOrder, entries, requestUrl };
}

export function resolveCustomerServiceIndex(
    snapshot: CustomerServicesListSnapshot,
    customerServiceId: string
): number {
    const index = snapshot.customerServiceIdsInApiOrder.indexOf(customerServiceId);
    if (index < 0) {
        throw new CirsRecordCustomerServicesError(
            `customerServiceId ${customerServiceId} was not present in the captured fetch_customer_services list ` +
                `(ids=${snapshot.customerServiceIdsInApiOrder.join(', ')}).`
        );
    }
    return index;
}

export type CustomerServicesCapture = {
    waitForSnapshot: (options?: {
        timeoutMs?: number;
        customerId?: string;
        fresh?: boolean;
        kind?: FetchCustomerServicesCaptureKind;
    }) => Promise<CustomerServicesListSnapshot>;
    dispose: () => void;
};

export function beginFetchCustomerServicesCapture(
    page: Page,
    expectedCustomerId: string,
    timeoutMs = 30000
): CustomerServicesCapture {
    let disposed = false;
    let responsesSeen = 0;
    let lastValidSnapshot: CustomerServicesListSnapshot | null = null;
    const waiters: Array<{
        resolve: (snapshot: CustomerServicesListSnapshot) => void;
        reject: (error: Error) => void;
        customerId: string;
        timer: ReturnType<typeof setTimeout>;
        fresh: boolean;
        baselineResponsesSeen: number;
        kind: FetchCustomerServicesCaptureKind;
    }> = [];

    const rejectAllWaiters = (error: Error) => {
        for (const waiter of waiters.splice(0)) {
            clearTimeout(waiter.timer);
            waiter.reject(error);
        }
    };

    const tryResolveWaiters = (snapshot: CustomerServicesListSnapshot) => {
        lastValidSnapshot = snapshot;
        const remaining: typeof waiters = [];
        for (const waiter of waiters) {
            if (kindMismatch(waiter.kind, snapshot.requestUrl)) {
                remaining.push(waiter);
                continue;
            }
            if (waiter.fresh && responsesSeen <= waiter.baselineResponsesSeen) {
                remaining.push(waiter);
                continue;
            }
            clearTimeout(waiter.timer);
            waiter.resolve(snapshot);
        }
        waiters.splice(0, waiters.length, ...remaining);
    };

    const kindMismatch = (kind: FetchCustomerServicesCaptureKind, requestUrl: string): boolean =>
        kind !== 'any' && !requestMatchesFetchCaptureKind(requestUrl, kind);

    const onResponse = async (response: Response) => {
        if (disposed) {
            return;
        }
        if (response.request().method() !== 'GET') {
            return;
        }
        const requestUrl = response.url();
        if (!isFetchCustomerServicesRequestUrl(requestUrl)) {
            return;
        }
        const customerIdParam = parseFetchRequestCustomerId(requestUrl);
        if (!customerIdParam || customerIdParam !== expectedCustomerId) {
            return;
        }

        if (response.status() !== 200) {
            rejectAllWaiters(
                new CirsRecordCustomerServicesError(
                    `fetch_customer_services responded with HTTP ${response.status()} (url=${requestUrl}).`
                )
            );
            return;
        }
        try {
            const body = await response.json();
            responsesSeen += 1;
            const snapshot = parseFetchCustomerServicesResponse(body, requestUrl);
            tryResolveWaiters(snapshot);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'fetch_customer_services JSON parse failed';
            rejectAllWaiters(new CirsRecordCustomerServicesError(message));
        }
    };

    page.on('response', onResponse);

    return {
        waitForSnapshot: (options) => {
            const customerId = options?.customerId ?? expectedCustomerId;
            const waitTimeout = options?.timeoutMs ?? timeoutMs;
            const kind = options?.kind ?? 'any';
            const fresh = options?.fresh ?? false;
            const baselineResponsesSeen = fresh ? responsesSeen : -1;

            if (!fresh && lastValidSnapshot) {
                if (kind === 'any' || requestMatchesFetchCaptureKind(lastValidSnapshot.requestUrl, kind)) {
                    return Promise.resolve(lastValidSnapshot);
                }
            }

            return new Promise<CustomerServicesListSnapshot>((resolve, reject) => {
                const timer = setTimeout(() => {
                    const idx = waiters.findIndex((w) => w.resolve === resolve);
                    if (idx >= 0) {
                        waiters.splice(idx, 1);
                    }
                    reject(
                        new CirsRecordCustomerServicesError(
                            `fetch_customer_services was not observed within ${waitTimeout}ms for customer ${customerId}` +
                                (kind !== 'any' ? ` (kind=${kind})` : '') +
                                '.'
                        )
                    );
                }, waitTimeout);

                waiters.push({
                    resolve,
                    reject,
                    customerId,
                    timer,
                    fresh,
                    baselineResponsesSeen,
                    kind,
                });
            });
        },
        dispose: () => {
            disposed = true;
            page.off('response', onResponse);
            rejectAllWaiters(
                new CirsRecordCustomerServicesError('Customer services capture disposed before snapshot.')
            );
        },
    };
}
