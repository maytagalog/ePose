import { expect, type Locator, type Page, type Response } from '@playwright/test';
import {
    assertCustomerFlowNotBlocked,
    assertCustomersListInitReady,
    assertSelectedCustomerIdentity,
} from '../../accountRegistration/customerFlow';
import {
    openFirstCustomerInDisplayedOrder,
    type OpenCustomerFromPhonebookEvidence,
} from '../../limitDialog/limitDialogFlow';
import {
    beginFetchCustomerServicesCapture,
    type CustomerServicesCapture,
    type CustomerServicesListSnapshot,
    CirsRecordCustomerServicesError,
    FETCH_CUSTOMER_SERVICES_ORDER_EVIDENCE,
    resolveCustomerServiceIndex,
} from './cirsRecordCustomerServices';
import {
    clickInteractionRecordRowAtIndex,
    expectInteractionRecordRowCount,
    FULL_LIST_ROW_DOM_EVIDENCE,
    INTERACTION_RECORD_LIST_ICON_ALT,
    INTERACTION_RECORD_ROW_DATE_PATTERN,
    interactionRecordRowLocators,
    interactionRecordRowScopeOnFullListPage,
    interactionRecordRowsInCustomerSection,
    interactionRecordArrowWrapperMislocator,
} from './cirsRecordInteractionRows';

export {
    INTERACTION_RECORD_LIST_ICON_ALT,
    INTERACTION_RECORD_ROW_DATE_PATTERN,
    interactionRecordArrowWrapperMislocator,
    interactionRecordRowsInCustomerSection,
} from './cirsRecordInteractionRows';

const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

/**
 * Staging create endpoint (trace-confirmed): POST returns HTTP 200, Content-Type application/json,
 * body is a raw UUID string (not JSON).
 */
export const CREATE_CUSTOMER_INTERACTION_RECORD_URL =
    'https://api-stg.epose.com/customer_interaction_record/create_customer_service';

/** Response body must be exactly one UUID (optional surrounding whitespace only). */
export const CREATE_RECORD_RESPONSE_UUID_BODY =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Legacy CIR.spec.ts accessible name on staging (English prefix + Japanese label).
 * i18n key: customerInformation.newCustomerService → 新規応対.
 */
export const NEW_CUSTOMER_SERVICE_BUTTON_NAME = 'new response report 新規応対';

/** interactionRecordPage.title (ja bundle). */
export const INTERACTION_RECORD_DETAIL_TITLE = '応対記録';

/** interactionRecordListPage.title pattern suffix. */
export const INTERACTION_RECORD_LIST_TITLE_SUFFIX = '応対記録一覧';

/**
 * Screenshot (DevTools): accessible name includes img alt + 一覧 (not exact 一覧 alone).
 * @see INTERACTION_RECORD_LIST_ICON_ALT
 */
export const INTERACTION_RECORD_SECTION_LIST_BUTTON_NAME =
    /list response report[\s\u00a0]*一覧/i;

export const CUSTOMER_DETAIL_URL = /\/customers\/[0-9a-f-]{36}(?:\/|$|\?)/i;

export const INTERACTION_RECORD_DETAIL_URL =
    /\/customers\/[0-9a-f-]{36}\/interaction-records\/[0-9a-f-]{36}(?:\/|$|\?)/i;

export const INTERACTION_RECORD_LIST_URL =
    /\/customers\/[0-9a-f-]{36}\/interaction-records(?:\/|$|\?)/i;

export type CirsRecordIdentitySource = 'api_and_route' | 'route_only' | 'pending';

export type CirsRecordRunEvidence = {
    customerId: string;
    customerName: string;
    customerFurigana: string;
    recordId: string | null;
    recordUrl: string | null;
    createAttempted: boolean;
    createConfirmed: boolean;
    recordIdentitySource: CirsRecordIdentitySource;
    customerIdFromApi: string | null;
    apiParseNotes: string[];
};

export type CirsRecordContext = {
    customerId: string;
    customerName: string;
    customerFurigana: string;
    recordId: string;
    recordUrl: string;
    createAttempted: boolean;
    createConfirmed: boolean;
    recordIdentitySource: Exclude<CirsRecordIdentitySource, 'pending'>;
    customerIdFromApi: string | null;
    apiParseNotes: string[];
};

export type CirsRecordFlowEnvironment = {
    createRecordApiUrl?: string;
};

