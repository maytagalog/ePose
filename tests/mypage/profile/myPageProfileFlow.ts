import { expect, test, type Locator, type Page } from '@playwright/test';
import { generateUniqueFurigana, type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';

const ACTION_TIMEOUT_MS = 15000;
const AUTH_PROFILE_HYDRATION_TIMEOUT_MS = 30000;
const STG_MY_PAGE = 'https://app-stg.epose.com/my-page';

/** Verified staging profile load contract (2026-10-23 hydration inspect). */
export const AUTH_PROFILE_URL = 'https://api-stg.epose.com/auth/profile';

export type AuthProfileResponse = {
    email?: string;
    directorFullName?: string | null;
    furiganaFullName?: string | null;
    showingName?: string | null;
    fullName?: string | null;
};

/**
 * Verified staging My Page profile (2026-10-23):
 * - Read-only route: /my-page (not /my-page/profile/edit)
 * - Edit route: /my-page/profile/edit — プロフィール編集, 保 存, キャンセル
 * - POST auth/profile hydrates edit form (directorFullName, furiganaFullName, showingName)
 * - Read-only name row: {directorFullName}（{furiganaFullName}） when furigana is set; else director name alone
 * - Save returns to read-only /my-page
 */
export type MyPageProfileValues = {
    personInCharge: string;
    furigana: string;
    displayName: string;
};

export type MyPageProfileField = keyof MyPageProfileValues;

const FIELD_ORDER: MyPageProfileField[] = ['personInCharge', 'furigana', 'displayName'];

export class MyPageProfilePreconditionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MyPageProfilePreconditionError';
    }
}

export class MyPageProfilePersistenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MyPageProfilePersistenceError';
    }
}

export function myPageReadOnlyPathname(pathname: string): boolean {
    const normalized = pathname.replace(/\/$/, '') || '/';
    return normalized === '/my-page';
}

export function myPageProfileEditPathname(pathname: string): boolean {
    const normalized = pathname.replace(/\/$/, '') || '/';
    return normalized === '/my-page/profile/edit';
}

export async function assertMyPageReadOnlyRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) =>
        myPageReadOnlyPathname(new URL(url).pathname)
    );
}

export async function assertMyPageProfileEditRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) =>
        myPageProfileEditPathname(new URL(url).pathname)
    );
}

export function profileValuesFromAuthProfile(body: AuthProfileResponse): MyPageProfileValues {
    return {
        personInCharge: body.directorFullName ?? '',
        furigana: body.furiganaFullName ?? '',
        displayName: body.showingName ?? '',
    };
}

/** Verified staging read-only profile name row when furigana is saved (full-width parens). */
export function profileReadOnlyCombinedNameLine(
    personInCharge: string,
    furigana: string
): string {
    if (!furigana.trim()) {
        return personInCharge;
    }
    return `${personInCharge}（${furigana}）`;
}

export function expectedValuesAfterSingleFieldUpdate(
    before: MyPageProfileValues,
    field: MyPageProfileField,
    newValue: string
): MyPageProfileValues {
    return { ...before, [field]: newValue };
}

export function assertProfileValuesEqual(
    expected: MyPageProfileValues,
    actual: MyPageProfileValues,
    context: string
): void {
    for (const key of FIELD_ORDER) {
        if (expected[key] !== actual[key]) {
            throw new MyPageProfilePersistenceError(
                `${context}: field ${key} expected ${JSON.stringify(expected[key])} but got ${JSON.stringify(actual[key])}`
            );
        }
    }
}

function profileEditForm(page: Page) {
    return page.locator('form').filter({
        has: page.getByRole('button', { name: /保\s*存/ }),
    });
}

function profileEditTextbox(form: ReturnType<typeof profileEditForm>, index: number) {
    return form.getByRole('textbox').nth(index);
}

/**
 * Profile read-only card: verified staging DOM (2026-10-23) — inner block with
 * 「プロフィール」, value rows (person + 表示名：…), and profile 編 集 only (no メールアドレス).
 */
export function myPageProfileReadOnlySection(page: Page): Locator {
    return page
        .locator('div')
        .filter({ has: page.getByText('プロフィール', { exact: true }) })
        .filter({ has: page.getByText(/^表示名：/, { exact: false }) })
        .filter({ hasNot: page.getByText('メールアドレス', { exact: true }) })
        .filter({ has: page.getByRole('button', { name: /編\s*集/ }) });
}

