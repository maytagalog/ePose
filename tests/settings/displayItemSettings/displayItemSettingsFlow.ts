import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import {
    STG_SETTINGS_URL,
    assertSettingsRoute,
    waitForSettingsCompanyReadOnlyReady,
    type CompanyInformationFlowOptions,
} from '../companyInformation/companyInformationFlow';
import type { SmokeAccountRef } from '../../mypage/changeEmail/myPageChangeEmailFlow';

const ACTION_TIMEOUT_MS = 15000;
const DISPLAY_ITEM_HYDRATION_TIMEOUT_MS = 30000;

/** Bundle: AuthRepository getUser / updateUser (axios base AUTH_API_URL). */
export const GET_USER_URL = 'https://api-stg.epose.com/auth/get_user';
export const UPDATE_USER_URL = 'https://api-stg.epose.com/auth/update_user';

export const SETTINGS_REPORT_DISPLAY_SECTION_TITLE = '姿勢分析レポート表示設定';
export const SETTINGS_DISPLAY_ITEM_SETTINGS_LABEL = '表示項目の設定';
export const DISPLAY_ITEMS_DIALOG_TITLE = '表示項目の設定';
/** Bundle: displayItemsSettingDialog.subtitle (JA). */
export const DISPLAY_ITEMS_EXERCISE_STRETCHES_LABEL = 'エクササイズとストレッチ';
export const DISPLAY_ITEM_SETTING_FIELD = 'showExercisesAndStretches';
export const DISPLAY_ITEM_UPDATE_SUCCESS_TOAST = '更新しました。';

export const DISPLAY_ITEM_EDIT_BUTTON_NAME_PATTERN = /^編\s*集$/;
export const DISPLAY_ITEM_SAVE_BUTTON_NAME_PATTERN = /^保\s*存$/;
export const DISPLAY_ITEM_CANCEL_BUTTON_NAME_PATTERN = /^キャンセル$/;

export type DisplayItemSettingsFlowOptions = CompanyInformationFlowOptions;

export class DisplayItemSettingsFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DisplayItemSettingsFlowError';
    }
}

export class DisplayItemSettingsPersistenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DisplayItemSettingsPersistenceError';
    }
}

