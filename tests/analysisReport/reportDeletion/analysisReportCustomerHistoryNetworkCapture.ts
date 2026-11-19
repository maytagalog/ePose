import type { Page, Request, Response } from '@playwright/test';
import { postureAnalysisFullListContainer } from '../../CIRS/postureAnalysis/postureAnalysisFullListLocators';
import {
    VERIFIED_CUSTOMER_HISTORY_PAGE_SIZE,
    VERIFIED_FETCH_CUSTOMER_REPORT_URL,
    type VerifiedCustomerReportListItem,
    type VerifiedFetchCustomerReportRequestBody,
} from './analysisReportStagingContracts';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';
import type { CustomerHistoryCatalogResult } from './analysisReportCustomerHistoryApiCatalog';

const MAX_SCROLL_ROUNDS = 40;
const DEFAULT_FIRST_PAGE_WAIT_MS = 60000;
const NEXT_PAGE_WAIT_MS = 30000;

function resolveFirstPageWaitMs(): number {
    const fromEnv = process.env.ANALYSIS_REPORT_CUSTOMER_HISTORY_FIRST_PAGE_WAIT_MS;
    if (fromEnv) {
        const parsed = Number(fromEnv);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_FIRST_PAGE_WAIT_MS;
}

export type CustomerHistoryCatalogCapture = CustomerHistoryCatalogResult & {
    accountId: string;
    emptyHistory: boolean;
};

type PageRecord = {
    rawItemCount: number;
    rows: VerifiedCustomerReportListItem[];
    requestBody: VerifiedFetchCustomerReportRequestBody;
    status: number;
};

type Waiter = {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

function parseRequestBody(postData: string | null): VerifiedFetchCustomerReportRequestBody | null {
    if (!postData) {
        return null;
    }
    try {
        return JSON.parse(postData) as VerifiedFetchCustomerReportRequestBody;
    } catch {
        return null;
    }
}

function unwrapFetchCustomerReportPayload(body: unknown): unknown[] {
    if (Array.isArray(body)) {
        return body;
    }
    if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
        return (body as { data: unknown[] }).data;
    }
    throw new AnalysisReportDeletionFlowError(
        'fetch_customer_report response received but invalid: body must be a top-level JSON array or { data: array }.'
    );
}

function parseCustomerReportResponseBodyStrict(body: unknown, pageIndex: number): VerifiedCustomerReportListItem[] {
    const list = unwrapFetchCustomerReportPayload(body);
    const rows: VerifiedCustomerReportListItem[] = [];
    for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        if (!item || typeof item !== 'object') {
            throw new AnalysisReportDeletionFlowError(
                `fetch_customer_report response received but invalid: page ${pageIndex} item[${index}] is not an object.`
            );
        }
        const record = item as Record<string, unknown>;
        const analysisId = String(record.analysisId ?? '').trim();
        const customerId = String(record.customerId ?? '').trim();
        const createdAt = String(record.createdAt ?? '').trim();
        const id = String(record.id ?? '').trim();
        if (!analysisId || !customerId || !createdAt || !id) {
            throw new AnalysisReportDeletionFlowError(
                `fetch_customer_report response received but invalid: page ${pageIndex} item[${index}] missing required fields.`
            );
        }
        if (Number.isNaN(Date.parse(createdAt))) {
            throw new AnalysisReportDeletionFlowError(
                `fetch_customer_report response received but invalid: page ${pageIndex} item[${index}] has invalid createdAt.`
            );
        }
        rows.push({ analysisId, customerId, createdAt, id });
    }
    return rows;
}

