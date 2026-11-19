import type { Request, Response } from '@playwright/test';

/** Staging API origin (trace-confirmed). */
export const RESPONSE_DETAIL_API_ORIGIN = 'https://api-stg.epose.com';

/** Staging GET path (trace-confirmed, exact pathname match). */
export const RESPONSE_DETAIL_REQUEST_PATH = '/customer_interaction_record/response_detail';

export const RESPONSE_DETAIL_QUERY_PARAM = 'customerServiceId';

export type ResponseDetailLoadResult =
    | { kind: 'no_details'; recordId: string }
    | { kind: 'loaded'; recordId: string; details: string };

export type ResponseDetailPayload = {
    customerServiceId: string;
    details: string;
};

export function buildResponseDetailRequestUrl(
    recordId: string,
    apiOrigin: string = RESPONSE_DETAIL_API_ORIGIN
): string {
    const url = new URL(RESPONSE_DETAIL_REQUEST_PATH, apiOrigin);
    url.searchParams.set(RESPONSE_DETAIL_QUERY_PARAM, recordId);
    return url.toString();
}

export function responseDetailRequestMatches(
    request: Pick<Request, 'url' | 'method'>,
    recordId: string,
    apiOrigin: string = RESPONSE_DETAIL_API_ORIGIN
): boolean {
    if (request.method() !== 'GET') {
        return false;
    }
    let url: URL;
    try {
        url = new URL(request.url());
    } catch {
        return false;
    }
    if (url.origin !== apiOrigin) {
        return false;
    }
    if (url.pathname !== RESPONSE_DETAIL_REQUEST_PATH) {
        return false;
    }
    return url.searchParams.get(RESPONSE_DETAIL_QUERY_PARAM) === recordId;
}

export function parseResponseDetailJsonBody(raw: unknown, recordId: string): ResponseDetailLoadResult {
    if (raw === null) {
        return { kind: 'no_details', recordId };
    }
    if (typeof raw !== 'object') {
        throw new Error('response_detail JSON body must be null or an object');
    }
    const body = raw as Record<string, unknown>;
    if (typeof body.customerServiceId !== 'string') {
        throw new Error('response_detail object missing string customerServiceId');
    }
    if (body.customerServiceId !== recordId) {
        throw new Error(
            `response_detail customerServiceId ${body.customerServiceId} != expected ${recordId}`
        );
    }
    if (typeof body.details !== 'string') {
        throw new Error('response_detail object missing string details');
    }
    return { kind: 'loaded', recordId, details: body.details };
}

export async function consumeResponseDetailResponse(
    response: Response,
    recordId: string,
    apiOrigin: string = RESPONSE_DETAIL_API_ORIGIN
): Promise<ResponseDetailLoadResult> {
    if (!responseDetailRequestMatches(response.request(), recordId, apiOrigin)) {
        throw new Error(
            `Expected response_detail GET for ${recordId}, got ${response.request().method()} ${response.url()}`
        );
    }
    if (response.status() !== 200) {
        throw new Error(`response_detail HTTP ${response.status()}`);
    }
    let raw: unknown;
    try {
        raw = await response.json();
    } catch {
        throw new Error('response_detail response was not JSON');
    }
    return parseResponseDetailJsonBody(raw, recordId);
}

export function beginResponseDetailCapture(
    page: import('@playwright/test').Page,
    recordId: string,
    options?: { apiOrigin?: string; timeoutMs?: number }
): Promise<ResponseDetailLoadResult> {
    const apiOrigin = options?.apiOrigin ?? RESPONSE_DETAIL_API_ORIGIN;
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const responsePromise = page.waitForResponse(
        (resp) =>
            responseDetailRequestMatches(resp.request(), recordId, apiOrigin) &&
            resp.status() === 200,
        { timeout: timeoutMs }
    );
    return responsePromise.then((resp) => consumeResponseDetailResponse(resp, recordId, apiOrigin));
}