export const DEFAULT_CIRS_RECORD_ENV: CirsRecordFlowEnvironment = {
    createRecordApiUrl: CREATE_CUSTOMER_INTERACTION_RECORD_URL,
};

export class CirsRecordFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CirsRecordFlowError';
    }
}

/**
 * Locator evidence (trace 20261025-141358 + fetch_customer_services resource 5119f9ae…):
 * - List API: GET …/fetch_customer_services → JSON array ordered; navigate with entry.customerServiceId UUID.
 * - Customer 応対記録 rows: DIV row root with date column, author column, arrow column (IMG in nested child DIV).
 * - Row selection: evaluate {@link queryInteractionRecordRowElements} index ↔ API index (never date/author alone).
 * - Route after click: /customers/{customerId}/interaction-records/{customerServiceId}.
 * - Full list page: no populated list frame snapshot — visible row scope under `main` only (GAP).
 */
export const CIRS_LOCATOR_EVIDENCE = {
    listApi: 'GET customer_interaction_record/fetch_customer_services?customerId=…&orderBy=desc&limit=3',
    customerSectionRows:
        'assertUniqueInteractionRecordsSection → row DIV (date col + author col + arrow col with nested IMG)',
    fullListRows: FULL_LIST_ROW_DOM_EVIDENCE.populatedFullListDom,
    navigationIdField: 'customerServiceId (not numeric database id)',
    sectionListScoped:
        'assertUniqueInteractionRecordsSection → button name /list response report…一覧/ (.list-btn + icon alt)',
    backControl: '.back (legacy CIR.spec.ts)',
    collapsedProfileRole: 'button name 顧客情報を表示 (Part 2 CIRS — no expansion required)',
    sectionWrapper:
        'div/section containing 応対記録 heading, list response report 一覧 control, and rendered row dates (excludes 姿勢分析レポート)',
} as const;

export function parseCustomerIdFromUrl(url: string): string | null {
    const match = url.match(/\/customers\/([0-9a-f-]{36})/i);
    return match ? match[1] : null;
}

export function parseInteractionRecordIdFromUrl(url: string): string | null {
    const match = url.match(/\/interaction-records\/([0-9a-f-]{36})/i);
    return match ? match[1] : null;
}

export function isCreateInteractionRecordPost(
    response: Response,
    apiUrl = CREATE_CUSTOMER_INTERACTION_RECORD_URL
): boolean {
    if (response.request().method() !== 'POST') {
        return false;
    }
    const responseUrl = response.url().split('?')[0]?.split('#')[0] ?? '';
    return responseUrl === apiUrl;
}

function customersMain(page: Page): Locator {
    return page.getByRole('main');
}

/**
 * Legacy CIR.spec.ts uses `.back` for in-app back on record/list pages.
 * Accessible name is not literally "<".
 */
export function pageBackControl(page: Page): Locator {
    return page.locator('.back').locator('visible=true').first();
}

/**
 * Customer detail: one section containing 応対記録 heading, scoped 一覧 (icon alt + label), and row dates.
 * Header-only wrappers (heading + buttons without row host) fail the date filter.
 */
export function interactionRecordsSectionCandidates(main: Locator): Locator {
    // filter({ has }) must use page-scoped locators — main.getByRole inside `has` breaks containment (Playwright).
    const page = main.page();
    const scopedListButton = page.getByRole('button', {
        name: INTERACTION_RECORD_SECTION_LIST_BUTTON_NAME,
    });
    const byRegion = main
        .getByRole('region', { name: '応対記録', exact: true })
        .filter({ has: scopedListButton });
    const structural = main
        .locator('div, section')
        .filter({ has: page.getByText('応対記録', { exact: true }).locator('visible=true') })
        .filter({ has: scopedListButton })
        .filter({ hasNot: page.getByText('姿勢分析レポート', { exact: true }) })
        .filter({ hasText: INTERACTION_RECORD_ROW_DATE_PATTERN });
    return byRegion.or(structural);
}

export async function assertUniqueInteractionRecordsSection(main: Locator): Promise<Locator> {
    const sections = interactionRecordsSectionCandidates(main);
    await expect
        .poll(async () => sections.count(), {
            timeout: ACTION_TIMEOUT_MS,
            message: 'Waiting for exactly one 応対記録 section (heading, list control, and rendered rows).',
        })
        .toBe(1);
    return sections.first();
}