function assertRequestMatchesExpected(
    body: VerifiedFetchCustomerReportRequestBody,
    expectedCustomerId: string,
    pageIndex: number
): void {
    if (body.customerId !== expectedCustomerId) {
        throw new AnalysisReportDeletionFlowError(
            `fetch_customer_report request customerId ${body.customerId} != expected ${expectedCustomerId}.`
        );
    }
    if (body.pageSize !== VERIFIED_CUSTOMER_HISTORY_PAGE_SIZE) {
        throw new AnalysisReportDeletionFlowError(
            `fetch_customer_report pageSize ${body.pageSize} != verified ${VERIFIED_CUSTOMER_HISTORY_PAGE_SIZE}.`
        );
    }
    if (pageIndex === 0) {
        if (body.isFirstPage !== true) {
            throw new AnalysisReportDeletionFlowError('First fetch_customer_report page must set isFirstPage=true.');
        }
        if (!body.sortType?.trim()) {
            throw new AnalysisReportDeletionFlowError('First fetch_customer_report page missing sortType.');
        }
    } else if (body.isFirstPage === true) {
        throw new AnalysisReportDeletionFlowError('Subsequent fetch_customer_report page must not set isFirstPage=true.');
    }
    if (!body.accountId?.trim()) {
        throw new AnalysisReportDeletionFlowError('fetch_customer_report request missing accountId.');
    }
}

export class CustomerHistoryNetworkCaptureSession {
    private readonly page: Page;
    private readonly expectedCustomerId: string;
    private readonly pages: PageRecord[] = [];
    private readonly pending = new Set<Promise<void>>();
    private readonly nextPageWaits: Waiter[] = [];
    private readonly firstPageWaits: Waiter[] = [];
    private captureError: Error | null = null;
    private disposed = false;
    private accountId: string | null = null;
    private matchingRequestsObserved = 0;
    private matchingResponsesObserved = 0;

    private readonly onRequest = (request: Request): void => {
        if (this.disposed) {
            return;
        }
        if (request.method() !== 'POST' || !request.url().includes(VERIFIED_FETCH_CUSTOMER_REPORT_URL)) {
            return;
        }
        this.matchingRequestsObserved += 1;
    };

    private readonly onResponse = (response: Response): void => {
        if (this.disposed || this.captureError) {
            return;
        }
        if (response.request().method() !== 'POST' || !response.url().includes(VERIFIED_FETCH_CUSTOMER_REPORT_URL)) {
            return;
        }
        this.matchingResponsesObserved += 1;
        const task = this.ingestResponse(response);
        this.pending.add(task);
        task.finally(() => this.pending.delete(task));
    };

    constructor(page: Page, expectedCustomerId: string) {
        this.page = page;
        this.expectedCustomerId = expectedCustomerId;
        page.on('request', this.onRequest);
        page.on('response', this.onResponse);
    }

    private clearWaiter(waiter: Waiter): void {
        clearTimeout(waiter.timer);
    }

    private rejectWaiters(waiters: Waiter[], error: Error): void {
        while (waiters.length > 0) {
            const waiter = waiters.shift()!;
            this.clearWaiter(waiter);
            waiter.reject(error);
        }
    }

    private resolveFirstPageWaiters(): void {
        while (this.firstPageWaits.length > 0) {
            const waiter = this.firstPageWaits.shift()!;
            this.clearWaiter(waiter);
            waiter.resolve();
        }
    }

    private resolveNextPageWait(): void {
        const waiter = this.nextPageWaits.shift();
        if (!waiter) {
            return;
        }
        this.clearWaiter(waiter);
        waiter.resolve();
    }

    private rejectAllWaits(error: Error): void {
        this.rejectWaiters(this.firstPageWaits, error);
        this.rejectWaiters(this.nextPageWaits, error);
    }

    private recordCaptureError(error: Error): void {
        if (!this.captureError) {
            this.captureError = error;
            this.rejectAllWaits(error);
        }
    }

