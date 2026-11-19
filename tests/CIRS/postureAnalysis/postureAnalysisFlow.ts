import { expect, type Locator, type Page } from '@playwright/test';
import { assertSelectedCustomerIdentity } from '../../accountRegistration/customerFlow';
import {
    assertCirsRecordDetailContainer,
    assertCirsRecordSectionReady,
    assertCustomerDetailsCollapsedForCirs,
    assertCustomerListReadyForCirs,
    INTERACTION_RECORD_DETAIL_URL,
    parseCustomerIdFromUrl,
    parseInteractionRecordIdFromUrl,
} from '../cirsRecord/cirsRecordFlow';
import { clickInteractionRecordRowByServiceId } from '../cirsRecord/cirsRecordInteractionRows';
import { CIRS_TEST_IDS, CUSTOMER_ID_ATTR } from '../cirsRecord/cirsRecordTestIds';
import { dismissAutomaticLimitDialogIfPresent } from '../responseDetails/responseDetailsFlow';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    DEFAULT_LIMIT_DIALOG_ENV,
    LimitDialogFlowError,
    runTriggerLimitDialogCheck,
} from '../../limitDialog/limitDialogFlow';
import { PostureAnalysisFlowError } from './postureAnalysisErrors';
import {
    assertPostureAnalysisFullListItemCustomerIds,
    assertPostureAnalysisFullListReady,
} from './postureAnalysisFullListReadiness';
import { postureAnalysisFullListContainer } from './postureAnalysisFullListLocators';
import { awaitFirstDisplayedPreviewAnalysisItem } from './postureAnalysisListReadiness';
import {
    assertPostureAnalysisFullListRoute,
    clickPostureAnalysisFullListBack,
    postureAnalysisFullListUrlPattern,
} from './postureAnalysisLocators';
import {
    abortCaptureOnFailure,
    beginCustomerHistoryNetworkCapture,
    type CustomerHistoryNetworkCaptureSession,
} from '../../analysisReport/reportDeletion/analysisReportCustomerHistoryNetworkCapture';
import type { CustomerHistoryCatalogLoadResult } from '../../analysisReport/reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { isDeletionFixtureOrigin } from '../../analysisReport/reportDeletion/analysisReportDeletionFixtureMode';
import { loadCustomerHistoryCatalogFromNetwork } from '../../analysisReport/reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { assertAnalysisReportPageLoaded } from './postureAnalysisReportLocators';
import {
    logPostureAnalysisNavSummary,
    PostureAnalysisRunTracker,
    type PostureAnalysisNavSummary,
    type PostureAnalysisRunEvidence,
} from './postureAnalysisReporting';
import {
    ANALYSIS_ID_ATTR,
    POSTURE_ANALYSIS_TEST_IDS,
    parseAnalysisIdFromUrl,
    postureAnalysisSelectedCustomerPath,
    postureAnalysisSelectedCustomerUrlPattern,
} from './postureAnalysisTestIds';

export { PostureAnalysisFlowError } from './postureAnalysisErrors';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

export type PostureAnalysisNavigationInput = {
    customerId: string;
    recordId: string;
    /** When omitted after back, uses customer-name text from the matching customer-row. */
    customerName?: string | null;
    /** Selected-customer page フリガナ; defaults to customerName when omitted. */
    customerFurigana?: string | null;
};

export type PostureAnalysisNavigationResult = {
    customerId: string;
    recordId: string;
    analysisId: string | null;
    listLoadOutcome: 'populated' | 'empty';
    reportOpening:
        | 'verified'
        | 'skipped_no_analysis_reports'
        | 'deferred_to_analysis_report_list_handoff';
    limitDialogVerified: boolean;
    navSummary: PostureAnalysisNavSummary;
    /** Present when endState is analysis_report_list_handoff and list capture completed. */
    customerHistoryCatalog?: CustomerHistoryCatalogLoadResult | null;
};

export type PostureAnalysisNavigationEndState = 'legacy_single_report' | 'analysis_report_list_handoff';

export type RunPostureAnalysisNavigationOptions = {
    accountEmail?: string | null;
    appOrigin?: string;
    onEvidence?: (evidence: PostureAnalysisRunEvidence) => void;
    /** Part 2 + Analysis Report: end on customer analysis report list for same-page handoff. */
    endState?: PostureAnalysisNavigationEndState;
};

