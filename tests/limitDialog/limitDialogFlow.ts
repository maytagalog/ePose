import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import {
    assertCustomersListInitReady,
    assertCustomerFlowNotBlocked,
} from '../accountRegistration/customerFlow';
import {
    SMOKE_PART2_LIMIT_DIALOG_AUTOMATIC_OBSERVATION_MS,
    SMOKE_PART2_LIMIT_DIALOG_CURRENT_PLAN_TEXT,
    SMOKE_PART2_LIMIT_DIALOG_IDENTIFYING_TEXT,
    type SmokePart2AccountCredentials,
} from '../e2e/shared/smokePart2Config';
import { STG_APP_ORIGIN } from '../login/existingUserLoginFlow';
import type { ExistingUserCustomersReadiness } from '../login/existingUserLoginFlow';
import { captureContractSubscriptionBodyForTrigger } from '../accountPayment/creditCard/planPurchaseFlow';
import {
    enrichPaymentHistoryEvidence,
    evaluatePaymentHistoryProbe,
    evaluateSubscriptionPrerequisites,
    isContractPaymentHistoryProbeResponse,
    isContractSubscriptionGetResponse,
    mergePrerequisiteEvidence,
    type LimitDialogPrerequisiteEvidence,
} from './limitDialogPrerequisites';

const ACTION_TIMEOUT_MS = 15000;
const TRIGGER_DIALOG_TIMEOUT_MS = 15000;
const PHONEBOOK_LIST_INIT_TIMEOUT_MS = 30000;

/** Staging trace: customer list container (alphabet `role=tab` filters are outside this wrapper). */
export const PHONEBOOK_LIST_WRAPPER_SELECTOR = '#phonebook-list-wrapper';

/** Staging trace: skeleton inside the list wrapper while customers load. */
export const PHONEBOOK_SET_LOADING_SELECTOR = '#phonebook-set-loading';

/** Populated staging trace (trace 20261025-093933): avatar alt on each customer row. */
export const PHONEBOOK_CUSTOMER_USER_ICON_ALT = 'User Icon';
const CUSTOMER_ID_URL = /\/customers\/[0-9a-f-]{36}(?:\/|$|\?)/i;
/** Close control for Limit Dialog (staging screenshot 2026-10-25 — button named 閉じる, not legacy あとで). */
export const LIMIT_DIALOG_CLOSE_LABEL = '閉じる';

/** Staging screenshot 2026-10-25 — identifies role=dialog; no established accessible dialog name. */
export const LIMIT_DIALOG_IDENTIFYING_TEXT = SMOKE_PART2_LIMIT_DIALOG_IDENTIFYING_TEXT;

/** Current plan row copy observed inside Limit Dialog on staging (フリープラン account). */
export const LIMIT_DIALOG_CURRENT_PLAN_TEXT = SMOKE_PART2_LIMIT_DIALOG_CURRENT_PLAN_TEXT;

export const CUSTOMERS_PLAN_CHANGE_TRIGGER_TEXT = 'プラン変更はこちら';
export const CUSTOMERS_QUICK_ANALYSIS_TRIGGER_TEXT = 'クイック分析';
export const CUSTOMERS_NEW_ANALYSIS_TRIGGER_TEXT = '新規分析';

export type LimitDialogTriggerId = 'plan_change' | 'quick_analysis' | 'new_analysis';

export type AutomaticLimitDialogOutcome = 'dismissed' | 'not_shown';

export type LimitDialogTriggerStatus =
    | 'verified_dismissed'
    | 'failed_missing_dialog'
    | 'failed_dismissal'
    | 'failed_unrestricted_workflow';

export type SelectedCustomerEvidence = {
    name: string;
    customerId: string | null;
};

/** Phonebook row identity captured when opening a customer from `#phonebook-list-wrapper`. */
export type OpenCustomerFromPhonebookEvidence = SelectedCustomerEvidence & {
    furigana: string;
};

export type LimitDialogFlowResult = {
    prerequisites: LimitDialogPrerequisiteEvidence;
    automaticOutcome: AutomaticLimitDialogOutcome;
    triggers: Record<LimitDialogTriggerId, LimitDialogTriggerStatus>;
    selectedCustomer: SelectedCustomerEvidence | null;
    finalPathname: string;
    loginReadinessPreserved: {
        profileEmailVerified: boolean;
        identityEvidenceStatus: ExistingUserCustomersReadiness['identityEvidence']['status'];
        takeoverDetected: boolean;
        takeoverConfirmed: boolean;
    };
};

