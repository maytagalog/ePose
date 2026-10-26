import { expect, test, type Locator, type Page } from '@playwright/test';

const ACTION_TIMEOUT_MS = 15000;
const CUSTOMERS_INIT_TIMEOUT_MS = 30000;
const POST_SAVE_DIALOG_TIMEOUT_MS = 30000;

const CUSTOMER_ID_URL = /\/customers\/[0-9a-f-]{36}(?:\/|$|\?)/i;
const CUSTOMERS_LIST_URL = /\/customers\/?(?:\?|$)/;

/** Verified staging bundle + network (2026-10-23). */
const KARTE_CUSTOMER_API_URL = 'https://api-stg.epose.com/karte/customer';
const KARTE_DELETE_API_URL = 'https://api-stg.epose.com/karte/delete';

export type KarteApiErrorBody = {
    errors?: Array<{
        message?: string;
        extensions?: { errorCode?: string; statusCode?: number };
    }>;
};

export type KarteCustomerRecord = {
    id?: string;
    fullName?: string;
    furiganaFullName?: string;
};

/** Fixed profile fields reused across E2E and accountRegistration smoke. */
export const DEFAULT_CUSTOMER_PROFILE = {
    heightCm: '142',
    sex: '男性',
    birthday: { year: '2002', month: '11', day: '16' },
    birthdayDisplay: '2002/11/16',
    heightDisplay: '142 cm',
} as const;

/** Verified edit smoke: name suffix and height change (staging /customers/{id}/edit). */
export const EDIT_CUSTOMER_UPDATES = {
    nameSuffix: ' Edited',
    heightCm: '150',
    heightDisplay: '150 cm',
} as const;

export type CustomerProfileExpectations = {
    heightDisplay: string;
};

/**
 * Plain data for later Edit/Delete. `customerId` is set only after the selected
 * customer view shows this run's exact name and furigana (URL + main heading).
 */
export type CreatedCustomerRef = {
    /** 氏名 (textbox index 1 on /customers/create). */
    name: string;
    /** フリガナ (textbox index 2, required kana). */
    furigana: string;
    customerId: string | null;
};

export type CustomerFlowEvidence = {
    attachJson: (name: string, data: unknown) => Promise<void>;
    attachScreenshot: (name: string) => Promise<void>;
    attachPageHtml: (name: string) => Promise<void>;
};

export function generateUniqueCustomerName(prefix = 'E2E Customer'): string {
    return `${prefix} ${Date.now()}`;
}

const KANA_SYLLABLES =
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

/** Kana-only フリガナ (no ASCII / full-width digits). */
export function generateUniqueFurigana(prefix = 'テスト'): string {
    let suffix = '';
    let seed = Date.now();
    for (let i = 0; i < 8; i++) {
        suffix += KANA_SYLLABLES[seed % KANA_SYLLABLES.length];
        seed = Math.floor(seed / KANA_SYLLABLES.length) + i;
    }
    return `${prefix}${suffix}`;
}

function customerRegistrationRoot(page: Page) {
    return page.locator('form').filter({
        has: page.getByRole('button', { name: '保 存' }),
    });
}

/**
 * Verified /customers/create textbox order (position-2 account, 2026-10-23):
 * 0 管理番号【任意】, 1 氏名【任意】, 2 フリガナ【必須】, 3 telephoneNumber, …
 */
function customerFormTextbox(root: ReturnType<typeof customerRegistrationRoot>, index: number) {
    return root.getByRole('textbox').nth(index);
}

function customersMain(page: Page) {
    return page.getByRole('main');
}

function customerPhonebookPane(page: Page) {
    return page.locator('div').filter({ has: page.getByRole('tablist') });
}

async function customersListInitSettled(page: Page): Promise<boolean> {
    if (await page.getByText('顧客情報がありません').isVisible().catch(() => false)) {
        return true;
    }
    if (
        await page
            .getByText('お客様を選択してください')
            .isVisible()
            .catch(() => false)
    ) {
        return true;
    }
    const enabledTabCount = await page
        .getByRole('tablist')
        .locator('[role="tab"]:not([disabled])')
        .count()
        .catch(() => 0);
    if (enabledTabCount > 0) {
        return true;
    }
    if (CUSTOMER_ID_URL.test(page.url())) {
        const headingCount = await customersMain(page)
            .getByRole('heading', { level: 3 })
            .count()
            .catch(() => 0);
        return headingCount > 0;
    }
    return false;
}

/**
 * Pre-creation: account/customer list initialization finished; safe to open 新規登録.
 * Does not require empty-list copy when customers already exist.
 */