export function postureAnalysisEvidenceAttachmentBody(
    payload: PostureAnalysisNavigationResult | PostureAnalysisRunEvidence | Record<string, unknown>
): string {
    return JSON.stringify(payload, null, 2);
}

export { parseAnalysisIdFromUrl } from './postureAnalysisTestIds';

function postureAnalysisSection(page: Page): Locator {
    return page.getByTestId(POSTURE_ANALYSIS_TEST_IDS.section);
}

async function assertRecordIdentity(page: Page, customerId: string, recordId: string): Promise<void> {
    await expect(page).toHaveURL(INTERACTION_RECORD_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    const routeRecordId = parseInteractionRecordIdFromUrl(page.url());
    if (routeCustomerId !== customerId || routeRecordId !== recordId) {
        throw new PostureAnalysisFlowError(
            `Record identity mismatch (route customer=${routeCustomerId} record=${routeRecordId}).`
        );
    }
    await assertCirsRecordDetailContainer(page, customerId, recordId);
}

async function scrollPostureAnalysisSectionIntoView(section: Locator): Promise<void> {
    await section.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
}

async function verifyNewAnalysisLimitDialog(page: Page, section: Locator): Promise<void> {
    const status = await runTriggerLimitDialogCheck(
        page,
        'new_analysis',
        async () => {
            const create = section.getByTestId(POSTURE_ANALYSIS_TEST_IDS.create);
            await expect(create).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
            await create.click({ timeout: ACTION_TIMEOUT_MS });
        },
        DEFAULT_LIMIT_DIALOG_ENV
    );
    if (status !== 'verified_dismissed') {
        throw new LimitDialogFlowError(
            `新規分析 on CIRS record did not produce a dismissible Limit Dialog (${status}).`
        );
    }
}

async function openAnalysisFullListFromRecord(
    page: Page,
    section: Locator,
    expectedCustomerId: string,
    appOrigin: string
): Promise<Locator> {
    await section.getByTestId(POSTURE_ANALYSIS_TEST_IDS.listOpen).click({ timeout: ACTION_TIMEOUT_MS });
    await assertPostureAnalysisFullListRoute(page, expectedCustomerId, appOrigin);
    const historyList = postureAnalysisFullListContainer(page);
    await expect(historyList).toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });
    return historyList;
}