export type LimitDialogEnvironment = {
    appOrigin: string;
    automaticObservationMs?: number;
    identifyingText?: string;
};

export const DEFAULT_LIMIT_DIALOG_ENV: LimitDialogEnvironment = {
    appOrigin: STG_APP_ORIGIN,
    automaticObservationMs: SMOKE_PART2_LIMIT_DIALOG_AUTOMATIC_OBSERVATION_MS,
    identifyingText: SMOKE_PART2_LIMIT_DIALOG_IDENTIFYING_TEXT,
};

export class LimitDialogFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LimitDialogFlowError';
    }
}

export class LimitDialogPrerequisiteError extends LimitDialogFlowError {
    constructor(message: string) {
        super(message);
        this.name = 'LimitDialogPrerequisiteError';
    }
}

function customersMain(page: Page): Locator {
    return page.getByRole('main');
}

function parseCustomerIdFromUrl(url: string): string | null {
    const match = url.match(/\/customers\/([0-9a-f-]{36})/i);
    return match ? match[1] : null;
}

/**
 * Populated staging trace `trace(20261025-093933).zip` (frame-snapshot on `/customers`):
 * - `#phonebook-list-wrapper` → `#phonebook-set-<group>` (DOM order; first group `phonebook-set-あ`)
 * - Group label: direct child `<p>` (e.g. text `あ`), not a customer row
 * - Each record: `#phonebook-set-* > div > div > div` (row shell), containing `img[alt="User Icon"]` as a
 *   descendant — the icon wrapper `div` is **not** the row (it is `> div > div > div > div > div > img`).
 * - 氏名: second direct child column `> div:nth-child(2) > div:first-child` (e.g. text `Nikolas Samuel`).
 */
export function phonebookCustomerRecordRows(page: Page): Locator {
    return page
        .locator(PHONEBOOK_LIST_WRAPPER_SELECTOR)
        .locator('[id^="phonebook-set-"]:not(#phonebook-set-loading)')
        .locator('> div > div > div')
        .filter({ has: page.locator(`img[alt="${PHONEBOOK_CUSTOMER_USER_ICON_ALT}"]`) });
}

/** Display name cell from the text column (not the avatar column or group `<p>`). */
export function phonebookCustomerRecordDisplayName(record: Locator): Locator {
    return record.locator('> div').nth(1).locator('> div').first();
}

/** Furigana cell — second `div` in the phonebook text column (staging trace). */
export function phonebookCustomerRecordFurigana(record: Locator): Locator {
    return record.locator('> div').nth(1).locator('> div').nth(1);
}

/** Limit Dialog root — staging-identified by visible trial-ended copy (not 閉じる alone). */
export function limitDialogRoot(page: Page, env: LimitDialogEnvironment = DEFAULT_LIMIT_DIALOG_ENV): Locator {
    const marker = (env.identifyingText ?? LIMIT_DIALOG_IDENTIFYING_TEXT).trim();
    if (!marker) {
        throw new LimitDialogFlowError(
            'Limit Dialog identifying text is not configured (expected staging trial-ended copy).'
        );
    }
    return page.getByRole('dialog').filter({ hasText: marker });
}

export async function dismissLimitDialog(
    page: Page,
    env: LimitDialogEnvironment = DEFAULT_LIMIT_DIALOG_ENV
): Promise<void> {
    const dialog = limitDialogRoot(page, env);
    await expect(dialog, 'Expected exactly one Limit Dialog').toHaveCount(1);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(
        dialog.getByText(LIMIT_DIALOG_CURRENT_PLAN_TEXT, { exact: true }),
        'Expected current plan フリープラン inside Limit Dialog'
    ).toBeVisible();
    const closeButton = dialog.getByRole('button', {
        name: LIMIT_DIALOG_CLOSE_LABEL,
        exact: true,
    });
    await expect(closeButton, 'Expected exactly one 閉じる in Limit Dialog').toHaveCount(1);
    await expect(closeButton).toBeEnabled();
    await closeButton.click({ noWaitAfter: true });
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}

async function assertNoUnrestrictedWorkflowEntered(
    page: Page,
    trigger: LimitDialogTriggerId
): Promise<void> {
    const url = page.url();
    if (/\/contract\/plans|\/contract\/payment|upload|\/analysis\//i.test(url)) {
        throw new LimitDialogFlowError(
            `Trigger ${trigger} entered an unrestricted workflow (url: ${url}); refusing to continue.`
        );
    }
    if (await page.locator('input[type="file"]').isVisible().catch(() => false)) {
        throw new LimitDialogFlowError(
            `Trigger ${trigger} exposed file upload UI without Limit Dialog gating.`
        );
    }
}