export async function assertCustomersListInitReady(page: Page): Promise<void> {
    await expect(page).toHaveURL(/\/customers(?:\/[0-9a-f-]{36})?\/?(?:\?|$)/i, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(
        page.locator('.btn-label').filter({ hasText: '新規登録' })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(
        page.getByText('オンラインで使い方の説明を受ける')
    ).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    await expect
        .poll(async () => customersListInitSettled(page), {
            timeout: CUSTOMERS_INIT_TIMEOUT_MS,
            intervals: [250, 500, 1000],
            message:
                'Customer list initialization did not reach a verified ready state',
        })
        .toBe(true);
}

/** @deprecated Use assertCustomersListInitReady. */
export async function assertCustomersAppReady(page: Page): Promise<void> {
    await assertCustomersListInitReady(page);
}

/** @deprecated Use assertCustomersListInitReady. */
export async function assertCustomerListReady(page: Page): Promise<void> {
    await assertCustomersListInitReady(page);
}

/**
 * Selected customer on /customers/{id}: exact 氏名 + フリガナ in main (profile may be collapsed or expanded).
 */
export async function assertSelectedCustomerIdentity(
    page: Page,
    customerName: string,
    furigana: string
): Promise<void> {
    await expect(page).toHaveURL(CUSTOMER_ID_URL, {
        timeout: ACTION_TIMEOUT_MS,
    });
    const main = customersMain(page);
    await expect(
        main.getByRole('heading', {
            level: 3,
            name: customerName,
            exact: true,
        })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(main.getByText(furigana, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

/**
 * Identity plus verified profile toggle: collapsed (顧客情報を表示) or expanded (顧客情報を非表示).
 */
export async function assertSelectedCustomerReady(
    page: Page,
    customerName: string,
    furigana: string
): Promise<void> {
    await assertSelectedCustomerIdentity(page, customerName, furigana);
    const main = customersMain(page);
    const showProfile = main.getByRole('button', { name: '顧客情報を表示' });
    const hideProfile = main.getByRole('button', { name: /顧客情報を非表示/ });
    await expect(showProfile.or(hideProfile)).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

/** Setup only: expand inline customer profile when 顧客情報を表示 is shown. */
export async function expandCustomerProfileIfCollapsed(page: Page): Promise<void> {
    const main = customersMain(page);
    await ensureCustomerProfileExpanded(main, page);
}

async function ensureCustomerProfileExpanded(main: Locator, page: Page): Promise<void> {
    const showProfileButton = main.getByRole('button', {
        name: '顧客情報を表示',
    });
    const hideProfileButton = main.getByRole('button', {
        name: /顧客情報を非表示/,
    });
    if (await showProfileButton.isVisible().catch(() => false)) {
        await assertNoRegistrationCompleteDialogBlocking(page);
        await showProfileButton.click({ timeout: ACTION_TIMEOUT_MS });
    }
    await expect(hideProfileButton).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}

export class CustomerFlowBlockedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CustomerFlowBlockedError';
    }
}

export class CustomerRowResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CustomerRowResolutionError';
    }
}

export class CustomerEditPreconditionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CustomerEditPreconditionError';
    }
}

export class CustomerDeletePreconditionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CustomerDeletePreconditionError';
    }
}

export class CustomerDeleteVerificationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CustomerDeleteVerificationError';
    }
}

export async function assertCustomerFlowNotBlocked(
    page: Page
): Promise<void> {
    if (
        await page
            .getByText('オンラインで使い方の説明を受ける')
            .isVisible()
            .catch(() => false)
    ) {
        throw new CustomerFlowBlockedError(
            'Online Booking onboarding overlay is blocking /customers. ' +
                'This test will not skip onboarding or cancel bookings.'
        );
    }
}

function parseCustomerIdFromUrl(url: string): string | null {
    const match = url.match(/\/customers\/([0-9a-f-]{36})/i);
    if (!match) {
        return null;
    }
    return match[1];
}

/** Verified post-save modal (staging trace 2026-10-23): role dialog name 登録完了. */
export function registrationCompleteDialog(page: Page) {
    return page.getByRole('dialog', { name: '登録完了' });
}

async function isVisibleAntModalWrap(page: Page): Promise<boolean> {
    const wraps = page.locator('.ant-modal-wrap');
    const count = await wraps.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
        if (await wraps.nth(i).isVisible().catch(() => false)) {
            return true;
        }
    }
    return false;
}