/** Email block: 「メールアドレス」 row with its own 編 集, not プロフィール / 表示名. */
export function myPageEmailAddressBlock(page: Page) {
    return page
        .locator('div')
        .filter({ has: page.getByText('メールアドレス', { exact: true }) })
        .filter({ has: page.getByRole('button', { name: /編\s*集/ }) })
        .filter({ hasNot: page.getByText('プロフィール', { exact: true }) })
        .filter({ hasNot: page.getByText(/^表示名：/, { exact: false }) });
}

export async function waitForAuthProfilePost(
    page: Page,
    timeoutMs = AUTH_PROFILE_HYDRATION_TIMEOUT_MS
): Promise<AuthProfileResponse> {
    const response = await page.waitForResponse(
        (res) =>
            res.url() === AUTH_PROFILE_URL &&
            res.request().method() === 'POST' &&
            res.status() === 200,
        { timeout: timeoutMs }
    );
    return (await response.json()) as AuthProfileResponse;
}

/**
 * Retrying Playwright assertions until saved profile values appear in the edit form.
 * Preserves legitimate empty optional fields (e.g. furiganaFullName null → "").
 */
export async function waitForProfileEditFormHydrated(
    page: Page,
    expected: MyPageProfileValues,
    options?: { timeout?: number; requireEditRoute?: boolean }
): Promise<void> {
    const timeout = options?.timeout ?? AUTH_PROFILE_HYDRATION_TIMEOUT_MS;
    const form = profileEditForm(page);
    if (options?.requireEditRoute !== false) {
        await waitForMyPageProfileEditReady(page);
    } else {
        await expect(form).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    }
    await expect(profileEditTextbox(form, 0)).toHaveValue(expected.personInCharge, {
        timeout,
    });
    await expect(profileEditTextbox(form, 1)).toHaveValue(expected.furigana, { timeout });
    await expect(profileEditTextbox(form, 2)).toHaveValue(expected.displayName, { timeout });
}