async function observeAutomaticLimitDialog(
    page: Page,
    env: LimitDialogEnvironment
): Promise<AutomaticLimitDialogOutcome> {
    const dialog = limitDialogRoot(page, env);
    const timeoutMs = env.automaticObservationMs ?? SMOKE_PART2_LIMIT_DIALOG_AUTOMATIC_OBSERVATION_MS;
    try {
        await expect(dialog).toBeVisible({ timeout: timeoutMs });
    } catch {
        return 'not_shown';
    }
    await dismissLimitDialog(page, env);
    return 'dismissed';
}

async function runTriggerLimitDialogCheck(
    page: Page,
    trigger: LimitDialogTriggerId,
    clickTrigger: () => Promise<void>,
    env: LimitDialogEnvironment
): Promise<LimitDialogTriggerStatus> {
    await clickTrigger();
    await assertNoUnrestrictedWorkflowEntered(page, trigger);
    const dialog = limitDialogRoot(page, env);
    try {
        await expect(dialog).toBeVisible({ timeout: TRIGGER_DIALOG_TIMEOUT_MS });
        await expect(dialog).toHaveCount(1);
    } catch {
        return 'failed_missing_dialog';
    }
    try {
        await dismissLimitDialog(page, env);
    } catch {
        return 'failed_dismissal';
    }
    return 'verified_dismissed';
}

async function assertCustomersShellReady(page: Page): Promise<void> {
    await assertCustomerFlowNotBlocked(page);
    await assertCustomersListInitReady(page);
}

/**
 * Opens the first customer row under `#phonebook-list-wrapper` (display order).
 * Shared by Limit Dialog 新規分析 and Part 2 CIRS flows.
 */