async function dismissRegistrationCompleteDialog(page: Page): Promise<void> {
    const dialog = registrationCompleteDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog).toContainText('このまま姿勢分析を開始しますか？');
    await dialog.getByText('顧客一覧へもどる', { exact: true }).click({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    await expect
        .poll(async () => !(await isVisibleAntModalWrap(page)), {
            timeout: ACTION_TIMEOUT_MS,
            intervals: [50, 100, 250],
            message:
                'Expected ant-modal-wrap overlay to disappear after 顧客一覧へもどる',
        })
        .toBe(true);
}

export async function assertNoRegistrationCompleteDialogBlocking(
    page: Page
): Promise<void> {
    await expect(registrationCompleteDialog(page)).toBeHidden({
        timeout: ACTION_TIMEOUT_MS,
    });
    if (await isVisibleAntModalWrap(page)) {
        const registrationWrap = page
            .locator('.ant-modal-wrap')
            .filter({ has: page.getByText('登録完了') });
        await expect(registrationWrap).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    }
}

/**
 * After 保 存 (verified staging): wait for 登録完了 even when /customers/{id}
 * is already loaded behind the modal, dismiss via 顧客一覧へもどる, then clear overlay.
 */
export async function handlePostSaveRegistrationOutcome(
    page: Page
): Promise<void> {
    const dialog = registrationCompleteDialog(page);
    await dialog.waitFor({ state: 'visible', timeout: POST_SAVE_DIALOG_TIMEOUT_MS });
    await dismissRegistrationCompleteDialog(page);
    await assertNoRegistrationCompleteDialogBlocking(page);
}

async function selectCustomerFromPhonebook(
    page: Page,
    customerName: string,
    furigana: string,
    evidence?: CustomerFlowEvidence
): Promise<void> {
    const phonebook = customerPhonebookPane(page);
    await expect(phonebook).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const nameEntries = phonebook.getByText(customerName, { exact: true });
    const count = await nameEntries.count();
    if (count !== 1) {
        if (evidence) {
            await evidence.attachScreenshot('phonebook-resolution-failure');
            await evidence.attachPageHtml('phonebook-resolution-failure-dom');
        }
        throw new CustomerRowResolutionError(
            `Expected exactly one phonebook entry for 氏名 "${customerName}", found ${count}.`
        );
    }

    await nameEntries.click({ timeout: ACTION_TIMEOUT_MS });
    await assertSelectedCustomerReady(page, customerName, furigana);
    await expect(customersMain(page).getByText(furigana, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function assertCustomerProfileTable(
    main: Locator,
    profile: CustomerProfileExpectations = DEFAULT_CUSTOMER_PROFILE
): Promise<void> {
    const profileTable = main.locator('table');
    await expect(profileTable).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(
        profileTable.getByRole('cell', { name: /2002\/11\/16/ })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(
        profileTable.getByRole('cell', { name: profile.heightDisplay, exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(
        profileTable.getByRole('cell', {
            name: DEFAULT_CUSTOMER_PROFILE.sex,
            exact: true,
        })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}

/**
 * Opens 顧客情報を表示 in main (inline profile table, not a dialog) and verifies
 * saved profile fields for this customer identity.
 */
export async function openCustomerProfileAndVerify(
    page: Page,
    customerName: string,
    furigana: string,
    evidence?: CustomerFlowEvidence,
    profile: CustomerProfileExpectations = DEFAULT_CUSTOMER_PROFILE
): Promise<CreatedCustomerRef> {
    await assertNoRegistrationCompleteDialogBlocking(page);
    await assertSelectedCustomerReady(page, customerName, furigana);
    const customerId = parseCustomerIdFromUrl(page.url());

    const main = customersMain(page);
    await ensureCustomerProfileExpanded(main, page);
    await assertCustomerProfileTable(main, profile);

    if (evidence) {
        await evidence.attachScreenshot('customer-profile-panel');
        await evidence.attachPageHtml('customer-profile-panel-dom');
    }

    const ref: CreatedCustomerRef = {
        name: customerName,
        furigana,
        customerId,
    };
    return ref;
}

export async function openSelectedCustomerByRef(
    page: Page,
    customerRef: CreatedCustomerRef
): Promise<void> {
    if (!customerRef.customerId) {
        throw new CustomerEditPreconditionError(
            'customerRef.customerId is required to open a customer by ID'
        );
    }
    const detailPath = `/customers/${customerRef.customerId}`;
    if (!page.url().includes(customerRef.customerId)) {
        await page.goto(`https://app-stg.epose.com${detailPath}`, {
            waitUntil: 'domcontentloaded',
        });
    }
    await assertNoRegistrationCompleteDialogBlocking(page);
    await assertCustomersListInitReady(page);
    await assertSelectedCustomerReady(
        page,
        customerRef.name,
        customerRef.furigana
    );
    await expect(parseCustomerIdFromUrl(page.url())).toBe(customerRef.customerId);
}

async function openCustomerEditForm(page: Page, customerId: string) {
    const main = customersMain(page);
    await assertNoRegistrationCompleteDialogBlocking(page);
    const submenu = main
        .locator('button')
        .filter({ has: page.getByRole('img', { name: 'submenu' }) });
    await expect(submenu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await submenu.click({ timeout: ACTION_TIMEOUT_MS });
    const editControl = page
        .getByRole('menuitem', { name: '編集' })
        .or(page.getByText('編集', { exact: true }));
    await expect(editControl.first()).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await editControl.first().click({ timeout: ACTION_TIMEOUT_MS });
    await expect(page).toHaveURL(
        new RegExp(`/customers/${customerId}/edit(?:\\?|$)`),
        { timeout: ACTION_TIMEOUT_MS }
    );
    const root = customerRegistrationRoot(page);
    await expect(root.getByRole('button', { name: '保 存' })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    return root;
}

async function verifyEditedCustomerPersistenceAfterReload(
    page: Page,
    customerId: string,
    editedName: string,
    furigana: string,
    editedProfile: CustomerProfileExpectations,
    evidence?: CustomerFlowEvidence
): Promise<CreatedCustomerRef> {
    await page.goto('https://app-stg.epose.com/customers', {
        waitUntil: 'domcontentloaded',
    });
    await assertNoRegistrationCompleteDialogBlocking(page);
    await assertCustomersListInitReady(page);

    await page.goto(`https://app-stg.epose.com/customers/${customerId}`, {
        waitUntil: 'domcontentloaded',
    });
    await assertNoRegistrationCompleteDialogBlocking(page);
    await assertCustomersListInitReady(page);

    const reloadedRef = await openCustomerProfileAndVerify(
        page,
        editedName,
        furigana,
        evidence,
        editedProfile
    );
    expect(reloadedRef.customerId).toBe(customerId);
    return { name: editedName, furigana, customerId };
}

async function waitForEditSaveOutcome(page: Page, customerId: string): Promise<void> {
    const escapedId = customerId.replace(/-/g, '\\-');
    await expect(page).not.toHaveURL(/\/edit/, { timeout: 30000 });
    await expect(page).toHaveURL(
        new RegExp(`/customers/${escapedId}(?:/|$|\\?)`),
        { timeout: 30000 }
    );
    await assertNoRegistrationCompleteDialogBlocking(page);
    await expect(registrationCompleteDialog(page)).toBeHidden({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function setCustomerFormHeight(
    page: Page,
    root: ReturnType<typeof customerRegistrationRoot>,
    heightCm: string
): Promise<void> {
    const heightTrigger = root.locator(
        '.ant-select.number-select .ant-select-selector'
    );
    await expect(heightTrigger).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await heightTrigger.click({ timeout: ACTION_TIMEOUT_MS });
    await page.getByRole('option', { name: heightCm }).click({
        timeout: ACTION_TIMEOUT_MS,
    });
}

export async function editCustomerAndVerifyDetails(
    page: Page,
    customerRef: CreatedCustomerRef,
    evidence?: CustomerFlowEvidence
): Promise<CreatedCustomerRef> {
    if (!customerRef.customerId) {
        throw new CustomerEditPreconditionError(
            'editCustomerAndVerifyDetails requires customerRef.customerId from Add Customer'
        );
    }
    const customerId = customerRef.customerId;

    const editedName = `${customerRef.name}${EDIT_CUSTOMER_UPDATES.nameSuffix}`;
    const editedProfile: CustomerProfileExpectations = {
        heightDisplay: EDIT_CUSTOMER_UPDATES.heightDisplay,
    };

    await test.step('edit customer: open selected customer by ID', async () => {
        await openSelectedCustomerByRef(page, customerRef);
    });

    await test.step('edit customer: verify profile before edit (142 cm)', async () => {
        await openCustomerProfileAndVerify(
            page,
            customerRef.name,
            customerRef.furigana,
            evidence,
            DEFAULT_CUSTOMER_PROFILE
        );
    });

    let root: ReturnType<typeof customerRegistrationRoot>;

    await test.step('edit customer: open edit form', async () => {
        root = await openCustomerEditForm(page, customerId);
    });

    await test.step('edit customer: verify starting form values', async () => {
        const legalNameField = customerFormTextbox(root!, 1);
        const furiganaField = customerFormTextbox(root!, 2);
        await expect(legalNameField).toHaveValue(customerRef.name, {
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(furiganaField).toHaveValue(customerRef.furigana, {
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(
            root!.locator('.ant-select.number-select .ant-select-selection-item')
        ).toContainText(DEFAULT_CUSTOMER_PROFILE.heightCm, {
            timeout: ACTION_TIMEOUT_MS,
        });
    });

    await test.step('edit customer: apply name and height updates', async () => {
        const legalNameField = customerFormTextbox(root!, 1);
        await legalNameField.fill(editedName, { timeout: ACTION_TIMEOUT_MS });
        await expect(legalNameField).toHaveValue(editedName);
        await setCustomerFormHeight(
            page,
            root!,
            EDIT_CUSTOMER_UPDATES.heightCm
        );
    });

    const editIntent = {
        customerId,
        from: {
            name: customerRef.name,
            furigana: customerRef.furigana,
            heightDisplay: DEFAULT_CUSTOMER_PROFILE.heightDisplay,
        },
        to: {
            name: editedName,
            furigana: customerRef.furigana,
            heightDisplay: EDIT_CUSTOMER_UPDATES.heightDisplay,
        },
    };
    console.log('EDIT_CUSTOMER_INTENT', JSON.stringify(editIntent));
    if (evidence) {
        await evidence.attachJson('EDIT_CUSTOMER_INTENT', editIntent);
    }

    await test.step('edit customer: save once', async () => {
        const saveButton = root!.getByRole('button', { name: '保 存' });
        await expect(saveButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
        await saveButton.click({ timeout: ACTION_TIMEOUT_MS });
        await waitForEditSaveOutcome(page, customerId);
        if (evidence) {
            await evidence.attachScreenshot('after-edit-save');
            await evidence.attachPageHtml('after-edit-save-dom');
        }
    });

    let updatedRef: CreatedCustomerRef;

    await test.step('edit customer: verify persistence after reload (150 cm)', async () => {
        updatedRef = await verifyEditedCustomerPersistenceAfterReload(
            page,
            customerId,
            editedName,
            customerRef.furigana,
            editedProfile,
            evidence
        );
    });

    console.log('UPDATED_CUSTOMER_REF', JSON.stringify(updatedRef!));
    if (evidence) {
        await evidence.attachJson('UPDATED_CUSTOMER_REF', updatedRef!);
    }

    return updatedRef!;
}

/** Verified delete confirm (staging 2026-10-23): dialog contains 顧客情報の削除. */
export function customerDeleteConfirmationDialog(page: Page) {
    return page.getByRole('dialog').filter({ hasText: '顧客情報の削除' });
}

export async function verifyDeleteConfirmationDialogIdentity(
    dialog: Locator,
    customerRef: CreatedCustomerRef
): Promise<void> {
    await expect(dialog).toContainText('データは復旧できません');
    await expect(dialog).toContainText(`${customerRef.name}`, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(dialog.getByRole('checkbox', { name: /同意する/ })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(dialog.getByRole('button', { name: '削 除' })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

function isKarteCustomerLookupRequest(
    customerId: string,
    url: string,
    method: string,
    postData: string | null
): boolean {
    if (url !== KARTE_CUSTOMER_API_URL || method !== 'POST') {
        return false;
    }
    if (!postData?.includes(customerId)) {
        return false;
    }
    try {
        const body = JSON.parse(postData) as { id?: string };
        return body.id === customerId;
    } catch {
        return false;
    }
}

function isKarteDeleteRequest(customerId: string, url: string, method: string, postData: string | null): boolean {
    if (url !== KARTE_DELETE_API_URL || method !== 'POST') {
        return false;
    }
    return (postData ?? '').includes(customerId);
}

export function assertKarteDeleteHttpSuccess(
    status: number,
    body: KarteApiErrorBody | null
): void {
    if (status < 200 || status >= 300) {
        throw new CustomerDeleteVerificationError(
            `karte/delete must succeed with 2xx, got HTTP ${status}`
        );
    }
    if (body?.errors?.length) {
        throw new CustomerDeleteVerificationError(
            `karte/delete returned errors: ${JSON.stringify(body.errors)}`
        );
    }
}

export function assertKarteCustomerLookupPresentHttp(
    status: number,
    body: KarteCustomerRecord | KarteApiErrorBody,
    customerRef: CreatedCustomerRef
): void {
    if (status !== 200) {
        throw new CustomerDeleteVerificationError(
            `Expected karte/customer lookup HTTP 200 for existing customer, got ${status}`
        );
    }
    const errors = (body as KarteApiErrorBody).errors;
    if (errors?.length) {
        throw new CustomerDeleteVerificationError(
            `karte/customer lookup returned errors: ${JSON.stringify(errors)}`
        );
    }
    const record = body as KarteCustomerRecord;
    if (record.id !== customerRef.customerId) {
        throw new CustomerDeleteVerificationError(
            `karte/customer lookup id mismatch: expected ${customerRef.customerId}, got ${record.id}`
        );
    }
    if (record.fullName !== customerRef.name) {
        throw new CustomerDeleteVerificationError(
            `karte/customer lookup fullName mismatch: expected "${customerRef.name}", got "${record.fullName}"`
        );
    }
    if (record.furiganaFullName !== customerRef.furigana) {
        throw new CustomerDeleteVerificationError(
            `karte/customer lookup furiganaFullName mismatch`
        );
    }
}

export function assertKarteCustomerLookupNotFoundHttp(
    status: number,
    body: KarteApiErrorBody | null
): void {
    if (status === 200) {
        throw new CustomerDeleteVerificationError(
            'karte/customer lookup still returned HTTP 200 after delete'
        );
    }
    if (status === 403 || status === 401) {
        throw new CustomerDeleteVerificationError(
            `karte/customer lookup auth failure (HTTP ${status}) is not deletion evidence`
        );
    }
    if (status >= 500) {
        throw new CustomerDeleteVerificationError(
            `karte/customer lookup server error (HTTP ${status}) is not deletion evidence`
        );
    }
    if (status !== 404) {
        throw new CustomerDeleteVerificationError(
            `Expected karte/customer lookup HTTP 404 for deleted customer, got ${status}`
        );
    }
    const errorCode = body?.errors?.[0]?.extensions?.errorCode;
    const message = body?.errors?.[0]?.message;
    if (errorCode !== 'ResourceNotFound' || message !== 'Customer not found') {
        throw new CustomerDeleteVerificationError(
            `Unexpected karte/customer 404 body: ${JSON.stringify(body)}`
        );
    }
}

async function waitForKarteCustomerLookupResponse(
    page: Page,
    customerId: string
): Promise<import('@playwright/test').Response> {
    return page.waitForResponse(
        (res) => {
            const req = res.request();
            return isKarteCustomerLookupRequest(
                customerId,
                res.url(),
                req.method(),
                req.postData()
            );
        },
        { timeout: 30000 }
    );
}

async function assertKarteCustomerLookupPresentForRef(
    page: Page,
    customerRef: CreatedCustomerRef
): Promise<void> {
    if (!customerRef.customerId) {
        throw new CustomerDeletePreconditionError('customerRef.customerId is required');
    }
    const customerId = customerRef.customerId;
    const lookupPromise = waitForKarteCustomerLookupResponse(page, customerId);

    if (page.url().includes(customerId)) {
        await page.reload({ waitUntil: 'domcontentloaded' });
    } else {
        await page.goto(`https://app-stg.epose.com/customers/${customerId}`, {
            waitUntil: 'domcontentloaded',
        });
    }

    const lookupResponse = await lookupPromise;
    const body = (await lookupResponse.json().catch(() => null)) as
        | KarteCustomerRecord
        | KarteApiErrorBody
        | null;
    try {
        assertKarteCustomerLookupPresentHttp(
            lookupResponse.status(),
            body ?? {},
            customerRef
        );
    } catch (err) {
        if (lookupResponse.status() === 404) {
            throw new CustomerDeletePreconditionError(
                `Customer ${customerId} not found via karte/customer before delete`
            );
        }
        throw err;
    }
}

async function assertKarteCustomerLookupReportsDeleted(
    page: Page,
    customerId: string
): Promise<void> {
    const lookupPromise = waitForKarteCustomerLookupResponse(page, customerId);
    await page.goto(`https://app-stg.epose.com/customers/${customerId}`, {
        waitUntil: 'domcontentloaded',
    });
    await assertNoRegistrationCompleteDialogBlocking(page);
    await assertCustomersListInitReady(page);

    const lookupResponse = await lookupPromise;
    const body = (await lookupResponse.json().catch(() => null)) as KarteApiErrorBody | null;
    assertKarteCustomerLookupNotFoundHttp(lookupResponse.status(), body);
}

async function openCustomerDeleteConfirmation(
    page: Page,
    customerRef: CreatedCustomerRef
): Promise<Locator> {
    const main = customersMain(page);
    await assertNoRegistrationCompleteDialogBlocking(page);
    const submenu = main
        .locator('button')
        .filter({ has: page.getByRole('img', { name: 'submenu' }) });
    await expect(submenu).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await submenu.click({ timeout: ACTION_TIMEOUT_MS });
    const deleteControl = page
        .getByRole('menuitem', { name: '削除' })
        .or(page.getByText('削除', { exact: true }));
    await expect(deleteControl.first()).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await deleteControl.first().click({ timeout: ACTION_TIMEOUT_MS });
    const dialog = customerDeleteConfirmationDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await verifyDeleteConfirmationDialogIdentity(dialog, customerRef);
    return dialog;
}

async function waitForDeleteApiAndDialogDismissed(
    page: Page,
    customerId: string,
    deleteResponsePromise: Promise<import('@playwright/test').Response>
): Promise<void> {
    const deleteResponse = await deleteResponsePromise;
    const deleteBody = (await deleteResponse.json().catch(() => null)) as KarteApiErrorBody | null;
    assertKarteDeleteHttpSuccess(deleteResponse.status(), deleteBody);

    await expect(customerDeleteConfirmationDialog(page)).toBeHidden({
        timeout: 30000,
    });
    await assertNoRegistrationCompleteDialogBlocking(page);
}

async function assertCustomerAbsentFromPhonebook(
    page: Page,
    customerName: string
): Promise<void> {
    await assertCustomersListInitReady(page);
    const phonebook = customerPhonebookPane(page);
    await expect(phonebook.getByText(customerName, { exact: true })).toHaveCount(0, {
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function verifyCustomerRemovalPersistsAfterReload(
    page: Page,
    customerRef: CreatedCustomerRef,
    evidence?: CustomerFlowEvidence
): Promise<void> {
    if (!customerRef.customerId) {
        throw new CustomerDeletePreconditionError(
            'verifyCustomerRemovalPersistsAfterReload requires customerRef.customerId'
        );
    }
    await page.goto('https://app-stg.epose.com/customers', {
        waitUntil: 'domcontentloaded',
    });
    await assertNoRegistrationCompleteDialogBlocking(page);
    await assertCustomersListInitReady(page);
    await assertCustomerAbsentFromPhonebook(page, customerRef.name);

    await assertKarteCustomerLookupReportsDeleted(
        page,
        customerRef.customerId
    );

    if (evidence) {
        await evidence.attachScreenshot('after-delete-reload-verification');
        await evidence.attachPageHtml('after-delete-reload-verification-dom');
    }
}

export async function deleteCustomerAndVerifyRemoval(
    page: Page,
    customerRef: CreatedCustomerRef,
    evidence?: CustomerFlowEvidence
): Promise<void> {
    if (!customerRef.customerId) {
        throw new CustomerDeletePreconditionError(
            'deleteCustomerAndVerifyRemoval requires customerRef.customerId'
        );
    }
    const customerId = customerRef.customerId;

    await test.step('delete customer: verify target identity before delete', async () => {
        try {
            await openSelectedCustomerByRef(page, customerRef);
            await assertKarteCustomerLookupPresentForRef(page, customerRef);
        } catch (err) {
            throw new CustomerDeletePreconditionError(
                `Customer ${customerId} is missing or identity differs before delete: ${err}`
            );
        }
    });

    let dialog: Locator;

    await test.step('delete customer: open delete confirmation', async () => {
        dialog = await openCustomerDeleteConfirmation(page, customerRef);
        if (evidence) {
            await evidence.attachScreenshot('delete-confirmation-dialog');
            await evidence.attachPageHtml('delete-confirmation-dialog-dom');
        }
    });

    const deleteIntent = {
        customerId,
        name: customerRef.name,
        furigana: customerRef.furigana,
    };
    console.log('DELETE_CUSTOMER_INTENT', JSON.stringify(deleteIntent));
    if (evidence) {
        await evidence.attachJson('DELETE_CUSTOMER_INTENT', deleteIntent);
    }

    await test.step('delete customer: confirm once', async () => {
        const deleteResponsePromise = page.waitForResponse(
            (res) => {
                const req = res.request();
                return isKarteDeleteRequest(
                    customerId,
                    res.url(),
                    req.method(),
                    req.postData()
                );
            },
            { timeout: 30000 }
        );

        const agreeCheckbox = dialog!.getByRole('checkbox', {
            name: /同意する/,
        });
        await expect(agreeCheckbox).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await agreeCheckbox.check({ timeout: ACTION_TIMEOUT_MS });
        await expect(agreeCheckbox).toBeChecked();
        await dialog!.getByRole('button', { name: '削 除' }).click({
            timeout: ACTION_TIMEOUT_MS,
        });
        await waitForDeleteApiAndDialogDismissed(
            page,
            customerId,
            deleteResponsePromise
        );
        if (evidence) {
            await evidence.attachScreenshot('after-delete-completion');
            await evidence.attachPageHtml('after-delete-completion-dom');
        }
    });

    await test.step('delete customer: verify absent from customer list', async () => {
        await assertCustomerAbsentFromPhonebook(page, customerRef.name);
    });

    await test.step('delete customer: verify removal persists after reload', async () => {
        await verifyCustomerRemovalPersistsAfterReload(
            page,
            customerRef,
            evidence
        );
    });
}

async function waitForPostSaveCustomerRoute(page: Page): Promise<void> {
    await expect
        .poll(
            async () => {
                const url = page.url();
                if (CUSTOMER_ID_URL.test(url)) {
                    return 'selected';
                }
                if (CUSTOMERS_LIST_URL.test(url)) {
                    return 'list';
                }
                return '';
            },
            {
                timeout: 30000,
                intervals: [250, 500, 1000],
                message:
                    'Expected post-save navigation to /customers or /customers/{id}',
            }
        )
        .not.toBe('');
}

async function resolvePostSaveSelectedCustomer(
    page: Page,
    customerName: string,
    furigana: string,
    evidence?: CustomerFlowEvidence
): Promise<string | null> {
    await assertNoRegistrationCompleteDialogBlocking(page);
    await waitForPostSaveCustomerRoute(page);

    if (evidence) {
        await evidence.attachScreenshot('after-save-customer-landing');
        await evidence.attachPageHtml('after-save-customer-landing-dom');
    }

    if (CUSTOMER_ID_URL.test(page.url())) {
        await assertSelectedCustomerReady(page, customerName, furigana);
        return parseCustomerIdFromUrl(page.url());
    }

    await expect(page).toHaveURL(CUSTOMERS_LIST_URL, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await assertCustomersListInitReady(page);
    await selectCustomerFromPhonebook(page, customerName, furigana, evidence);
    return parseCustomerIdFromUrl(page.url());
}

async function openNewCustomerRegistration(page: Page): Promise<void> {
    await assertCustomersListInitReady(page);

    const registrationSave = page.getByRole('button', { name: '保 存' });

    await page
        .locator('.btn-label')
        .filter({ hasText: '新規登録' })
        .click({ timeout: ACTION_TIMEOUT_MS });

    await expect
        .poll(
            async () => {
                if (!/\/customers\/create/.test(page.url())) {
                    return false;
                }
                return registrationSave.isVisible();
            },
            {
                timeout: ACTION_TIMEOUT_MS,
                intervals: [100, 250, 500],
                message:
                    'Expected /customers/create with 保 存 visible (route stayed on create form)',
            }
        )
        .toBe(true);
}

export async function addCustomerAndVerifyDetails(
    page: Page,
    customerName: string,
    furigana: string = generateUniqueFurigana(),
    evidence?: CustomerFlowEvidence
): Promise<CreatedCustomerRef> {
    await assertCustomersListInitReady(page);

    await test.step('add customer: open 新規登録', async () => {
        await openNewCustomerRegistration(page);
    });

    const root = customerRegistrationRoot(page);

    await test.step('add customer: fill registration fields', async () => {
        await expect(
            root.getByRole('button', { name: '保 存' })
        ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

        const managementNumberField = customerFormTextbox(root, 0);
        const legalNameField = customerFormTextbox(root, 1);
        const furiganaField = customerFormTextbox(root, 2);

        await expect(managementNumberField).toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
        await expect(legalNameField).toBeEditable({ timeout: ACTION_TIMEOUT_MS });
        await expect(furiganaField).toBeEditable({ timeout: ACTION_TIMEOUT_MS });

        await legalNameField.fill(customerName, { timeout: ACTION_TIMEOUT_MS });
        await expect(legalNameField).toHaveValue(customerName);

        await furiganaField.fill(furigana, { timeout: ACTION_TIMEOUT_MS });
        await expect(furiganaField).toHaveValue(furigana);

        const heightTrigger = root.locator(
            '.ant-select.number-select .ant-select-selector'
        );
        await expect(heightTrigger).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await heightTrigger.click({ timeout: ACTION_TIMEOUT_MS });
        await page
            .getByRole('option', { name: DEFAULT_CUSTOMER_PROFILE.heightCm })
            .click({ timeout: ACTION_TIMEOUT_MS });

        await root
            .getByRole('radio', { name: DEFAULT_CUSTOMER_PROFILE.sex })
            .check({ timeout: ACTION_TIMEOUT_MS });

        const dateSelects = root.locator(
            '.ant-select.date-select .ant-select-selector'
        );
        await dateSelects.nth(0).click({ timeout: ACTION_TIMEOUT_MS });
        await page
            .getByRole('option', {
                name: DEFAULT_CUSTOMER_PROFILE.birthday.year,
            })
            .click({ timeout: ACTION_TIMEOUT_MS });
        await dateSelects.nth(1).click({ timeout: ACTION_TIMEOUT_MS });
        await page
            .getByRole('option', {
                name: DEFAULT_CUSTOMER_PROFILE.birthday.month,
            })
            .click({ timeout: ACTION_TIMEOUT_MS });
        await dateSelects.nth(2).click({ timeout: ACTION_TIMEOUT_MS });
        await page
            .getByRole('option', { name: DEFAULT_CUSTOMER_PROFILE.birthday.day })
            .click({ timeout: ACTION_TIMEOUT_MS });

        const termsCheckbox = root.getByRole('checkbox', {
            name: /利用規約およびプライバシーポリシーに同意する/,
        });
        await expect(termsCheckbox).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await termsCheckbox.check({ timeout: ACTION_TIMEOUT_MS });
        await expect(termsCheckbox).toBeChecked();
    });

    const createIntent = { name: customerName, furigana };
    console.log('CUSTOMER_CREATE_INTENT', JSON.stringify(createIntent));
    if (evidence) {
        await evidence.attachJson('CUSTOMER_CREATE_INTENT', createIntent);
    }

    let customerId: string | null = null;

    await test.step('add customer: save once', async () => {
        const saveButton = root.getByRole('button', { name: '保 存' });
        await expect(saveButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
        await saveButton.click({ timeout: ACTION_TIMEOUT_MS });

        await handlePostSaveRegistrationOutcome(page);

        customerId = await resolvePostSaveSelectedCustomer(
            page,
            customerName,
            furigana,
            evidence
        );
    });

    let ref: CreatedCustomerRef;

    await test.step('add customer: open saved customer details', async () => {
        ref = await openCustomerProfileAndVerify(
            page,
            customerName,
            furigana,
            evidence
        );
        if (customerId && !ref.customerId) {
            ref = { ...ref, customerId };
        }
    });

    console.log('CREATED_CUSTOMER_REF', JSON.stringify(ref!));
    if (evidence) {
        await evidence.attachJson('CREATED_CUSTOMER_REF', ref!);
    }

    return ref!;
}
