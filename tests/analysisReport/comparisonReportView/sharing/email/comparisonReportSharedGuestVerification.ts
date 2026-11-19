import { expect, type Page, type Response } from '@playwright/test';
import {
    ANALYSIS_REPORT_COMPARISON_SECTION_LABELS,
    ANALYSIS_REPORT_SHARED_GUEST_COMPARISON_VISIBLE,
    ANALYSIS_REPORT_SHARED_GUEST_PRINT_ONLY_CLASS,
    GET_FETCH_SHARED_COMPARISON_REPORT_URL,
} from '../../../analysisReportTestIds';
import {
    sharedReportOnScreenTextMatches,
    SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS,
    SHARED_REPORT_SCROLL_OVERLAP_RATIO,
    SHARED_REPORT_SCROLL_TIMEOUT_MS,
    SHARED_REPORT_STABLE_BOTTOM_CHECKS,
} from '../../../sharing/email/analysisReportSharedReportVerification';
import {
    redactUrlQueryToken,
    sanitizeApiResponseBody,
    pickResponseCorrelationHeaders,
} from '../../../../e2e/shared/smokeDiagnosticSanitize';

export const SHARED_COMPARISON_GUEST_ACTION_TIMEOUT_MS = SHARED_REPORT_GUEST_ACTION_TIMEOUT_MS;
export const SHARED_COMPARISON_SCROLL_TIMEOUT_MS = SHARED_REPORT_SCROLL_TIMEOUT_MS;

export type ComparisonGuestFetchFailureDiagnostics = {
    httpStatus: number;
    responseBodySanitized: string;
    requestUrlRedacted: string;
    responseHeaders: Record<string, string>;
    customerId: string;
    leftAnalysisId: string;
    rightAnalysisId: string;
};

export class ComparisonReportSharedGuestVerificationError extends Error {
    readonly guestFetchDiagnostics?: ComparisonGuestFetchFailureDiagnostics;

    constructor(message: string, guestFetchDiagnostics?: ComparisonGuestFetchFailureDiagnostics) {
        super(message);
        this.name = 'ComparisonReportSharedGuestVerificationError';
        this.guestFetchDiagnostics = guestFetchDiagnostics;
    }
}

export type FetchSharedComparisonReportIdentity = {
    customerId: string;
    leftAnalysisId: string;
    rightAnalysisId: string;
    customerDisplayName: string | null;
};

export function isFetchSharedComparisonReportResponse(res: Response): boolean {
    return (
        res.url().startsWith(GET_FETCH_SHARED_COMPARISON_REPORT_URL) && res.request().method() === 'GET'
    );
}

function pickNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function pickReportIdentity(report: Record<string, unknown>): {
    analysisId: string;
    customerId: string;
    customerDisplayName: string | null;
} {
    const analysisId =
        pickNonEmptyString(report.analysisId) ??
        pickNonEmptyString(report.id) ??
        pickNonEmptyString(report.reportId);
    const customerId = pickNonEmptyString(report.customerId);
    if (!analysisId || !customerId) {
        throw new ComparisonReportSharedGuestVerificationError(
            'fetch_shared_public_comparison_report report missing analysisId or customerId'
        );
    }
    const customer =
        report.customer && typeof report.customer === 'object'
            ? (report.customer as Record<string, unknown>)
            : null;
    const customerDisplayName = pickNonEmptyString(customer?.fullName);
    return { analysisId, customerId, customerDisplayName };
}

export function parseFetchSharedComparisonReportIdentity(body: unknown): FetchSharedComparisonReportIdentity {
    if (body === null || typeof body !== 'object') {
        throw new ComparisonReportSharedGuestVerificationError(
            'fetch_shared_public_comparison_report body is not an object'
        );
    }
    const root = body as Record<string, unknown>;
    const data =
        root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
    const current =
        data.current && typeof data.current === 'object'
            ? (data.current as Record<string, unknown>)
            : null;
    const latest =
        data.latest && typeof data.latest === 'object' ? (data.latest as Record<string, unknown>) : null;
    if (!current || !latest) {
        throw new ComparisonReportSharedGuestVerificationError(
            'fetch_shared_public_comparison_report missing data.current or data.latest'
        );
    }

    const left = pickReportIdentity(current);
    const right = pickReportIdentity(latest);
    if (left.customerId !== right.customerId) {
        throw new ComparisonReportSharedGuestVerificationError(
            'fetch_shared_public_comparison_report current/latest customerId mismatch'
        );
    }

    return {
        customerId: left.customerId,
        leftAnalysisId: left.analysisId,
        rightAnalysisId: right.analysisId,
        customerDisplayName: left.customerDisplayName ?? right.customerDisplayName,
    };
}