export async function waitForMyPageReadOnlyReady(page: Page): Promise<void> {
    await assertMyPageReadOnlyRoute(page);
    await expect(page.getByText('プロフィール', { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(
        myPageProfileReadOnlySection(page),
        'Expected exactly one My Page profile read-only section'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(page.getByText('メールアドレス', { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

/** @deprecated Use waitForMyPageReadOnlyReady */
export async function waitForMyPageProfileSectionReady(page: Page): Promise<void> {
    await waitForMyPageReadOnlyReady(page);
}

export async function waitForMyPageProfileEditReady(page: Page): Promise<void> {
    await assertMyPageProfileEditRoute(page);
    await expect(page.getByText('プロフィール編集', { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const form = profileEditForm(page);
    await expect(form).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(form.getByRole('button', { name: /保\s*存/ })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(page.getByRole('button', { name: /キャンセル/ })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(profileEditTextbox(form, 0)).toBeEditable({ timeout: ACTION_TIMEOUT_MS });
}

export type MyPageNavigationOptions = {
    readOnlyUrl?: string;
    waitForAuthProfile?: boolean;
};

export async function gotoMyPageReadOnly(
    page: Page,
    options?: MyPageNavigationOptions
): Promise<void> {
    const readOnlyUrl = options?.readOnlyUrl ?? STG_MY_PAGE;
    const waitAuth =
        options?.waitForAuthProfile !== false && readOnlyUrl === STG_MY_PAGE;
    const profileResponsePromise = waitAuth ? waitForAuthProfilePost(page) : null;
    await page.goto(readOnlyUrl, { waitUntil: 'domcontentloaded' });
    await waitForMyPageReadOnlyReady(page);
    if (profileResponsePromise) {
        await profileResponsePromise;
    }
}

export async function returnToMyPageReadOnlyFromEdit(
    page: Page,
    options?: MyPageNavigationOptions
): Promise<void> {
    const pathname = new URL(page.url()).pathname;
    if (myPageProfileEditPathname(pathname)) {
        const cancelButton = page.getByRole('button', { name: /キャンセル/ });
        await expect(cancelButton).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await cancelButton.click();
        await assertMyPageReadOnlyRoute(page);
        await waitForMyPageReadOnlyReady(page);
        return;
    }
    if (!myPageReadOnlyPathname(pathname)) {
        await gotoMyPageReadOnly(page, options);
        return;
    }
    await waitForMyPageReadOnlyReady(page);
}

export async function openMyPageProfileEditFromReadOnly(
    page: Page,
    options?: { waitForAuthProfile?: boolean }
): Promise<void> {
    await waitForMyPageReadOnlyReady(page);
    await myPageProfileReadOnlySection(page)
        .getByRole('button', { name: /編\s*集/ })
        .click();
    await assertMyPageProfileEditRoute(page);
    await waitForMyPageProfileEditReady(page);
    if (options?.waitForAuthProfile) {
        await waitForAuthProfilePost(page);
    }
}

export type NavigateToMyPageOptions = {
    expectedEmail?: string;
};

/** Verified app menu: role dialog opened from the header Menu control. */
export function appNavigationMenuDialog(page: Page): Locator {
    return page.getByRole('dialog');
}

async function navigateToMyPageViaMenu(page: Page): Promise<AuthProfileResponse> {
    await page.getByRole('img', { name: 'Menu' }).click();
    const dialog = appNavigationMenuDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const myPageNavItem = dialog.getByText('マイページ', { exact: true });
    await expect(
        myPageNavItem,
        'Navigation menu dialog must expose exactly one マイページ control'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const profileSettled = waitForAuthProfilePost(page).then(
        (profile) => ({ ok: true as const, profile }),
        (err) => ({ ok: false as const, err })
    );

    let navigationError: unknown;
    try {
        await myPageNavItem.click();
        await assertMyPageReadOnlyRoute(page);
        await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        await waitForMyPageReadOnlyReady(page);
    } catch (err) {
        navigationError = err;
    }

    const profileOutcome = await profileSettled;

    if (navigationError !== undefined) {
        throw navigationError;
    }
    if (!profileOutcome.ok) {
        throw profileOutcome.err;
    }
    await assertMyPageProfileReadOnlyMatchesApi(page, profileOutcome.profile);
    return profileOutcome.profile;
}

/**
 * Ensures read-only /my-page is ready. Reuses the current view when already on /my-page
 * (no Menu, no auth/profile wait). Otherwise opens Menu and selects マイページ inside the dialog only.
 */
export async function navigateToMyPage(
    page: Page,
    options?: NavigateToMyPageOptions
): Promise<AuthProfileResponse | null> {
    const pathname = new URL(page.url()).pathname;
    if (myPageReadOnlyPathname(pathname)) {
        await waitForMyPageReadOnlyReady(page);
        if (options?.expectedEmail) {
            await assertMyPageSignedInEmail(page, options.expectedEmail);
        }
        return null;
    }

    const profile = await navigateToMyPageViaMenu(page);
    if (options?.expectedEmail) {
        await assertMyPageSignedInEmail(page, options.expectedEmail);
    }
    return profile;
}

export async function assertMyPageSignedInEmail(
    page: Page,
    expectedEmail: string
): Promise<void> {
    const emailBlock = myPageEmailAddressBlock(page);
    await expect(
        emailBlock,
        'Expected exactly one My Page email section (メールアドレス row)'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(emailBlock.getByText(expectedEmail, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

export async function assertMyPageProfileReadOnlyValues(
    page: Page,
    values: MyPageProfileValues
): Promise<void> {
    await waitForMyPageReadOnlyReady(page);
    const section = myPageProfileReadOnlySection(page);
    await expect(
        section.getByText(`表示名：${values.displayName}`, { exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    if (values.personInCharge) {
        const nameRowText = profileReadOnlyCombinedNameLine(
            values.personInCharge,
            values.furigana
        );
        await expect(section.getByText(nameRowText, { exact: true })).toBeVisible({
            timeout: ACTION_TIMEOUT_MS,
        });
    }
}

async function assertMyPageProfileReadOnlyMatchesApi(
    page: Page,
    profile: AuthProfileResponse
): Promise<void> {
    await assertMyPageProfileReadOnlyValues(page, profileValuesFromAuthProfile(profile));
}

/** @deprecated Prefer openMyPageProfileEditFromReadOnly */
export async function openMyPageProfileEditShell(page: Page): Promise<void> {
    const profileResponsePromise = waitForAuthProfilePost(page);
    await openMyPageProfileEditFromReadOnly(page, { waitForAuthProfile: false });
    await profileResponsePromise;
}

/**
 * Opens profile edit and waits for POST auth/profile + form values matching the API body.
 */
export async function openMyPageProfileEdit(page: Page): Promise<MyPageProfileValues> {
    const profileResponsePromise = waitForAuthProfilePost(page);
    await openMyPageProfileEditFromReadOnly(page, { waitForAuthProfile: false });
    const profile = await profileResponsePromise;
    const expected = profileValuesFromAuthProfile(profile);
    await waitForProfileEditFormHydrated(page, expected);
    return expected;
}

async function readProfileFieldsFromHydratedEdit(page: Page): Promise<MyPageProfileValues> {
    const form = profileEditForm(page);
    return {
        personInCharge: await profileEditTextbox(form, 0).inputValue(),
        furigana: await profileEditTextbox(form, 1).inputValue(),
        displayName: await profileEditTextbox(form, 2).inputValue(),
    };
}

export async function readMyPageProfileBaselineAndReturnToReadOnly(
    page: Page,
    options?: MyPageNavigationOptions
): Promise<MyPageProfileValues> {
    const waitAuth = options?.waitForAuthProfile !== false;
    let expected: MyPageProfileValues;
    if (waitAuth) {
        const profileResponsePromise = waitForAuthProfilePost(page);
        await openMyPageProfileEditFromReadOnly(page, { waitForAuthProfile: false });
        expected = profileValuesFromAuthProfile(await profileResponsePromise);
    } else {
        await openMyPageProfileEditFromReadOnly(page, { waitForAuthProfile: false });
        expected = await readProfileFieldsFromHydratedEdit(page);
    }
    await waitForProfileEditFormHydrated(page, expected);
    const values = await readProfileFieldsFromHydratedEdit(page);
    await returnToMyPageReadOnlyFromEdit(page, options);
    await assertMyPageReadOnlyRoute(page);
    return values;
}

/** @deprecated Use readMyPageProfileBaselineAndReturnToReadOnly */
export async function readMyPageProfileFieldsViaEdit(page: Page): Promise<MyPageProfileValues> {
    return readMyPageProfileBaselineAndReturnToReadOnly(page);
}

async function assertMyPageProfileReadOnlyDisplay(
    page: Page,
    values: MyPageProfileValues
): Promise<void> {
    await assertMyPageProfileReadOnlyValues(page, values);
}

async function saveMyPageProfileEdit(page: Page): Promise<void> {
    await assertMyPageProfileEditRoute(page);
    const form = profileEditForm(page);
    await form.getByRole('button', { name: /保\s*存/ }).click();
    await assertMyPageReadOnlyRoute(page);
    await expect(form).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    await waitForMyPageReadOnlyReady(page);
}

export function pickNewProfileFurigana(current: string): string {
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateUniqueFurigana('テストマイ');
        if (candidate !== current) {
            return candidate;
        }
    }
    return generateUniqueFurigana('テストマイ') + 'ン';
}

async function fillFuriganaOnly(
    page: Page,
    newFurigana: string,
    baseline: MyPageProfileValues
): Promise<void> {
    const form = profileEditForm(page);
    const furiganaBox = profileEditTextbox(form, 1);
    await furiganaBox.fill(newFurigana);
    await expect(furiganaBox).toHaveValue(newFurigana);
    await expect(profileEditTextbox(form, 0)).toHaveValue(baseline.personInCharge);
    await expect(profileEditTextbox(form, 2)).toHaveValue(baseline.displayName);
}

async function verifyProfileValuesInEditForm(
    page: Page,
    expected: MyPageProfileValues,
    context: string,
    evidence?: CustomerFlowEvidence,
    navOptions?: MyPageNavigationOptions
): Promise<void> {
    try {
        await waitForMyPageReadOnlyReady(page);
        const profileResponsePromise =
            navOptions?.waitForAuthProfile === false
                ? null
                : waitForAuthProfilePost(page);
        await openMyPageProfileEditFromReadOnly(page, { waitForAuthProfile: false });
        if (profileResponsePromise) {
            await profileResponsePromise;
        }
        await waitForProfileEditFormHydrated(page, expected);
        const actual = await readProfileFieldsFromHydratedEdit(page);
        assertProfileValuesEqual(expected, actual, context);
    } catch (err) {
        if (evidence) {
            await evidence.attachJson(`${context}-expected`, expected);
            const form = profileEditForm(page);
            if (await form.isVisible().catch(() => false)) {
                const actual = await readProfileFieldsFromHydratedEdit(page).catch(() => null);
                if (actual) {
                    await evidence.attachJson(`${context}-actual`, actual);
                }
            }
            await evidence.attachScreenshot(`${context}-mismatch`);
            await evidence.attachPageHtml(`${context}-mismatch-dom`);
        }
        throw err;
    } finally {
        await returnToMyPageReadOnlyFromEdit(page, navOptions);
        await assertMyPageReadOnlyRoute(page);
    }
}

export async function verifyProfilePersistenceAfterFreshLoad(
    page: Page,
    expected: MyPageProfileValues,
    context = 'persistence-after-fresh-load',
    evidence?: CustomerFlowEvidence,
    navOptions?: MyPageNavigationOptions
): Promise<void> {
    await gotoMyPageReadOnly(page, navOptions);
    await verifyProfileValuesInEditForm(page, expected, context, evidence, navOptions);
}

async function attachFailureEvidence(
    page: Page,
    evidence: CustomerFlowEvidence | undefined,
    label: string
): Promise<void> {
    if (!evidence) {
        return;
    }
    await evidence.attachScreenshot(label);
    await evidence.attachPageHtml(`${label}-dom`);
}

/**
 * My Page → Profile smoke: single Furigana update, one Save, one fresh-load persistence check.
 * Uses the existing signed-in session (no login).
 */
export async function runMyPageProfileFuriganaUpdateAndVerify(
    page: Page,
    expectedEmail: string,
    evidence?: CustomerFlowEvidence
): Promise<MyPageProfileValues> {
    try {
        await test.step('my-page profile: navigate', async () => {
            await navigateToMyPage(page);
        });

        await test.step('my-page profile: verify signed-in email', async () => {
            await assertMyPageSignedInEmail(page, expectedEmail);
        });

        const baseline = await test.step(
            'my-page profile: open edit and read current values',
            async () => {
                const profileResponsePromise = waitForAuthProfilePost(page);
                await openMyPageProfileEditFromReadOnly(page, {
                    waitForAuthProfile: false,
                });
                const profile = await profileResponsePromise;
                const current = profileValuesFromAuthProfile(profile);
                await waitForProfileEditFormHydrated(page, current);
                return readProfileFieldsFromHydratedEdit(page);
            }
        );

        const newFurigana = pickNewProfileFurigana(baseline.furigana);
        const expectedAfter: MyPageProfileValues = {
            ...baseline,
            furigana: newFurigana,
        };

        await test.step('my-page profile: update furigana only and save once', async () => {
            console.log(
                'MY_PAGE_PROFILE_FURIGANA_UPDATE',
                JSON.stringify({ from: baseline.furigana, to: newFurigana })
            );
            if (evidence) {
                await evidence.attachJson('MY_PAGE_PROFILE_FURIGANA_UPDATE', {
                    from: baseline.furigana,
                    to: newFurigana,
                    personInCharge: baseline.personInCharge,
                    displayName: baseline.displayName,
                });
            }

            await fillFuriganaOnly(page, newFurigana, baseline);
            await saveMyPageProfileEdit(page);
            await assertMyPageProfileReadOnlyValues(page, expectedAfter);
        });

        await test.step('my-page profile: persistence after fresh load', async () => {
            const profileResponsePromise = waitForAuthProfilePost(page);
            await page.goto(STG_MY_PAGE, { waitUntil: 'domcontentloaded' });
            await waitForMyPageReadOnlyReady(page);
            await profileResponsePromise;

            const editProfilePromise = waitForAuthProfilePost(page);
            await openMyPageProfileEditFromReadOnly(page, { waitForAuthProfile: false });
            await editProfilePromise;
            await waitForProfileEditFormHydrated(page, expectedAfter);
            const actual = await readProfileFieldsFromHydratedEdit(page);
            assertProfileValuesEqual(expectedAfter, actual, 'furigana-after-fresh-load');
            await returnToMyPageReadOnlyFromEdit(page);
        });

        await test.step('my-page profile: finish on read-only my-page', async () => {
            await assertMyPageReadOnlyRoute(page);
            await waitForMyPageReadOnlyReady(page);
            await assertMyPageProfileReadOnlyValues(page, expectedAfter);
        });

        return expectedAfter;
    } catch (err) {
        await attachFailureEvidence(page, evidence, 'my-page-profile-failure');
        throw err;
    }
}

/** @deprecated Use runMyPageProfileFuriganaUpdateAndVerify */
export const runMyPageProfileUpdatesAndVerify = runMyPageProfileFuriganaUpdateAndVerify;