/** @deprecated Prefer {@link assertUniqueInteractionRecordsSection} — may match 0 or many. */
export function interactionRecordsSection(main: Locator): Locator {
    return interactionRecordsSectionCandidates(main).first();
}

export function interactionRecordSectionListControl(section: Locator): Locator {
    return section.getByRole('button', { name: INTERACTION_RECORD_SECTION_LIST_BUTTON_NAME });
}

function rethrowCustomerServicesError(error: unknown): never {
    if (error instanceof CirsRecordCustomerServicesError) {
        throw new CirsRecordFlowError(error.message);
    }
    throw error;
}

async function assertRenderedRowCountMatchesApi(
    rowScope: Locator,
    snapshot: CustomerServicesListSnapshot,
    contextLabel: string
): Promise<void> {
    const expected = snapshot.customerServiceIdsInApiOrder.length;
    if (expected === 0) {
        throw new CirsRecordFlowError(`${contextLabel}: fetch_customer_services returned an empty list.`);
    }
    await expectInteractionRecordRowCount(rowScope, expected, contextLabel);
}

async function assertInteractionRecordRowVisibleByCustomerServiceId(
    rowScope: Locator,
    customerServiceId: string,
    snapshot: CustomerServicesListSnapshot,
    contextLabel: string
): Promise<void> {
    let index: number;
    try {
        index = resolveCustomerServiceIndex(snapshot, customerServiceId);
    } catch (error) {
        rethrowCustomerServicesError(error);
    }
    await assertRenderedRowCountMatchesApi(rowScope, snapshot, contextLabel);
    await expect(interactionRecordRowLocators(rowScope).nth(index)).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function clickInteractionRecordRowByCustomerServiceId(
    page: Page,
    rowScope: Locator,
    customerId: string,
    customerServiceId: string,
    snapshot: CustomerServicesListSnapshot,
    contextLabel: string
): Promise<void> {
    let index: number;
    try {
        index = resolveCustomerServiceIndex(snapshot, customerServiceId);
    } catch (error) {
        rethrowCustomerServicesError(error);
    }
    await assertRenderedRowCountMatchesApi(rowScope, snapshot, contextLabel);
    await clickInteractionRecordRowAtIndex(rowScope, index);
    await expect(page).toHaveURL(INTERACTION_RECORD_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    const routeCustomerId = parseCustomerIdFromUrl(page.url());
    const routeServiceId = parseInteractionRecordIdFromUrl(page.url());
    if (routeServiceId !== customerServiceId) {
        throw new CirsRecordFlowError(
            `After ${contextLabel}, route record id != customerServiceId ${customerServiceId} (url=${page.url()}).`
        );
    }
    if (routeCustomerId !== customerId) {
        throw new CirsRecordFlowError(
            `After ${contextLabel}, reopened record is not under the same customer id ` +
                `(expected ${customerId}, got ${routeCustomerId ?? 'none'}; url=${page.url()}).`
        );
    }
}

export type CreateRecordApiIdentity = {
    recordId: string | null;
    customerId: string | null;
    notes: string[];
};

/**
 * Parses create-record POST response text: trimmed body must be exactly one UUID.
 * Staging does not return customerId in this response; validate customer via detail route.
 */
export function parseCreateRecordResponseBodyText(rawText: string): CreateRecordApiIdentity {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return {
            recordId: null,
            customerId: null,
            notes: ['empty_response_body'],
        };
    }
    if (!CREATE_RECORD_RESPONSE_UUID_BODY.test(trimmed)) {
        throw new CirsRecordFlowError(
            `Create record response body was not a single UUID (length=${trimmed.length}, ` +
                `preview=${JSON.stringify(trimmed.slice(0, 120))}).`
        );
    }
    return {
        recordId: trimmed,
        customerId: null,
        notes: ['customerId_not_in_response'],
    };
}

export async function consumeCreateRecordResponse(
    response: Response,
    env: CirsRecordFlowEnvironment,
    expectedCustomerId: string
): Promise<{
    recordIdFromApi: string | null;
    customerIdFromApi: string | null;
    httpStatus: number;
    identityNotes: string[];
}> {
    const apiUrl = env.createRecordApiUrl ?? CREATE_CUSTOMER_INTERACTION_RECORD_URL;
    const httpStatus = response.status();
    if (!isCreateInteractionRecordPost(response, apiUrl)) {
        throw new CirsRecordFlowError(
            `Unexpected create-record response: ${response.request().method()} ${response.url()} status=${httpStatus}`
        );
    }
    if (httpStatus < 200 || httpStatus >= 300) {
        let detail = '';
        try {
            detail = (await response.text()).slice(0, 500);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            detail = `(failed to read error body: ${message})`;
        }
        throw new CirsRecordFlowError(`Create record POST failed: status=${httpStatus} body=${detail}`);
    }

    const contentType = response.headers()['content-type'] ?? '';
    const contentLength = response.headers()['content-length'];
    if (httpStatus === 204 || contentLength === '0') {
        return {
            recordIdFromApi: null,
            customerIdFromApi: null,
            httpStatus,
            identityNotes: ['empty_body_http_no_json_identity'],
        };
    }

    if (!contentType.includes('json')) {
        throw new CirsRecordFlowError(
            `Create record POST returned success without JSON content-type: ${contentType || '(missing)'}`
        );
    }

    let rawText: string;
    try {
        rawText = await response.text();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CirsRecordFlowError(`Create record POST response text read failed: ${message}`);
    }

    const parsed = parseCreateRecordResponseBodyText(rawText);
    if (parsed.customerId && parsed.customerId !== expectedCustomerId) {
        throw new CirsRecordFlowError(
            `Create record API customerId (${parsed.customerId}) != expected customer (${expectedCustomerId}).`
        );
    }

    return {
        recordIdFromApi: parsed.recordId,
        customerIdFromApi: parsed.customerId,
        httpStatus,
        identityNotes: parsed.notes,
    };
}

/** Part 2 CIRS: customer details stay collapsed; profile editing expansion is Part 1 only. */
export async function assertCustomerDetailsCollapsedForCirs(main: Locator): Promise<void> {
    await expect(main.getByRole('button', { name: '顧客情報を表示' })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(main.getByRole('button', { name: /顧客情報を非表示/ })).toBeHidden({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function assertCustomerPageReadyForCirsRecord(
    page: Page,
    customerId: string,
    customerName: string,
    customerFurigana: string
): Promise<Locator> {
    await assertSameCustomerOnDetailPage(page, customerId, customerName, customerFurigana);
    const main = customersMain(page);
    await assertCustomerDetailsCollapsedForCirs(main);
    await assertUniqueInteractionRecordsSection(main);
    return main;
}

async function assertSameCustomerOnDetailPage(
    page: Page,
    customerId: string,
    customerName: string,
    customerFurigana: string
): Promise<void> {
    await expect(page).toHaveURL(new RegExp(`/customers/${customerId}(?:/|$|\\?)`, 'i'), {
        timeout: NAVIGATION_TIMEOUT_MS,
    });
    await assertSelectedCustomerIdentity(page, customerName, customerFurigana);
}

export async function assertCustomerSectionTopRecordMatchesServiceId(
    section: Locator,
    snapshot: CustomerServicesListSnapshot,
    expectedCustomerServiceId: string
): Promise<void> {
    const apiTop = snapshot.customerServiceIdsInApiOrder[0];
    if (apiTop !== expectedCustomerServiceId) {
        throw new CirsRecordFlowError(
            `fetch_customer_services first entry (${apiTop ?? 'none'}) != expected customerServiceId (${expectedCustomerServiceId}).`
        );
    }
    await assertRenderedRowCountMatchesApi(section, snapshot, 'customer 応対記録 section (top-of-list)');
    await assertInteractionRecordRowVisibleByCustomerServiceId(
        section,
        expectedCustomerServiceId,
        snapshot,
        'customer 応対記録 section (top-of-list)'
    );
}

export function cirsEvidenceAttachmentBody(
    evidence: CirsRecordRunEvidence | CirsRecordContext
): string {
    return JSON.stringify(evidence, null, 2);
}

export type RunCirsRecordFlowOptions = {
    env?: CirsRecordFlowEnvironment;
    /** When set, skip phonebook open (already on customer detail). */
    existingCustomer?: OpenCustomerFromPhonebookEvidence;
    /** Called whenever safe partial context is updated (success or failure paths). */
    onEvidence?: (evidence: CirsRecordRunEvidence) => void;
};

export type CirsExistingRecordVerificationInput = {
    customerId: string;
    recordId: string;
    customerName: string;
    customerFurigana: string;
    /** Defaults to STG_APP_ORIGIN from login flow when omitted in spec. */
    appOrigin?: string;
};

export type RunCirsRecordVerificationOptions = {
    onEvidence?: (evidence: CirsRecordRunEvidence) => void;
};

async function executeCirsRecordDetailListNavigationCycle(
    page: Page,
    customerId: string,
    customerName: string,
    customerFurigana: string,
    customerServiceId: string,
    servicesCapture: CustomerServicesCapture
): Promise<string> {
    const main = customersMain(page);

    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const backFromRecord = pageBackControl(page);
    await expect(backFromRecord).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const snapshotAfterRecordBackPromise = servicesCapture.waitForSnapshot({
        fresh: true,
        kind: 'customer_preview',
    });
    await backFromRecord.click({ timeout: ACTION_TIMEOUT_MS });

    await assertCustomerPageReadyForCirsRecord(page, customerId, customerName, customerFurigana);

    const section = await assertUniqueInteractionRecordsSection(main);

    let snapshotAfterRecordBack: CustomerServicesListSnapshot;
    try {
        snapshotAfterRecordBack = await snapshotAfterRecordBackPromise;
    } catch (error) {
        rethrowCustomerServicesError(error);
    }
    await assertCustomerSectionTopRecordMatchesServiceId(
        section,
        snapshotAfterRecordBack,
        customerServiceId
    );

    const sectionList = interactionRecordSectionListControl(section);
    await expect(sectionList).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const snapshotOnFullListPromise = servicesCapture.waitForSnapshot({ fresh: true, kind: 'full_list' });
    await sectionList.click({ timeout: ACTION_TIMEOUT_MS });

    await expect(page).toHaveURL(INTERACTION_RECORD_LIST_URL, { timeout: NAVIGATION_TIMEOUT_MS });
    await expect(page).not.toHaveURL(INTERACTION_RECORD_DETAIL_URL);
    await expect(
        page.getByText(customerName, { exact: false }).filter({ hasText: INTERACTION_RECORD_LIST_TITLE_SUFFIX })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    let snapshotOnFullList: CustomerServicesListSnapshot;
    try {
        snapshotOnFullList = await snapshotOnFullListPromise;
    } catch (error) {
        rethrowCustomerServicesError(error);
    }
    const listRowScope = interactionRecordRowScopeOnFullListPage(page);
    try {
        await assertInteractionRecordRowVisibleByCustomerServiceId(
            listRowScope,
            customerServiceId,
            snapshotOnFullList,
            'full 応対記録 list'
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CirsRecordFlowError(
            `${message}\n` +
                `Full-list row DOM on staging is ${FULL_LIST_ROW_DOM_EVIDENCE.populatedFullListDom}. ` +
                `Fixture uses ${FULL_LIST_ROW_DOM_EVIDENCE.fixtureListPanelId}. ` +
                `API snapshot request=${snapshotOnFullList.requestUrl}; ` +
                `index↔DOM order remains ${FETCH_CUSTOMER_SERVICES_ORDER_EVIDENCE.uiRenderOrderMapping}.`
        );
    }

    const backFromList = pageBackControl(page);
    await expect(backFromList).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const snapshotBeforeReopenPromise = servicesCapture.waitForSnapshot({
        fresh: true,
        kind: 'customer_preview',
    });
    await backFromList.click({ timeout: ACTION_TIMEOUT_MS });

    await assertCustomerPageReadyForCirsRecord(page, customerId, customerName, customerFurigana);

    let snapshotBeforeReopen: CustomerServicesListSnapshot;
    try {
        snapshotBeforeReopen = await snapshotBeforeReopenPromise;
    } catch (error) {
        rethrowCustomerServicesError(error);
    }
    const reopenSection = await assertUniqueInteractionRecordsSection(main);
    await clickInteractionRecordRowByCustomerServiceId(
        page,
        reopenSection,
        customerId,
        customerServiceId,
        snapshotBeforeReopen,
        'reopen from customer 応対記録 section'
    );

    await expect(
        page.getByText(INTERACTION_RECORD_DETAIL_TITLE, { exact: true }).locator('visible=true').first()
    ).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });

    return page.url();
}

/**
 * Verification-only: open an existing record and run list/navigation checks without 新規応対.
 * Fails if the record detail cannot be opened; never creates a replacement record.
 */
export async function runCirsRecordListNavigationVerification(
    page: Page,
    input: CirsExistingRecordVerificationInput,
    options?: RunCirsRecordVerificationOptions
): Promise<CirsRecordContext> {
    const appOrigin = input.appOrigin ?? 'https://app-stg.epose.com';
    const customerDetailUrl = `${appOrigin}/customers/${input.customerId}`;

    const evidence: CirsRecordRunEvidence = {
        customerId: input.customerId,
        customerName: input.customerName,
        customerFurigana: input.customerFurigana,
        recordId: input.recordId,
        recordUrl: null,
        createAttempted: false,
        createConfirmed: true,
        recordIdentitySource: 'route_only',
        customerIdFromApi: null,
        apiParseNotes: ['verification_only_existing_record'],
    };

    const publishEvidence = (): void => {
        options?.onEvidence?.({ ...evidence });
    };
    publishEvidence();

    await assertCustomerFlowNotBlocked(page);

    const servicesCapture = beginFetchCustomerServicesCapture(page, input.customerId);

    try {
        await page.goto(customerDetailUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

        const main = await assertCustomerPageReadyForCirsRecord(
            page,
            input.customerId,
            input.customerName,
            input.customerFurigana
        );

        const section = await assertUniqueInteractionRecordsSection(main);

        let snapshot: CustomerServicesListSnapshot;
        try {
            snapshot = await servicesCapture.waitForSnapshot({ kind: 'customer_preview' });
        } catch (error) {
            rethrowCustomerServicesError(error);
        }

        await clickInteractionRecordRowByCustomerServiceId(
            page,
            section,
            input.customerId,
            input.recordId,
            snapshot,
            'open existing record from customer 応対記録 section'
        );

        await expect(
            page.getByText(INTERACTION_RECORD_DETAIL_TITLE, { exact: true }).locator('visible=true').first()
        ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

        evidence.recordUrl = page.url();
        publishEvidence();

        const finalUrl = await executeCirsRecordDetailListNavigationCycle(
            page,
            input.customerId,
            input.customerName,
            input.customerFurigana,
            input.recordId,
            servicesCapture
        );
        evidence.recordUrl = finalUrl;
        publishEvidence();

        return {
            customerId: input.customerId,
            customerName: input.customerName,
            customerFurigana: input.customerFurigana,
            recordId: input.recordId,
            recordUrl: finalUrl,
            createAttempted: false,
            createConfirmed: true,
            recordIdentitySource: 'route_only',
            customerIdFromApi: null,
            apiParseNotes: evidence.apiParseNotes,
        };
    } finally {
        servicesCapture.dispose();
    }
}

/**
 * Creates one interaction record via 新規応対, verifies list placement and navigation, and ends on the record detail page.
 * Does not enter response text — legacy/staging opens detail with empty textbox (record persisted on create navigation).
 */
export async function runCirsRecordCreationAndListNavigation(
    page: Page,
    options?: RunCirsRecordFlowOptions
): Promise<CirsRecordContext> {
    const env = options?.env ?? DEFAULT_CIRS_RECORD_ENV;
    const apiUrl = env.createRecordApiUrl ?? CREATE_CUSTOMER_INTERACTION_RECORD_URL;
    let createClicked = false;

    await assertCustomerFlowNotBlocked(page);
    if (options?.existingCustomer) {
        /* Caller prepared customer detail; list-shell marker not required. */
    } else {
        await assertCustomersListInitReady(page);
    }

    let customer: OpenCustomerFromPhonebookEvidence;
    if (options?.existingCustomer) {
        customer = options.existingCustomer;
        if (!customer.customerId) {
            throw new CirsRecordFlowError('existingCustomer.customerId is required.');
        }
        await assertCustomerPageReadyForCirsRecord(
            page,
            customer.customerId,
            customer.name,
            customer.furigana
        );
    } else {
        const opened = await openFirstCustomerInDisplayedOrder(page);
        if (!opened.customerId) {
            throw new CirsRecordFlowError('First customer open did not yield a customer id.');
        }
        customer = opened;
        await assertCustomerPageReadyForCirsRecord(
            page,
            opened.customerId,
            opened.name,
            opened.furigana
        );
    }

    const customerName = customer.name;
    const customerFurigana = customer.furigana;
    const customerId = customer.customerId!;

    const evidence: CirsRecordRunEvidence = {
        customerId,
        customerName,
        customerFurigana,
        recordId: null,
        recordUrl: null,
        createAttempted: false,
        createConfirmed: false,
        recordIdentitySource: 'pending',
        customerIdFromApi: null,
        apiParseNotes: [],
    };

    const publishEvidence = (): void => {
        options?.onEvidence?.({ ...evidence });
    };

    publishEvidence();

    const servicesCapture = beginFetchCustomerServicesCapture(page, customerId);
    try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
        await expect(page).toHaveURL(new RegExp(`/customers/${customerId}(?:/|$|\\?)`, 'i'), {
            timeout: NAVIGATION_TIMEOUT_MS,
        });
        await assertSelectedCustomerIdentity(page, customerName, customerFurigana);
        const mainAfterReload = customersMain(page);
        await assertCustomerDetailsCollapsedForCirs(mainAfterReload);
        const previewSnapshotPromise = servicesCapture.waitForSnapshot({ kind: 'customer_preview' });
        await assertUniqueInteractionRecordsSection(mainAfterReload);
        try {
            await previewSnapshotPromise;
        } catch (error) {
            rethrowCustomerServicesError(error);
        }

        const main = customersMain(page);
        const newRecordButton = main.getByRole('button', {
            name: NEW_CUSTOMER_SERVICE_BUTTON_NAME,
            exact: true,
        });
        await expect(newRecordButton).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

        const createResponsePromise = page.waitForResponse(
            (res) => isCreateInteractionRecordPost(res, apiUrl),
            { timeout: NAVIGATION_TIMEOUT_MS }
        );

        await newRecordButton.click({ timeout: ACTION_TIMEOUT_MS });
        createClicked = true;
        evidence.createAttempted = true;
        publishEvidence();

        const createResponse = await createResponsePromise;
        const { recordIdFromApi, customerIdFromApi, httpStatus, identityNotes } =
            await consumeCreateRecordResponse(createResponse, env, customerId);
        evidence.customerIdFromApi = customerIdFromApi;
        evidence.apiParseNotes = identityNotes;

        await expect(page).toHaveURL(INTERACTION_RECORD_DETAIL_URL, { timeout: NAVIGATION_TIMEOUT_MS });
        await expect(
            page.getByText(INTERACTION_RECORD_DETAIL_TITLE, { exact: true }).locator('visible=true').first()
        ).toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });

        const recordUrl = page.url();
        const recordIdFromRoute = parseInteractionRecordIdFromUrl(recordUrl);
        if (!recordIdFromRoute) {
            throw new CirsRecordFlowError(`Record detail URL did not contain a record UUID: ${recordUrl}`);
        }
        if (recordIdFromApi && recordIdFromApi !== recordIdFromRoute) {
            throw new CirsRecordFlowError(
                `Create-record API UUID (${recordIdFromApi}) did not match route id (${recordIdFromRoute}); status=${httpStatus}`
            );
        }

        const recordId = recordIdFromRoute;
        evidence.recordId = recordId;
        evidence.recordUrl = recordUrl;
        evidence.createConfirmed = true;
        evidence.recordIdentitySource = recordIdFromApi ? 'api_and_route' : 'route_only';
        if (!recordIdFromApi) {
            evidence.apiParseNotes = [...evidence.apiParseNotes, 'record_identity_from_route_only'];
        }
        publishEvidence();

        const customerIdOnRecord = parseCustomerIdFromUrl(recordUrl);
        if (customerIdOnRecord !== customerId) {
            throw new CirsRecordFlowError(
                `Record detail customer id ${customerIdOnRecord} != expected ${customerId}`
            );
        }

        evidence.recordUrl = await executeCirsRecordDetailListNavigationCycle(
            page,
            customerId,
            customerName,
            customerFurigana,
            recordId,
            servicesCapture
        );

        if (!createClicked) {
            throw new CirsRecordFlowError('Internal error: 新規応対 was not clicked exactly once.');
        }

        publishEvidence();

        return {
            customerId,
            customerName,
            customerFurigana,
            recordId,
            recordUrl: evidence.recordUrl!,
            createAttempted: evidence.createAttempted,
            createConfirmed: evidence.createConfirmed,
            recordIdentitySource:
                evidence.recordIdentitySource === 'api_and_route' ? 'api_and_route' : 'route_only',
            customerIdFromApi: evidence.customerIdFromApi,
            apiParseNotes: evidence.apiParseNotes,
        };
    } finally {
        servicesCapture.dispose();
    }
}
