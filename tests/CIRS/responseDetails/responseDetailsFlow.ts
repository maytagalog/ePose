import { expect, type Page } from '@playwright/test';
import {
    assertCirsRecordDetailContainer,
    INTERACTION_RECORD_DETAIL_URL,
    parseCustomerIdFromUrl,
    parseInteractionRecordIdFromUrl,
    type CirsRecordContext,
} from '../cirsRecord/cirsRecordFlow';
import {
    dismissLimitDialog,
    DEFAULT_LIMIT_DIALOG_ENV,
    limitDialogRoot,
} from '../../limitDialog/limitDialogFlow';
import { STG_APP_ORIGIN } from '../../login/existingUserLoginFlow';
import {
    CirsResponseDetailsRunTracker,
    type CirsResponseSaveOutcome,
} from './responseDetailsReporting';
import {
    beginResponseDetailCapture,
    RESPONSE_DETAIL_API_ORIGIN,
    RESPONSE_DETAIL_REQUEST_PATH,
    type ResponseDetailLoadResult,
} from './responseDetailsApi';
import {
    RESPONSE_DETAILS_TEST_IDS,
    RESPONSE_LAST_SAVED_AT_ATTR,
    RESPONSE_SAVE_STATE_ATTR,
    RESPONSE_SAVE_STATE_SAVED,
} from './responseDetailsTestIds';

export {
    RESPONSE_DETAIL_API_ORIGIN,
    RESPONSE_DETAIL_REQUEST_PATH,
    beginResponseDetailCapture,
    type ResponseDetailLoadResult,
} from './responseDetailsApi';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;
const AUTOSAVE_TIMEOUT_MS = 20000;
const LIMIT_DIALOG_DISMISS_MS = 4000;

export const STAGING_SMOKE_RESPONSE_TEXT_PREFIX = 'Staging Smoke Automation Testing';

export class CirsResponseDetailsFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CirsResponseDetailsFlowError';
    }
}

export type CirsResponseDetailsRunResult = {
    customerId: string;
    recordId: string;
    expectedText: string;
    saveOutcome: CirsResponseSaveOutcome;
    savedTimestamp: string | null;
};

export type RunCirsResponseDetailsOptions = {
    accountEmail?: string | null;
    /** Override Manila calendar date (YYYY-MM-DD) for tests. */
    manilaDateIso?: string;
    /** response_detail captured before the navigation that opened this record. */
    responseDetailLoad: ResponseDetailLoadResult;
};

export function manilaCalendarDateIso(reference = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(reference);
}

export function buildStagingSmokeResponseText(manilaDateIso: string): string {
    return `${STAGING_SMOKE_RESPONSE_TEXT_PREFIX} ${manilaDateIso}`;
}

export function responseDetailsEvidenceAttachmentBody(result: CirsResponseDetailsRunResult): string {
    return JSON.stringify(result, null, 2);
}

export function responseInputHasExistingContent(inputValue: string): boolean {
    return inputValue.trim().length > 0;
}

export async function dismissAutomaticLimitDialogIfPresent(page: Page): Promise<void> {
    const env = DEFAULT_LIMIT_DIALOG_ENV;
    const dialog = limitDialogRoot(page, env);
    try {
        await expect(dialog).toBeVisible({ timeout: LIMIT_DIALOG_DISMISS_MS });
    } catch {
        return;
    }
    await dismissLimitDialog(page, env);
}