function resolveSettingsUrl(options?: DisplayItemSettingsFlowOptions): string {
    return options?.settingsUrl ?? STG_SETTINGS_URL;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bundle (Settings.tsx): GroupTitle + DisplaySettingsWrapper are adjacent siblings.
 */
export function settingsDisplayItemSettingsWrapper(page: Page): Locator {
    const groupTitle = page.getByText(SETTINGS_REPORT_DISPLAY_SECTION_TITLE, { exact: true });
    return groupTitle.locator('xpath=following-sibling::*[1]');
}

export function settingsDisplayItemSettingsEditButton(page: Page): Locator {
    const wrapper = settingsDisplayItemSettingsWrapper(page);
    return wrapper.getByRole('button', { name: DISPLAY_ITEM_EDIT_BUTTON_NAME_PATTERN });
}

export function displayItemSettingsDialog(page: Page): Locator {
    return page.getByRole('dialog').filter({
        has: page.getByText(DISPLAY_ITEMS_EXERCISE_STRETCHES_LABEL, { exact: true }),
    });
}

export function displayItemSettingsExerciseSwitch(dialog: Locator): Locator {
    const toggleWrapper = dialog.locator('.toggle-wrapper');
    return toggleWrapper.getByRole('switch');
}

export function parseShowExercisesAndStretchesFromGetUser(
    body: unknown,
    context: string
): boolean {
    if (!isJsonObject(body)) {
        throw new DisplayItemSettingsFlowError(`${context} response was not a JSON object.`);
    }

    const fromUserPreferences = (obj: Record<string, unknown>): boolean | undefined => {
        const prefs = obj.userPreferences;
        if (isJsonObject(prefs) && typeof prefs.showExercisesAndStretches === 'boolean') {
            return prefs.showExercisesAndStretches;
        }
        return undefined;
    };

    if (typeof body.showExercisesAndStretches === 'boolean') {
        return body.showExercisesAndStretches;
    }
    const nestedData = body.data;
    if (isJsonObject(nestedData)) {
        if (typeof nestedData.showExercisesAndStretches === 'boolean') {
            return nestedData.showExercisesAndStretches;
        }
        const fromPrefs = fromUserPreferences(nestedData);
        if (typeof fromPrefs === 'boolean') {
            return fromPrefs;
        }
    }
    const rootPrefs = fromUserPreferences(body);
    if (typeof rootPrefs === 'boolean') {
        return rootPrefs;
    }

    throw new DisplayItemSettingsFlowError(
        `${context} response missing boolean showExercisesAndStretches.`
    );
}

export async function waitForGetUserGet(
    page: Page,
    timeoutMs = DISPLAY_ITEM_HYDRATION_TIMEOUT_MS
): Promise<unknown> {
    const response = await page.waitForResponse(
        (res) =>
            res.url() === GET_USER_URL &&
            res.request().method() === 'GET' &&
            res.status() === 200,
        { timeout: timeoutMs }
    );
    return response.json();
}

export async function waitForUpdateUserPatch(
    page: Page,
    expectedShowExercisesAndStretches: boolean,
    timeoutMs = DISPLAY_ITEM_HYDRATION_TIMEOUT_MS
): Promise<void> {
    const response = await page.waitForResponse(
        async (res) => {
            if (res.url() !== UPDATE_USER_URL || res.request().method() !== 'PATCH') {
                return false;
            }
            if (res.status() !== 200) {
                return false;
            }
            let payload: unknown;
            try {
                payload = res.request().postDataJSON();
            } catch {
                return false;
            }
            if (!isJsonObject(payload)) {
                return false;
            }
            return payload.showExercisesAndStretches === expectedShowExercisesAndStretches;
        },
        { timeout: timeoutMs }
    );
    await response.finished();
}

async function readExerciseSwitchChecked(switchLoc: Locator): Promise<boolean> {
    await expect(switchLoc).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const ariaChecked = await switchLoc.getAttribute('aria-checked');
    if (ariaChecked === 'true') {
        return true;
    }
    if (ariaChecked === 'false') {
        return false;
    }
    throw new DisplayItemSettingsFlowError(
        `${DISPLAY_ITEM_SETTING_FIELD} switch missing aria-checked (got ${JSON.stringify(ariaChecked)}).`
    );
}

async function assertExerciseSwitchChecked(switchLoc: Locator, expected: boolean): Promise<void> {
    await expect(switchLoc).toHaveAttribute('aria-checked', expected ? 'true' : 'false', {
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function waitForDisplayItemSettingsDialogReady(page: Page): Promise<Locator> {
    const dialog = displayItemSettingsDialog(page);
    await expect(dialog, 'Display Item Settings dialog should open once').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(dialog.getByText(DISPLAY_ITEMS_DIALOG_TITLE, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(dialog.getByText(DISPLAY_ITEMS_EXERCISE_STRETCHES_LABEL, { exact: true })).toBeVisible(
        { timeout: ACTION_TIMEOUT_MS }
    );
    const switchLoc = displayItemSettingsExerciseSwitch(dialog);
    await expect(
        switchLoc,
        'Expected exactly one exercise/stretch switch in Display Item Settings dialog'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    const saveButton = dialog.getByRole('button', { name: DISPLAY_ITEM_SAVE_BUTTON_NAME_PATTERN });
    await expect(saveButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    return dialog;
}

export async function openDisplayItemSettingsEdit(page: Page): Promise<Locator> {
    const wrapper = settingsDisplayItemSettingsWrapper(page);
    await expect(wrapper.getByText(SETTINGS_DISPLAY_ITEM_SETTINGS_LABEL, { exact: true })).toBeVisible(
        { timeout: ACTION_TIMEOUT_MS }
    );
    const editButton = settingsDisplayItemSettingsEditButton(page);
    await expect(editButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await editButton.click();
    return waitForDisplayItemSettingsDialogReady(page);
}

export async function closeDisplayItemSettingsDialogWithoutSaving(page: Page): Promise<void> {
    const dialog = displayItemSettingsDialog(page);
    if ((await dialog.count()) === 0) {
        return;
    }
    if (!(await dialog.isVisible())) {
        return;
    }
    const cancelButton = dialog.getByRole('button', { name: DISPLAY_ITEM_CANCEL_BUTTON_NAME_PATTERN });
    await expect(cancelButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await cancelButton.click();
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}

async function submitDisplayItemSettingsSaveOnce(
    page: Page,
    dialog: Locator,
    intendedChecked: boolean
): Promise<void> {
    const saveButton = dialog.getByRole('button', { name: DISPLAY_ITEM_SAVE_BUTTON_NAME_PATTERN });
    await expect(saveButton).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const updateSettled = waitForUpdateUserPatch(page, intendedChecked).then(
        () => ({ ok: true as const }),
        (err) => ({ ok: false as const, err })
    );

    await saveButton.click();

    const updateOutcome = await updateSettled;
    if (!updateOutcome.ok) {
        throw updateOutcome.err;
    }

    await expect(page.getByText(DISPLAY_ITEM_UPDATE_SUCCESS_TOAST, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}

async function verifyDisplayItemPersistenceAfterFreshLoad(
    page: Page,
    expectedChecked: boolean,
    options?: DisplayItemSettingsFlowOptions
): Promise<void> {
    const getUserSettled = waitForGetUserGet(page).then(
        (body) => ({ ok: true as const, body }),
        (err) => ({ ok: false as const, err })
    );

    await page.goto(resolveSettingsUrl(options), { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, options);

    const getUserOutcome = await getUserSettled;
    if (!getUserOutcome.ok) {
        throw getUserOutcome.err;
    }

    try {
        const apiValue = parseShowExercisesAndStretchesFromGetUser(
            getUserOutcome.body,
            'fresh-load-get_user'
        );
        if (apiValue !== expectedChecked) {
            throw new DisplayItemSettingsPersistenceError(
                `get_user showExercisesAndStretches=${String(apiValue)} !== expected ${String(expectedChecked)}`
            );
        }
    } catch (err) {
        if (err instanceof DisplayItemSettingsPersistenceError) {
            throw err;
        }
        throw new DisplayItemSettingsPersistenceError(
            'get_user response did not contain persisted showExercisesAndStretches after fresh load'
        );
    }

    const dialog = await openDisplayItemSettingsEdit(page);
    const switchLoc = displayItemSettingsExerciseSwitch(dialog);
    try {
        await assertExerciseSwitchChecked(switchLoc, expectedChecked);
    } catch {
        throw new DisplayItemSettingsPersistenceError(
            'Display Item Settings dialog switch did not reflect saved value after fresh load'
        );
    }

    await closeDisplayItemSettingsDialogWithoutSaving(page);
    await assertSettingsRoute(page, options);
}

/**
 * Continues from Settings (same session) after Company Information verification.
 */
export async function runDisplayItemSettingsUpdateAndVerify(
    page: Page,
    account: SmokeAccountRef,
    evidence?: CustomerFlowEvidence,
    options?: DisplayItemSettingsFlowOptions
): Promise<void> {
    try {
        await test.step('settings display items: start on Settings', async () => {
            await assertSettingsRoute(page, options);
            await waitForSettingsCompanyReadOnlyReady(page, options);
        });

        const dialog = await test.step('settings display items: open editor', async () => {
            return openDisplayItemSettingsEdit(page);
        });

        const initialChecked = await test.step(
            'settings display items: read exercise switch baseline',
            async () => readExerciseSwitchChecked(displayItemSettingsExerciseSwitch(dialog))
        );
        const intendedChecked = !initialChecked;

        console.log(
            'DISPLAY_ITEM_SETTINGS_UPDATE_INTENT',
            JSON.stringify({
                accountEmail: account.email,
                settingLabel: DISPLAY_ITEMS_EXERCISE_STRETCHES_LABEL,
                field: DISPLAY_ITEM_SETTING_FIELD,
                initialChecked,
                intendedChecked,
            })
        );
        if (evidence) {
            await evidence.attachJson('DISPLAY_ITEM_SETTINGS_UPDATE_INTENT', {
                accountEmail: account.email,
                settingLabel: DISPLAY_ITEMS_EXERCISE_STRETCHES_LABEL,
                field: DISPLAY_ITEM_SETTING_FIELD,
                initialChecked,
                intendedChecked,
            });
        }

        await test.step('settings display items: toggle and assert before save', async () => {
            const switchLoc = displayItemSettingsExerciseSwitch(dialog);
            await switchLoc.click();
            await assertExerciseSwitchChecked(switchLoc, intendedChecked);
            if (evidence) {
                await evidence.attachScreenshot('display-item-settings-before-save');
            }
        });

        await test.step('settings display items: save once', async () => {
            await submitDisplayItemSettingsSaveOnce(page, dialog, intendedChecked);
            await assertSettingsRoute(page, options);
            await waitForSettingsCompanyReadOnlyReady(page, options);
            if (evidence) {
                await evidence.attachScreenshot('display-item-settings-after-save');
                await evidence.attachJson('DISPLAY_ITEM_SETTINGS_SAVED', {
                    field: DISPLAY_ITEM_SETTING_FIELD,
                    value: intendedChecked,
                });
            }
        });

        await test.step('settings display items: persistence after one fresh load', async () => {
            await verifyDisplayItemPersistenceAfterFreshLoad(page, intendedChecked, options);
        });

        console.log(
            'DISPLAY_ITEM_SETTINGS_PERSISTED',
            JSON.stringify({
                accountEmail: account.email,
                field: DISPLAY_ITEM_SETTING_FIELD,
                persistedChecked: intendedChecked,
                saveToast: DISPLAY_ITEM_UPDATE_SUCCESS_TOAST,
            })
        );
    } catch (err) {
        if (evidence) {
            await evidence.attachScreenshot('display-item-settings-failure');
            await evidence.attachPageHtml('display-item-settings-failure-dom');
        }
        throw err;
    }
}