export async function openFirstCustomerInDisplayedOrder(
    page: Page
): Promise<OpenCustomerFromPhonebookEvidence> {
    await assertCustomersShellReady(page);
    const listWrapper = page.locator(PHONEBOOK_LIST_WRAPPER_SELECTOR);
    await expect(listWrapper).toBeAttached({ timeout: ACTION_TIMEOUT_MS });

    const loading = page.locator(PHONEBOOK_SET_LOADING_SELECTOR);
    if ((await loading.count()) > 0) {
        await expect(loading).toBeHidden({ timeout: PHONEBOOK_LIST_INIT_TIMEOUT_MS });
    }

    const records = phonebookCustomerRecordRows(page);
    const recordCount = await records.count();
    if (recordCount === 0) {
        throw new LimitDialogFlowError(
            'Customer list has no records under #phonebook-list-wrapper; cannot open a customer.'
        );
    }

    const firstRecord = records.first();
    await expect(firstRecord).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const nameCell = phonebookCustomerRecordDisplayName(firstRecord);
    await expect(nameCell).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const name = (await nameCell.textContent())?.trim() ?? '';
    if (!name) {
        throw new LimitDialogFlowError(
            'First customer record under #phonebook-list-wrapper had no readable name in its name div.'
        );
    }
    const furiganaCell = phonebookCustomerRecordFurigana(firstRecord);
    await expect(furiganaCell).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const furigana = (await furiganaCell.textContent())?.trim() ?? '';
    if (!furigana) {
        throw new LimitDialogFlowError(
            'First customer record under #phonebook-list-wrapper had no readable furigana cell.'
        );
    }

    await firstRecord.click({ timeout: ACTION_TIMEOUT_MS });
    await expect(page).toHaveURL(CUSTOMER_ID_URL, { timeout: ACTION_TIMEOUT_MS });
    const customerId = parseCustomerIdFromUrl(page.url());
    if (!customerId) {
        throw new LimitDialogFlowError('Customer URL did not contain a UUID customer id after open.');
    }
    await expect(
        customersMain(page).getByRole('heading', { level: 3, name, exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    return { name, customerId, furigana };
}

async function selectFirstCustomerInDisplayedOrder(
    page: Page
): Promise<SelectedCustomerEvidence> {
    const opened = await openFirstCustomerInDisplayedOrder(page);
    return { name: opened.name, customerId: opened.customerId };
}

/**
 * Returns to list shell at `/customers`. No established in-app "back to customer list" control
 * is wired in tests yet ({@link customerFlow} only uses 顧客一覧へもどる for registration dialogs).
 * `お客様を選択してください` is an empty-state hint, not navigation from a selected customer URL.
 */
async function returnToAuthenticatedCustomersShell(
    page: Page,
    env: LimitDialogEnvironment
): Promise<void> {
    const origin = env.appOrigin.replace(/\/$/, '');
    await page.goto(`${origin}/customers`, { waitUntil: 'domcontentloaded' });
    await assertCustomersShellReady(page);
}

type ApiObservation = {
    subscriptionBody: unknown | null;
    paymentHistoryResponse: Response | null;
    paymentHistoryBody: unknown | null;
    authProfileBody: unknown | null;
};

function loginContractSubscriptionBody(
    loginReadiness: ExistingUserCustomersReadiness
): unknown | null {
    const evidence = loginReadiness.contractSubscription;
    if (evidence?.status === 'verified') {
        return evidence.body;
    }
    return null;
}

function beginCustomersApiObservation(
    page: Page,
    authProfileBody: unknown | null,
    initialSubscriptionBody: unknown | null
): {
    consume: () => Promise<ApiObservation>;
} {
    let subscriptionBody: unknown | null = initialSubscriptionBody;
    let paymentHistoryResponse: Response | null = null;
    let paymentHistoryBody: unknown | null = null;

    const onResponse = async (response: Response) => {
        if (isContractSubscriptionGetResponse(response) && subscriptionBody === null) {
            try {
                subscriptionBody = await response.json();
            } catch {
                subscriptionBody = null;
            }
        }
        if (isContractPaymentHistoryProbeResponse(response) && paymentHistoryResponse === null) {
            paymentHistoryResponse = response;
            try {
                paymentHistoryBody = await response.json();
            } catch {
                paymentHistoryBody = null;
            }
        }
    };

    page.on('response', onResponse);

    return {
        consume: async () => {
            page.off('response', onResponse);
            return {
                subscriptionBody,
                paymentHistoryResponse,
                paymentHistoryBody,
                authProfileBody,
            };
        },
    };
}

function assertHardPrerequisites(evidence: LimitDialogPrerequisiteEvidence): void {
    if (!evidence.subscriptionObserved) {
        throw new LimitDialogPrerequisiteError(
            'Contract subscription GET was not observed; cannot verify Free Plan eligibility.'
        );
    }
    if (evidence.freePlanVerified !== true) {
        throw new LimitDialogPrerequisiteError(
            `Account Free Plan eligibility is not verified (freePlanVerified=${String(evidence.freePlanVerified)}): subscription=${JSON.stringify(evidence.subscriptionSnapshot)} evidence=${JSON.stringify(evidence.freePlanEvidence)}`
        );
    }
    if (evidence.accountAge.status === 'failed_under_14_days') {
        throw new LimitDialogPrerequisiteError(
            `Account age evidence indicates ${evidence.accountAge.accountAgeDays} days (<14).`
        );
    }
}

export type RunLimitDialogFlowOptions = {
    env?: LimitDialogEnvironment;
    /** When true (default), fail on hard prerequisite violations before triggers. */
    enforcePrerequisites?: boolean;
    authProfileBody?: unknown | null;
};

/**
 * Runs Limit Dialog sequence in the current authenticated session (no re-login).
 */
export async function runLimitDialogFlowAfterLogin(
    page: Page,
    account: SmokePart2AccountCredentials,
    loginReadiness: ExistingUserCustomersReadiness,
    options?: RunLimitDialogFlowOptions
): Promise<LimitDialogFlowResult> {
    const env = options?.env ?? DEFAULT_LIMIT_DIALOG_ENV;
    const enforcePrerequisites = options?.enforcePrerequisites ?? true;

    const authProfileBody =
        options?.authProfileBody ?? loginReadiness.authProfile ?? null;

    const subscriptionFromLogin = loginContractSubscriptionBody(loginReadiness);
    const apiObserver = beginCustomersApiObservation(
        page,
        authProfileBody,
        subscriptionFromLogin
    );
    await assertCustomersShellReady(page);

    const automaticOutcome = await observeAutomaticLimitDialog(page, env);

    const triggers: Record<LimitDialogTriggerId, LimitDialogTriggerStatus> = {
        plan_change: 'failed_missing_dialog',
        quick_analysis: 'failed_missing_dialog',
        new_analysis: 'failed_missing_dialog',
    };

    await test.step('limit dialog: プラン変更はこちら', async () => {
        await assertCustomersShellReady(page);
        triggers.plan_change = await runTriggerLimitDialogCheck(
            page,
            'plan_change',
            async () => {
                const link = page.getByRole('link', {
                    name: CUSTOMERS_PLAN_CHANGE_TRIGGER_TEXT,
                    exact: true,
                });
                const textTrigger = page.getByText(CUSTOMERS_PLAN_CHANGE_TRIGGER_TEXT, {
                    exact: true,
                });
                const trigger =
                    (await link.count()) > 0
                        ? link.first()
                        : textTrigger.first();
                await expect(trigger).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
                await trigger.click({ timeout: ACTION_TIMEOUT_MS });
            },
            env
        );
        if (triggers.plan_change !== 'verified_dismissed') {
            throw new LimitDialogFlowError(
                `プラン変更はこちら did not produce a dismissible Limit Dialog (${triggers.plan_change}).`
            );
        }
    });

    await test.step('limit dialog: クイック分析', async () => {
        await assertCustomersShellReady(page);
        triggers.quick_analysis = await runTriggerLimitDialogCheck(
            page,
            'quick_analysis',
            async () => {
                const button = page.getByText(CUSTOMERS_QUICK_ANALYSIS_TRIGGER_TEXT, { exact: true });
                await expect(button).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
                await button.click({ timeout: ACTION_TIMEOUT_MS });
            },
            env
        );
        if (triggers.quick_analysis !== 'verified_dismissed') {
            throw new LimitDialogFlowError(
                `クイック分析 did not produce a dismissible Limit Dialog (${triggers.quick_analysis}).`
            );
        }
    });

    let selectedCustomer: SelectedCustomerEvidence | null = null;

    await test.step('limit dialog: 新規分析 on first listed customer', async () => {
        selectedCustomer = await selectFirstCustomerInDisplayedOrder(page);
        triggers.new_analysis = await runTriggerLimitDialogCheck(
            page,
            'new_analysis',
            async () => {
                const newAnalysis = page.getByText(CUSTOMERS_NEW_ANALYSIS_TRIGGER_TEXT, { exact: true });
                await expect(newAnalysis).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
                await newAnalysis.click({ timeout: ACTION_TIMEOUT_MS });
            },
            env
        );
        if (triggers.new_analysis !== 'verified_dismissed') {
            throw new LimitDialogFlowError(
                `新規分析 did not produce a dismissible Limit Dialog (${triggers.new_analysis}).`
            );
        }
    });

    await test.step('limit dialog: return to authenticated customers shell', async () => {
        await returnToAuthenticatedCustomersShell(page, env);
    });

    const apiObservation = await apiObserver.consume();

    let subscriptionBody = apiObservation.subscriptionBody;
    if (!subscriptionBody) {
        try {
            subscriptionBody = await captureContractSubscriptionBodyForTrigger(
                page,
                () => page.reload({ waitUntil: 'domcontentloaded' }),
                8000
            );
        } catch {
            subscriptionBody = null;
        }
    }

    const limitDialogUiFreePlanVerified =
        triggers.plan_change === 'verified_dismissed' &&
        triggers.quick_analysis === 'verified_dismissed' &&
        triggers.new_analysis === 'verified_dismissed';

    let prerequisiteCore = {
        subscriptionObserved: false,
        subscriptionSnapshot: null as LimitDialogPrerequisiteEvidence['subscriptionSnapshot'],
        freePlanVerified: 'inconclusive' as boolean | 'inconclusive',
        freePlanEvidence: [] as LimitDialogPrerequisiteEvidence['freePlanEvidence'],
        neverPurchasedVerified: 'inconclusive' as boolean | 'inconclusive',
    };

    if (subscriptionBody) {
        prerequisiteCore = evaluateSubscriptionPrerequisites(subscriptionBody, {
            verifiedInTrialEndedDialog: limitDialogUiFreePlanVerified,
        });
    }

    let paymentHistory = enrichPaymentHistoryEvidence(
        evaluatePaymentHistoryProbe(apiObservation.paymentHistoryResponse),
        apiObservation.paymentHistoryBody
    );

    const prerequisites = mergePrerequisiteEvidence(
        prerequisiteCore,
        paymentHistory,
        apiObservation.authProfileBody
    );

    if (enforcePrerequisites) {
        assertHardPrerequisites(prerequisites);
    }

    if (account.email && loginReadiness.profileEmailVerified === false) {
        /* identity already validated at login; do not re-register auth/profile wait */
    }

    return {
        prerequisites,
        automaticOutcome,
        triggers,
        selectedCustomer,
        finalPathname: new URL(page.url()).pathname,
        loginReadinessPreserved: {
            profileEmailVerified: loginReadiness.profileEmailVerified,
            identityEvidenceStatus: loginReadiness.identityEvidence.status,
            takeoverDetected: loginReadiness.takeoverDetected,
            takeoverConfirmed: loginReadiness.takeoverConfirmed,
        },
    };
}