async function assertRecordIdentityForResponseDetails(
    page: Page,
    expectedCustomerId: string,
    expectedRecordId: string
): Promise<void> {
    await expect(page).toHaveURL(INTERACTION_RECORD_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    const routeRecordId = parseInteractionRecordIdFromUrl(page.url());
    if (routeCustomerId !== expectedCustomerId) {
        throw new CirsResponseDetailsFlowError(
            `Route customer id ${routeCustomerId ?? 'none'} != expected ${expectedCustomerId}`
        );
    }
    if (routeRecordId !== expectedRecordId) {
        throw new CirsResponseDetailsFlowError(
            `Route record id ${routeRecordId ?? 'none'} != expected ${expectedRecordId}`
        );
    }
    await assertCirsRecordDetailContainer(page, expectedCustomerId, expectedRecordId);
}

function responseInput(page: Page) {
    return page.getByTestId(RESPONSE_DETAILS_TEST_IDS.input);
}

function responseSaveStatus(page: Page) {
    return page.getByTestId(RESPONSE_DETAILS_TEST_IDS.saveStatus);
}

function responseLastUpdated(page: Page) {
    return page.getByTestId(RESPONSE_DETAILS_TEST_IDS.lastUpdated);
}

type SaveBaseline = {
    inputValue: string;
    saveState: string | null;
    lastSavedAt: string | null;
};

async function readSaveBaseline(page: Page): Promise<SaveBaseline> {
    const input = responseInput(page);
    await expect(input).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const status = responseSaveStatus(page);
    return {
        inputValue: await input.inputValue(),
        saveState: await status.getAttribute(RESPONSE_SAVE_STATE_ATTR),
        lastSavedAt: await status.getAttribute(RESPONSE_LAST_SAVED_AT_ATTR),
    };
}

export async function applyResponseDetailLoadToUi(
    page: Page,
    load: ResponseDetailLoadResult
): Promise<void> {
    if (load.kind === 'no_details') {
        await expect(responseInput(page)).toHaveValue('', { timeout: ACTION_TIMEOUT_MS });
        return;
    }
    await expect(responseInput(page)).toHaveValue(load.details, { timeout: ACTION_TIMEOUT_MS });
}

async function assertSaveStatusAttributes(
    page: Page,
    baseline: SaveBaseline,
    expectedText: string
): Promise<string> {
    const status = responseSaveStatus(page);
    const input = responseInput(page);
    let savedAt = '';

    await expect
        .poll(async () => {
            const state = (await status.getAttribute(RESPONSE_SAVE_STATE_ATTR))?.trim() ?? '';
            const timestamp = (await status.getAttribute(RESPONSE_LAST_SAVED_AT_ATTR))?.trim() ?? '';
            if (state !== RESPONSE_SAVE_STATE_SAVED) {
                return 'pending';
            }
            if (!timestamp) {
                return 'pending';
            }
            if (baseline.lastSavedAt && timestamp === baseline.lastSavedAt) {
                return 'pending';
            }
            savedAt = timestamp;
            return 'confirmed';
        }, {
            timeout: AUTOSAVE_TIMEOUT_MS,
            message:
                'cirs-response-save-status: data-save-state=saved with nonempty data-last-saved-at reflecting this edit',
        })
        .toBe('confirmed');

    const lastUpdated = responseLastUpdated(page);
    await expect(lastUpdated).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect
        .poll(async () => ((await lastUpdated.textContent()) ?? '').trim().length, {
            timeout: ACTION_TIMEOUT_MS,
            message: 'cirs-response-last-updated populated',
        })
        .toBeGreaterThan(0);

    await expect(input).toHaveValue(expectedText, { timeout: ACTION_TIMEOUT_MS });

    return savedAt;
}

async function fillResponseInput(page: Page, expectedText: string): Promise<void> {
    const input = responseInput(page);
    await input.fill(expectedText, { timeout: ACTION_TIMEOUT_MS });
    await input.blur();
}

export async function runCirsResponseDetailsFlow(
    page: Page,
    recordContext: CirsRecordContext,
    options: RunCirsResponseDetailsOptions
): Promise<CirsResponseDetailsRunResult> {
    const tracker = new CirsResponseDetailsRunTracker({ accountEmail: options?.accountEmail ?? null });
    const manilaDate = options.manilaDateIso ?? manilaCalendarDateIso();
    const expectedText = buildStagingSmokeResponseText(manilaDate);
    const { customerId, recordId } = recordContext;
    const pathname = new URL(page.url()).pathname;
    const responseDetailLoad = options.responseDetailLoad;

    if (responseDetailLoad.recordId !== recordId) {
        throw new CirsResponseDetailsFlowError(
            `responseDetailLoad recordId ${responseDetailLoad.recordId} != context ${recordId}`
        );
    }

    tracker.logStarted(pathname, customerId, recordId, expectedText);

    try {
        tracker.stepStarted('identity verification');
        await assertRecordIdentityForResponseDetails(page, customerId, recordId);
        tracker.stepCompleted('identity verification');

        tracker.stepStarted('response load');
        await applyResponseDetailLoadToUi(page, responseDetailLoad);
        tracker.stepCompleted('response load');

        const baseline = await readSaveBaseline(page);

        if (responseInputHasExistingContent(baseline.inputValue)) {
            tracker.stepStarted('skip existing content');
            tracker.logSkippedExistingContent(pathname, baseline.inputValue);
            tracker.logCompleted(pathname);
            return {
                customerId,
                recordId,
                expectedText,
                saveOutcome: 'skipped_existing_content',
                savedTimestamp: null,
            };
        }

        tracker.stepStarted('autosave');
        await fillResponseInput(page, expectedText);
        const savedTimestamp = await assertSaveStatusAttributes(page, baseline, expectedText);
        tracker.logSaved(pathname, 'saved_after_edit', savedTimestamp);
        tracker.logCompleted(pathname);

        return {
            customerId,
            recordId,
            expectedText,
            saveOutcome: 'saved_after_edit',
            savedTimestamp,
        };
    } catch (error) {
        tracker.logFailed(error, pathname);
        throw error;
    }
}

export type OpenExistingRecordForResponseDetailsInput = {
    customerId: string;
    recordId: string;
    appOrigin?: string;
    apiOrigin?: string;
};

export async function openExistingCirsRecordForResponseDetails(
    page: Page,
    input: OpenExistingRecordForResponseDetailsInput
): Promise<ResponseDetailLoadResult> {
    const origin = input.appOrigin ?? STG_APP_ORIGIN;
    const apiOrigin = input.apiOrigin ?? RESPONSE_DETAIL_API_ORIGIN;
    const detailUrl = `${origin}/customers/${input.customerId}/interaction-records/${input.recordId}`;
    const responseDetailLoadPromise = beginResponseDetailCapture(page, input.recordId, { apiOrigin });
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    const responseDetailLoad = await responseDetailLoadPromise;
    await dismissAutomaticLimitDialogIfPresent(page);
    await assertRecordIdentityForResponseDetails(page, input.customerId, input.recordId);
    return responseDetailLoad;
}

export function resolveResponseDetailsRecordFromEnv(): OpenExistingRecordForResponseDetailsInput {
    const customerId = process.env.CIRS_RESPONSE_DETAILS_CUSTOMER_ID?.trim() ?? '';
    const recordId = process.env.CIRS_RESPONSE_DETAILS_RECORD_ID?.trim() ?? '';
    if (!customerId || !recordId) {
        throw new Error(
            'Set CIRS_RESPONSE_DETAILS_CUSTOMER_ID and CIRS_RESPONSE_DETAILS_RECORD_ID before running the Response Details standalone spec.'
        );
    }
    return { customerId, recordId };
}