async function assertBackNavigatesToSelectedCustomerPage(
    page: Page,
    expectedCustomerId: string,
    appOrigin: string,
    customerNameHint?: string | null,
    customerFuriganaHint?: string | null
): Promise<Locator> {
    await clickPostureAnalysisFullListBack(page);
    await expect(postureAnalysisFullListContainer(page)).toBeHidden({
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect
        .poll(
            () => {
                const pathname = new URL(page.url()).pathname;
                return pathname.includes('/posture-analysis-report') ? '' : pathname;
            },
            {
                timeout: NAVIGATION_TIMEOUT_MS,
                message: 'Waiting for back navigation off posture-analysis-report',
            }
        )
        .not.toBe('');

    const origin = new URL(page.url()).origin;
    if (origin !== appOrigin) {
        throw new PostureAnalysisFlowError(
            `After analysis list back, origin ${origin} != expected ${appOrigin}.`
        );
    }
    const pathname = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
    const expectedPath = postureAnalysisSelectedCustomerPath(expectedCustomerId);
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    if (routeCustomerId !== expectedCustomerId) {
        throw new PostureAnalysisFlowError(
            `After analysis list back, route customer (${routeCustomerId}) != expected ${expectedCustomerId} (expected ${expectedPath}; actual ${pathname}).`
        );
    }
    if (pathname !== expectedPath) {
        throw new PostureAnalysisFlowError(
            `After analysis list back, expected ${expectedPath}, got ${pathname} (must not accept arbitrary customer routes).`
        );
    }
    await expect(page).toHaveURL(postureAnalysisSelectedCustomerUrlPattern(expectedCustomerId), {
        timeout: ACTION_TIMEOUT_MS,
    });
    await assertCustomerListReadyForCirs(page);
    const row = page.locator(
        `[data-testid="${CIRS_TEST_IDS.customerRow}"][${CUSTOMER_ID_ATTR}="${expectedCustomerId}"]`
    );
    await expect(row, `customer-row for ${expectedCustomerId}`).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const nameFromRow = (await row.getByTestId(CIRS_TEST_IDS.customerName).textContent())?.trim() ?? '';
    const customerName = customerNameHint?.trim() || nameFromRow;
    const customerFurigana = customerFuriganaHint?.trim() || customerName;
    if (!customerName) {
        throw new PostureAnalysisFlowError(
            'Selected customer identity requires customerName or visible customer-name on the matching customer-row.'
        );
    }
    await assertSelectedCustomerIdentity(page, customerName, customerFurigana);
    const main = page.getByRole('main');
    await assertCustomerDetailsCollapsedForCirs(main);
    return assertCirsRecordSectionReady(main);
}

export async function openExistingCirsRecordForPostureAnalysis(
    page: Page,
    input: Pick<PostureAnalysisNavigationInput, 'customerId' | 'recordId'> & { appOrigin?: string }
): Promise<void> {
    const origin = input.appOrigin ?? STG_APP_ORIGIN;
    await page.goto(`${origin}/customers/${input.customerId}/interaction-records/${input.recordId}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await dismissAutomaticLimitDialogIfPresent(page);
    await assertRecordIdentity(page, input.customerId, input.recordId);
}

export function resolvePostureAnalysisRecordFromEnv(): Pick<
    PostureAnalysisNavigationInput,
    'customerId' | 'recordId'
> {
    const customerId = process.env.CIRS_POSTURE_ANALYSIS_CUSTOMER_ID?.trim() ?? '';
    const recordId = process.env.CIRS_POSTURE_ANALYSIS_RECORD_ID?.trim() ?? '';
    if (!customerId || !recordId) {
        throw new Error(
            'Set CIRS_POSTURE_ANALYSIS_CUSTOMER_ID and CIRS_POSTURE_ANALYSIS_RECORD_ID before running posture analysis specs.'
        );
    }
    return { customerId, recordId };
}

export async function runCirsPostureAnalysisNavigationFlow(
    page: Page,
    input: PostureAnalysisNavigationInput,
    options?: RunPostureAnalysisNavigationOptions
): Promise<PostureAnalysisNavigationResult> {
    const appOrigin = options?.appOrigin ?? STG_APP_ORIGIN;
    const { customerId, recordId, customerName, customerFurigana } = input;
    const tracker = new PostureAnalysisRunTracker({ accountEmail: options?.accountEmail ?? null });
    const publish = (): void => {
        options?.onEvidence?.(tracker.toEvidence());
    };

    tracker.logNavigationStarted(new URL(page.url()).pathname, customerId, recordId);
    publish();

    let listLoadOutcome: 'populated' | 'empty' = 'empty';
    let analysisId: string | null = null;

    try {
        tracker.stepStarted('record identity');
        await assertRecordIdentity(page, customerId, recordId);
        tracker.stepCompleted('record identity');
        publish();

        const section = postureAnalysisSection(page);
        await scrollPostureAnalysisSectionIntoView(section);

        tracker.stepStarted('new analysis limit dialog');
        try {
            await verifyNewAnalysisLimitDialog(page, section);
            tracker.logLimitDialogVerified(new URL(page.url()).pathname);
        } catch (error) {
            tracker.logLimitDialogFailed(error, new URL(page.url()).pathname);
            throw error;
        }
        publish();

        tracker.stepStarted('analysis list verification');
        let handoffCatalog: CustomerHistoryCatalogLoadResult | null = null;
        let handoffCaptureSession: CustomerHistoryNetworkCaptureSession | null = null;
        const captureForHandoff =
            options?.endState === 'analysis_report_list_handoff' &&
            !isDeletionFixtureOrigin(page.url()) &&
            !isDeletionFixtureOrigin(appOrigin);
        if (captureForHandoff) {
            handoffCaptureSession = beginCustomerHistoryNetworkCapture(page, customerId);
        }
        try {
            const historyList = await openAnalysisFullListFromRecord(page, section, customerId, appOrigin);
            listLoadOutcome = await assertPostureAnalysisFullListReady(page, 'analysis_full_list');
            if (listLoadOutcome === 'populated') {
                await assertPostureAnalysisFullListItemCustomerIds(
                    historyList,
                    customerId,
                    'analysis_full_list'
                );
            }
            await expect(page).toHaveURL(postureAnalysisFullListUrlPattern(customerId));
            tracker.listLoadOutcome = listLoadOutcome;
            tracker.logListVerified(new URL(page.url()).pathname, listLoadOutcome);
            if (captureForHandoff && handoffCaptureSession) {
                handoffCatalog = await handoffCaptureSession.completeAfterHistoryLoad();
                handoffCaptureSession = null;
            } else if (options?.endState === 'analysis_report_list_handoff') {
                handoffCatalog = await loadCustomerHistoryCatalogFromNetwork(page, appOrigin, customerId, {
                    reload: false,
                });
            }
        } catch (error) {
            abortCaptureOnFailure(handoffCaptureSession, error);
            tracker.logListFailed(error, new URL(page.url()).pathname);
            throw error;
        }
        publish();

        if (options?.endState === 'analysis_report_list_handoff') {
            if (listLoadOutcome !== 'populated') {
                throw new PostureAnalysisFlowError(
                    'Analysis Report Part 2 handoff requires a populated analysis report list.'
                );
            }
            if (!handoffCatalog?.catalogComplete || !handoffCatalog.accountId) {
                throw new PostureAnalysisFlowError(
                    'Analysis Report Part 2 handoff requires complete customer history catalog capture.'
                );
            }
            await expect(page).toHaveURL(postureAnalysisFullListUrlPattern(customerId));
            tracker.logReportOpeningDeferredToAnalysisReportList(new URL(page.url()).pathname);
            logPostureAnalysisNavSummary(tracker.navSummary);
            publish();
            return {
                customerId,
                recordId,
                analysisId: null,
                listLoadOutcome,
                reportOpening: 'deferred_to_analysis_report_list_handoff',
                limitDialogVerified: true,
                navSummary: { ...tracker.navSummary },
                customerHistoryCatalog: handoffCatalog,
            };
        }

        tracker.stepStarted('back to selected customer page');
        let recordSectionOnCustomerPage: Locator | null = null;
        try {
            recordSectionOnCustomerPage = await assertBackNavigatesToSelectedCustomerPage(
                page,
                customerId,
                appOrigin,
                customerName,
                customerFurigana
            );
            tracker.logBackToSelectedCustomerVerified(new URL(page.url()).pathname);
        } catch (error) {
            tracker.logBackToSelectedCustomerFailed(error, new URL(page.url()).pathname);
            throw error;
        }
        publish();

        if (listLoadOutcome === 'empty') {
            tracker.logReportOpeningSkipped(new URL(page.url()).pathname);
            logPostureAnalysisNavSummary(tracker.navSummary);
            publish();
            return {
                customerId,
                recordId,
                analysisId: null,
                listLoadOutcome,
                reportOpening: 'skipped_no_analysis_reports',
                limitDialogVerified: true,
                navSummary: { ...tracker.navSummary },
            };
        }

        tracker.stepStarted('same customer and record reopen');
        try {
            const recordSection = recordSectionOnCustomerPage ?? page.getByRole('main');
            await clickInteractionRecordRowByServiceId(recordSection, recordId);
            await assertRecordIdentity(page, customerId, recordId);
            tracker.logSameRecordReopenVerified(new URL(page.url()).pathname);
        } catch (error) {
            tracker.logSameRecordReopenFailed(error, new URL(page.url()).pathname);
            throw error;
        }
        publish();

        tracker.stepStarted('first analysis report opening');
        try {
            const analysisSection = postureAnalysisSection(page);
            await scrollPostureAnalysisSectionIntoView(analysisSection);
            const firstItem = await awaitFirstDisplayedPreviewAnalysisItem(
                analysisSection,
                customerId,
                'before_first_report_open'
            );
            const selectedAnalysisId = (await firstItem.getAttribute(ANALYSIS_ID_ATTR))!.trim();
            tracker.analysisId = selectedAnalysisId;
            publish();
            await firstItem.click({ timeout: ACTION_TIMEOUT_MS });
            await assertAnalysisReportPageLoaded(page, appOrigin, customerId, selectedAnalysisId);
            analysisId = selectedAnalysisId;
            tracker.logReportOpeningVerified(new URL(page.url()).pathname, selectedAnalysisId);
        } catch (error) {
            tracker.logReportOpeningFailed(error, new URL(page.url()).pathname);
            throw error;
        }
        publish();

        logPostureAnalysisNavSummary(tracker.navSummary);
        return {
            customerId,
            recordId,
            analysisId,
            listLoadOutcome,
            reportOpening: 'verified',
            limitDialogVerified: true,
            navSummary: { ...tracker.navSummary },
        };
    } catch (error) {
        tracker.logNavigationFailed(error, new URL(page.url()).pathname);
        logPostureAnalysisNavSummary(tracker.navSummary);
        publish();
        throw error;
    }
}