    private buildMissingFirstPageError(): AnalysisReportDeletionFlowError {
        if (this.captureError) {
            return new AnalysisReportDeletionFlowError(
                `fetch_customer_report response received but invalid: ${this.captureError.message}`
            );
        }
        if (this.matchingRequestsObserved === 0) {
            return new AnalysisReportDeletionFlowError(
                'Customer history capture: no matching fetch_customer_report request observed before deadline.'
            );
        }
        if (this.matchingResponsesObserved === 0) {
            return new AnalysisReportDeletionFlowError(
                'Customer history capture: matching fetch_customer_report request observed but no response before deadline.'
            );
        }
        return new AnalysisReportDeletionFlowError(
            'Customer history capture: response observed but first validated page not complete before deadline.'
        );
    }

    private async ingestResponse(response: Response): Promise<void> {
        try {
            const requestBody = parseRequestBody(response.request().postData());
            if (!requestBody) {
                throw new AnalysisReportDeletionFlowError(
                    'fetch_customer_report response received but invalid: request body missing or invalid JSON.'
                );
            }
            const pageIndex = this.pages.length;
            assertRequestMatchesExpected(requestBody, this.expectedCustomerId, pageIndex);

            const status = response.status();
            if (status < 200 || status >= 300) {
                throw new AnalysisReportDeletionFlowError(`fetch_customer_report failed status=${status}.`);
            }

            const json = await response.json();
            const rows = parseCustomerReportResponseBodyStrict(json, pageIndex);
            for (const row of rows) {
                if (row.customerId !== this.expectedCustomerId) {
                    throw new AnalysisReportDeletionFlowError(
                        `fetch_customer_report item customerId ${row.customerId} != expected ${this.expectedCustomerId}.`
                    );
                }
            }

            if (!this.accountId) {
                this.accountId = requestBody.accountId.trim();
            } else if (this.accountId !== requestBody.accountId.trim()) {
                throw new AnalysisReportDeletionFlowError(
                    'fetch_customer_report accountId changed across pagination pages.'
                );
            }

            this.pages.push({
                rawItemCount: rows.length,
                rows,
                requestBody,
                status,
            });

            if (pageIndex === 0) {
                this.resolveFirstPageWaiters();
            } else {
                this.resolveNextPageWait();
            }
        } catch (error) {
            this.recordCaptureError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    async drainPending(): Promise<void> {
        if (this.captureError) {
            throw this.captureError;
        }
        const tasks = [...this.pending];
        for (const task of tasks) {
            await task;
        }
        if (this.captureError) {
            throw this.captureError;
        }
    }

    private pushWaiter(
        bucket: Waiter[],
        timeoutMs: number,
        onTimeout: () => AnalysisReportDeletionFlowError
    ): Promise<void> {
        if (this.captureError) {
            return Promise.reject(this.captureError);
        }
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                const index = bucket.findIndex((entry) => entry.timer === timer);
                if (index >= 0) {
                    bucket.splice(index, 1);
                }
                reject(onTimeout());
            }, timeoutMs);

            const waiter: Waiter = {
                timer,
                resolve: () => {
                    clearTimeout(timer);
                    const index = bucket.indexOf(waiter);
                    if (index >= 0) {
                        bucket.splice(index, 1);
                    }
                    resolve();
                },
                reject: (error) => {
                    clearTimeout(timer);
                    const index = bucket.indexOf(waiter);
                    if (index >= 0) {
                        bucket.splice(index, 1);
                    }
                    reject(error);
                },
            };
            bucket.push(waiter);
        });
    }

    private async waitForFirstValidatedPage(): Promise<void> {
        if (this.captureError) {
            throw this.captureError;
        }
        if (this.pages.length > 0) {
            await this.drainPending();
            return;
        }

        const wait = this.pushWaiter(
            this.firstPageWaits,
            resolveFirstPageWaitMs(),
            () => this.buildMissingFirstPageError()
        );

        if (this.pages.length > 0) {
            this.resolveFirstPageWaiters();
        } else if (this.captureError) {
            this.rejectAllWaits(this.captureError);
        }

        await wait;
        await this.drainPending();
        if (this.captureError) {
            throw this.captureError;
        }
        if (this.pages.length === 0) {
            throw this.buildMissingFirstPageError();
        }
    }

    private waitForNextPage(): Promise<void> {
        if (this.captureError) {
            return Promise.reject(this.captureError);
        }
        return this.pushWaiter(
            this.nextPageWaits,
            NEXT_PAGE_WAIT_MS,
            () =>
                new AnalysisReportDeletionFlowError(
                    'Validated first fetch_customer_report page received; pagination timed out waiting for next page.'
                )
        );
    }

    private terminalReached(): boolean {
        const last = this.pages[this.pages.length - 1];
        if (!last) {
            return false;
        }
        return last.rawItemCount < VERIFIED_CUSTOMER_HISTORY_PAGE_SIZE;
    }

    async completeAfterHistoryLoad(): Promise<CustomerHistoryCatalogCapture> {
        try {
            await this.waitForFirstValidatedPage();

            if (!this.terminalReached()) {
                const historyList = postureAnalysisFullListContainer(this.page);
                for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
                    const nextPage = this.waitForNextPage();
                    await historyList.evaluate((el) => {
                        el.scrollTop = el.scrollHeight;
                        el.dispatchEvent(new Event('scroll', { bubbles: true }));
                    });
                    await nextPage;
                    await this.drainPending();
                    if (this.terminalReached()) {
                        break;
                    }
                }
            }

            await this.drainPending();

            if (!this.terminalReached()) {
                throw new AnalysisReportDeletionFlowError(
                    'Validated first fetch_customer_report page received; pagination did not reach a terminal short page.'
                );
            }

            if (!this.accountId) {
                throw new AnalysisReportDeletionFlowError('Authenticated accountId was not observed on fetch_customer_report.');
            }

            const orderedApiRows: VerifiedCustomerReportListItem[] = [];
            const seenAnalysisIds = new Set<string>();
            for (const pageRecord of this.pages) {
                for (const row of pageRecord.rows) {
                    if (seenAnalysisIds.has(row.analysisId)) {
                        continue;
                    }
                    seenAnalysisIds.add(row.analysisId);
                    orderedApiRows.push(row);
                }
            }

            const rows = orderedApiRows.map((row, rowIndex) => ({
                customerId: row.customerId,
                analysisId: row.analysisId,
                chronologyIso: row.createdAt,
                chronologySource: 'api.createdAt' as const,
                rowIndex,
            }));

            const emptyHistory = this.pages[0]!.rawItemCount === 0;
            return {
                rows,
                catalogComplete: true,
                pagesFetched: this.pages.length,
                accountId: this.accountId,
                emptyHistory,
                firstPageSortType: this.pages[0]!.requestBody.sortType?.trim() ?? null,
                historyOrderVerified: false,
            };
        } finally {
            this.dispose();
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.page.off('request', this.onRequest);
        this.page.off('response', this.onResponse);
        const disposeReason =
            this.captureError ??
            new AnalysisReportDeletionFlowError('Customer history capture disposed before completion.');
        for (const waiter of this.firstPageWaits) {
            this.clearWaiter(waiter);
            waiter.reject(disposeReason);
        }
        for (const waiter of this.nextPageWaits) {
            this.clearWaiter(waiter);
            waiter.reject(disposeReason);
        }
        this.firstPageWaits.length = 0;
        this.nextPageWaits.length = 0;
    }

    observedAccountId(): string | null {
        return this.accountId;
    }
}

export function beginCustomerHistoryNetworkCapture(
    page: Page,
    expectedCustomerId: string
): CustomerHistoryNetworkCaptureSession {
    return new CustomerHistoryNetworkCaptureSession(page, expectedCustomerId);
}

export function abortCaptureOnFailure(session: CustomerHistoryNetworkCaptureSession | null, error: unknown): void {
    try {
        session?.dispose();
    } catch {
        void error;
    }
}