export async function assertSharedComparisonGuestTitleVisible(page: Page): Promise<void> {
    const title = ANALYSIS_REPORT_SHARED_GUEST_COMPARISON_VISIBLE.comparisonTitle;
    const onScreen = sharedReportOnScreenTextMatches(page, title);
    await expect(onScreen).toHaveCount(1, { timeout: SHARED_COMPARISON_GUEST_ACTION_TIMEOUT_MS });
    await expect(onScreen).toBeVisible({ timeout: SHARED_COMPARISON_GUEST_ACTION_TIMEOUT_MS });
}

export async function scrollGuestComparisonAndAssertSectionsVisible(
    page: Page
): Promise<Record<string, boolean>> {
    const labels = Object.values(ANALYSIS_REPORT_COMPARISON_SECTION_LABELS);
    const visibility: Record<string, boolean> = {};
    const deadline = Date.now() + SHARED_COMPARISON_SCROLL_TIMEOUT_MS;
    let lastHeight = -1;
    let stableBottom = 0;

    while (Date.now() < deadline) {
        for (const label of labels) {
            if (visibility[label]) {
                continue;
            }
            const visible = page.getByText(label, { exact: true }).locator('visible=true');
            if ((await visible.count()) > 0) {
                visibility[label] = true;
            }
        }
        if (labels.every((label) => visibility[label])) {
            break;
        }

        const metrics = await page.evaluate(() => ({
            scrollTop: window.scrollY,
            scrollHeight: document.documentElement.scrollHeight,
            clientHeight: window.innerHeight,
        }));
        const atBottom = metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 4;
        if (atBottom) {
            if (metrics.scrollHeight === lastHeight) {
                stableBottom += 1;
            } else {
                stableBottom = 0;
                lastHeight = metrics.scrollHeight;
            }
            if (stableBottom >= SHARED_REPORT_STABLE_BOTTOM_CHECKS) {
                break;
            }
        } else {
            const step = Math.max(120, Math.floor(metrics.clientHeight * (1 - SHARED_REPORT_SCROLL_OVERLAP_RATIO)));
            await page.evaluate((y) => window.scrollTo(0, y), metrics.scrollTop + step);
        }
        await page.waitForTimeout(50);
    }

    const missing = labels.filter((label) => !visibility[label]);
    if (missing.length) {
        const printOnly = page
            .locator(`.${ANALYSIS_REPORT_SHARED_GUEST_PRINT_ONLY_CLASS}`)
            .getByText(missing[0]!, { exact: true });
        const printCount = await printOnly.count();
        throw new ComparisonReportSharedGuestVerificationError(
            `guest comparison missing visible section label(s): ${missing.join(', ')} (print-only clones: ${printCount})`
        );
    }

    return visibility;
}

export async function completeSharedComparisonGuestVerification(
    page: Page,
    fetchResponsePromise: Promise<Response>,
    customerId: string,
    leftAnalysisId: string,
    rightAnalysisId: string,
    sharedComparisonUrlRedacted?: string | null
): Promise<Record<string, boolean>> {
    const fetchResponse = await fetchResponsePromise;
    if (!fetchResponse.ok()) {
        const rawBody = await fetchResponse.text().catch(() => '');
        const guestFetchDiagnostics: ComparisonGuestFetchFailureDiagnostics = {
            httpStatus: fetchResponse.status(),
            responseBodySanitized: sanitizeApiResponseBody(rawBody),
            requestUrlRedacted: redactUrlQueryToken(fetchResponse.url()),
            responseHeaders: pickResponseCorrelationHeaders(fetchResponse.headers()),
            customerId,
            leftAnalysisId,
            rightAnalysisId,
        };
        console.log('COMPARISON_GUEST_FETCH_FAILED', JSON.stringify({
            ...guestFetchDiagnostics,
            sharedComparisonUrlRedacted: sharedComparisonUrlRedacted ?? null,
        }));
        throw new ComparisonReportSharedGuestVerificationError(
            `fetch_shared_public_comparison_report returned HTTP ${fetchResponse.status()}`,
            guestFetchDiagnostics
        );
    }

    const identity = parseFetchSharedComparisonReportIdentity(await fetchResponse.json());
    expect(identity.customerId).toBe(customerId);
    expect(identity.leftAnalysisId).toBe(leftAnalysisId);
    expect(identity.rightAnalysisId).toBe(rightAnalysisId);

    await assertSharedComparisonGuestTitleVisible(page);
    if (identity.customerDisplayName) {
        const nameVisible = sharedReportOnScreenTextMatches(page, identity.customerDisplayName);
        await expect(nameVisible).toHaveCount(1, { timeout: SHARED_COMPARISON_GUEST_ACTION_TIMEOUT_MS });
    }

    return scrollGuestComparisonAndAssertSectionsVisible(page);
}