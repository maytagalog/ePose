import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import type { CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import {
    assertSettingsRoute,
    waitForSettingsCompanyReadOnlyReady,
    type CompanyInformationFlowOptions,
} from '../../settings/companyInformation/companyInformationFlow';
import type { SmokeAccountRef } from '../../mypage/changeEmail/myPageChangeEmailFlow';
import { resolveStripeTestCardCredentials } from './planPurchaseConfig';

const ACTION_TIMEOUT_MS = 15000;
const CONTRACT_HYDRATION_TIMEOUT_MS = 30000;
const PAYMENT_FLOW_TIMEOUT_MS = 180000;

export const STG_CONTRACT_URL = 'https://app-stg.epose.com/contract';
export const STG_CONTRACT_PLANS_URL = 'https://app-stg.epose.com/contract/plans';
export const STG_CONTRACT_PAYMENT_URL = 'https://app-stg.epose.com/contract/payment-information';
export const STG_CONTRACT_PAYMENT_COMPLETE_URL =
    'https://app-stg.epose.com/contract/payment-complete';
export const STG_CONTRACT_HISTORY_URL = 'https://app-stg.epose.com/contract/history';

export const GET_CONTRACT_SUBSCRIPTION_URL = 'https://api-stg.epose.com/contract/subscription';
export const GET_CONTRACT_PAYMENT_HISTORY_URL =
    'https://api-stg.epose.com/contract/get_payment_history';
export const POST_CONTRACT_PLAN_URL = 'https://api-stg.epose.com/contract/plan';
export const AUTH_SECRETS_URL = 'https://api-stg.epose.com/auth/secrets';

export const SETTINGS_PLAN_BUTTON_NAME = 'プランの確認・変更はこちら';
export const CONTRACT_INFORMATION_TITLE = 'ご契約情報';
export const CONTRACT_CHANGE_PLAN_BUTTON = 'プランを変更する';
export const PLAN_SELECT_BUTTON_LABEL = 'このプランを選択';
export const PLAN_ENTER_PAYMENT_INFO_BUTTON = 'お支払い情報入力';
export const PAYMENT_METHOD_CREDIT_CARD = 'クレジットカード';
export const PAYMENT_SUBMIT_BUTTON = '決済を実行する';
export const PAYMENT_COMPLETE_HEADING = 'クレジットカード決済が完了しました';
export const RETURN_TO_CONTRACT_INFORMATION = 'ご契約情報へもどる';
export const CONTRACT_PAYMENT_HISTORY_LINK = '決済履歴';
/** ContractInformation PaymentHistoryWrapper navigates to /contract/history (bundle: onCheckPaymentHistory). */
export const CONTRACT_PAYMENT_HISTORY_NAV_LABEL = '決済履歴・領収書発行はこちら';
export const CONTRACT_PAYMENT_HISTORY_PROBE_LIMIT = 1;
export const CONTRACT_PAYMENT_HISTORY_FULL_LIMIT = 999;
export const PAYMENT_HISTORY_SUCCEEDED_LABEL = '支払済み';

export const THREE_MONTH_PLAN_DURATION = 3;
export const THREE_MONTH_PLAN_NAME_PATTERN = /3\s*ヶ月プラン/;

export const STRIPE_SECURE_FRAME_TITLE = 'セキュアな支払い入力フレーム';

export const PLAN_CARD_WRAPPER_SELECTOR = '.plan-selection-card-wrapper';
export const PLAN_CARD_SELECTION_TITLE_SELECTOR = '.card-selection-title';
export const PLAN_ORDER_SUMMARY_FOOTER_SELECTOR = '.billing-footer';

/** Payment-information: line-item row (plan label + unit price). */
export const PAYMENT_PAGE_BILLING_TOTAL_SELECTOR = '.billing-total';
/** Payment-information: footer final total (distinct from line-item price in `.billing-total`). */
export const PAYMENT_PAGE_FINAL_TOTAL_SELECTOR = '.billing-footer .billing-footer-price';

export function paymentPageBillingTotalLine(page: Page): Locator {
    return page.locator(PAYMENT_PAGE_BILLING_TOTAL_SELECTOR);
}

export function paymentPageFinalTotal(page: Page): Locator {
    return page.locator(PAYMENT_PAGE_FINAL_TOTAL_SELECTOR);
}

/**
 * Live payment history DOM (staging bundle PaymentHistoryTable, 2026-10):
 * - Ant Design Table `rowKey={(row) => row.id}` → `<tr data-row-key="…">`
 * - Row details: `.payment-history-table-row-item` (+ label/value children)
 * No stable per-row wrapper class beyond `data-row-key`; assert status/amount on the row locator.
 */

/** Contract information: current paid plan row (not upcoming auto-renewal block). */
export const CONTRACT_ACTIVE_PLAN_ROW_SELECTOR = 'div.active.break-row';
export const CONTRACT_RENEWAL_SECTION_LABEL = '次回更新される契約プラン';
export const CONTRACT_CURRENT_VALIDITY_PERIOD_LABEL = '有効期間';
export const CONTRACT_UPCOMING_VALIDITY_PERIOD_LABEL = '有効期間（予定）';
export const CONTRACT_BILLING_DATE_LABEL = 'ご請求日';

export function contractActivePlanRow(page: Page): Locator {
    return page.locator(CONTRACT_ACTIVE_PLAN_ROW_SELECTOR);
}

export function contractRenewalSection(page: Page): Locator {
    return page.getByText(CONTRACT_RENEWAL_SECTION_LABEL, { exact: true }).locator('..');
}

export function threeMonthPlanAutoRenewalLabel(planDisplayName: string): string {
    return `${planDisplayName}（自動更新）`;
}

export const CONTRACT_BILLING_NAME_LABEL = '請求先名';

/** Staging contract page: `.payment-method-label` is reused for クレジットカード and 請求先名 rows. */
export function contractCreditCardPaymentMethodLabel(page: Page): Locator {
    return page.locator('.payment-method-label').filter({ hasText: /^クレジットカード$/ });
}

export function contractCreditCardMaskedValue(page: Page): Locator {
    return contractCreditCardPaymentMethodLabel(page).locator('+ div');
}

export const DEFAULT_THREE_MONTH_PLAN_SELECTION: PlanSelectionCapture = {
    planDisplayName: '3ヶ月プラン',
    totalAmountYen: 29400,
    monthDuration: THREE_MONTH_PLAN_DURATION,
};

export type PlanPurchaseFlowOptions = CompanyInformationFlowOptions;

export class PlanPurchaseFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PlanPurchaseFlowError';
    }
}

export class PlanPurchasePersistenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PlanPurchasePersistenceError';
    }
}

export class PlanPurchaseEligibilityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PlanPurchaseEligibilityError';
    }
}

export type PlanSelectionCapture = {
    planDisplayName: string;
    totalAmountYen: number;
    monthDuration: number;
    /** When captured from plan/products UI or API during selection. */
    productId?: string | null;
};

export type ParsedSubscriptionPeriod = {
    subscriptionId: string | null;
    productId: string | null;
    status: string | null;
    interval: string | null;
    intervalCount: number | null;
    paymentMethod: string | null;
    paid: boolean | null;
    invoiceStatus: string | null;
    periodStart: number | null;
    periodEnd: number | null;
    cancelAtPeriodEnd: boolean | null;
};

export type SubscriptionPurchaseVerificationContext = {
    expectedProductId?: string | null;
    expectedSubscriptionId?: string | null;
};

const CONTRACT_DISPLAY_TIME_ZONE = 'Asia/Tokyo';

export type PaymentHistoryEntry = {
    id: string;
    amount: number;
    status: string;
    created?: number;
    receipt_url?: string | null;
};

export type SubscriptionEligibilityCategory =
    | 'eligible'
    | 'blocked_active_paid'
    | 'blocked_pending'
    | 'blocked_unknown_schema';

export type ContractSubscriptionSnapshot = {
    eligibilityCategory: SubscriptionEligibilityCategory;
    hasActivePaidCurrent: boolean;
    currentPlanLabel: string | null;
    currentStatus: string | null;
    hasPendingPaymentAction: boolean;
    hasPendingBankTransfer: boolean;
    hasUpcomingPaidPlan: boolean;
    summaryForLogs: Record<string, unknown>;
};

export type PlanPurchaseSubmitResult = {
    httpStatus: number;
    purchaseCorrelationId: string | null;
    paymentIntentId: string | null;
};

export class PaymentSubmissionGuard {
    private submitted = false;

    assertCanSubmit(): void {
        if (this.submitted) {
            throw new PlanPurchaseFlowError(
                'Payment submit was already attempted once; refusing automatic retry.'
            );
        }
    }

    markSubmitted(): void {
        this.submitted = true;
    }

    get hasSubmitted(): boolean {
        return this.submitted;
    }
}

export const STRIPE_API_HOST = 'api.stripe.com';
export const STRIPE_ELEMENTS_SESSIONS_PATH = '/v1/elements/sessions';
const STRIPE_TEST_MODE_WAIT_MS = ACTION_TIMEOUT_MS;

type StripeTestModeWaiter = {
    resolve: () => void;
    reject: (err: Error) => void;
};

type StripeTestModeObservation = {
    started: boolean;
    verified: boolean | null;
    waiters: StripeTestModeWaiter[];
    onResponse: (response: import('@playwright/test').Response) => void;
};

const stripeObservationByPage = new WeakMap<Page, StripeTestModeObservation>();

export function resetStripeTestModeObservationForTests(): void {
    // WeakMap entries are dropped with their Page; tests use fresh browser pages.
}

export function isStripeTestModeVerifiedForPage(page: Page): boolean {
    return stripeObservationByPage.get(page)?.verified === true;
}

export function isStripeElementsSessionsUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString);
        return url.hostname === STRIPE_API_HOST && url.pathname === STRIPE_ELEMENTS_SESSIONS_PATH;
    } catch {
        return false;
    }
}

/** Stripe Elements session GET uses the `key` query param for the publishable key. */
export function buildStripeElementsSessionsRequestUrl(publishableKey: string): string {
    const url = new URL(`https://${STRIPE_API_HOST}${STRIPE_ELEMENTS_SESSIONS_PATH}`);
    url.searchParams.set('key', publishableKey);
    url.searchParams.set('type', 'setup_intent');
    return url.toString();
}

export function parsePublishableKeyFromElementsSessionsUrl(urlString: string): string | null {
    if (!isStripeElementsSessionsUrl(urlString)) {
        return null;
    }
    const key = new URL(urlString).searchParams.get('key');
    if (!key || (!key.startsWith('pk_test_') && !key.startsWith('pk_live_'))) {
        return null;
    }
    return key;
}

function stripeLiveKeyError(): PlanPurchaseFlowError {
    return new PlanPurchaseFlowError(
        'Stripe publishable key is live (pk_live_); refusing test card payment.'
    );
}

function stripeTestModeNotVerifiedError(): PlanPurchaseFlowError {
    return new PlanPurchaseFlowError(
        'Stripe test mode was not verified (expected pk_test_ from Stripe Elements session) before payment submit.'
    );
}

function settleStripeTestModeWaiters(state: StripeTestModeObservation): void {
    if (state.verified !== true && state.verified !== false) {
        return;
    }
    const waiters = state.waiters;
    state.waiters = [];
    if (state.verified === true) {
        for (const waiter of waiters) {
            waiter.resolve();
        }
        return;
    }
    const err = stripeLiveKeyError();
    for (const waiter of waiters) {
        waiter.reject(err);
    }
}

export function recordStripePublishableKeyEvidence(
    state: StripeTestModeObservation,
    key: string | null | undefined
): void {
    if (!key) {
        return;
    }
    if (key.startsWith('pk_live_')) {
        state.verified = false;
        settleStripeTestModeWaiters(state);
        return;
    }
    if (key.startsWith('pk_test_')) {
        if (state.verified === false) {
            return;
        }
        state.verified = true;
        settleStripeTestModeWaiters(state);
    }
}

function ingestStripeElementsSessionsResponse(
    state: StripeTestModeObservation,
    response: import('@playwright/test').Response
): void {
    const requestUrl = response.request().url();
    if (response.request().method() !== 'GET') {
        return;
    }
    if (!isStripeElementsSessionsUrl(requestUrl)) {
        return;
    }
    if (response.status() !== 200) {
        return;
    }
    const key = parsePublishableKeyFromElementsSessionsUrl(requestUrl);
    recordStripePublishableKeyEvidence(state, key);
}

function waitForStripeTestModeResolution(
    state: StripeTestModeObservation,
    timeoutMs: number
): Promise<void> {
    if (state.verified === true) {
        return Promise.resolve();
    }
    if (state.verified === false) {
        return Promise.reject(stripeLiveKeyError());
    }

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const index = state.waiters.indexOf(waiter);
            if (index >= 0) {
                state.waiters.splice(index, 1);
            }
            reject(stripeTestModeNotVerifiedError());
        }, timeoutMs);

        const waiter: StripeTestModeWaiter = {
            resolve: () => {
                clearTimeout(timer);
                resolve();
            },
            reject: (err: Error) => {
                clearTimeout(timer);
                reject(err);
            },
        };
        state.waiters.push(waiter);
    });
}

/**
 * Call as early as practical in the session (login / plan flow) so Stripe Elements traffic is observed.
 * Idempotent per Page; does not leak verification across pages or sessions.
 */
export function beginStripeTestModeObservation(page: Page): void {
    const existing = stripeObservationByPage.get(page);
    if (existing?.started) {
        return;
    }

    const state: StripeTestModeObservation = {
        started: true,
        verified: null,
        waiters: [],
        onResponse: () => {},
    };

    state.onResponse = async (response) => {
        try {
            ingestStripeElementsSessionsResponse(state, response);

            if (
                response.url() === AUTH_SECRETS_URL &&
                response.request().method() === 'POST' &&
                response.status() === 200
            ) {
                const key = findPublishableKeyInSecretsBody(await response.json());
                recordStripePublishableKeyEvidence(state, key);
            }
        } catch {
            // Ignore individual response parse failures.
        }
    };

    page.on('response', state.onResponse);
    stripeObservationByPage.set(page, state);
}

export function endStripeTestModeObservation(page: Page): void {
    const state = stripeObservationByPage.get(page);
    if (!state) {
        return;
    }
    page.off('response', state.onResponse);
    state.waiters = [];
    stripeObservationByPage.delete(page);
}

export async function requireStripeTestModeVerified(page: Page): Promise<void> {
    beginStripeTestModeObservation(page);
    const state = stripeObservationByPage.get(page);
    if (!state) {
        throw stripeTestModeNotVerifiedError();
    }
    if (state.verified === true) {
        return;
    }
    if (state.verified === false) {
        throw stripeLiveKeyError();
    }

    const responseWait = page
        .waitForResponse(
            (res) =>
                res.request().method() === 'GET' &&
                isStripeElementsSessionsUrl(res.request().url()) &&
                res.status() === 200,
            { timeout: STRIPE_TEST_MODE_WAIT_MS }
        )
        .then((response) => {
            ingestStripeElementsSessionsResponse(state, response);
        })
        .catch(() => {
            // Listener may have ingested the session already; fall through to waiter resolution.
        });

    try {
        await Promise.race([waitForStripeTestModeResolution(state, STRIPE_TEST_MODE_WAIT_MS), responseWait]);
    } catch (err) {
        if (err instanceof PlanPurchaseFlowError) {
            throw err;
        }
    }

    if (state.verified === true) {
        return;
    }
    if (state.verified === false) {
        throw stripeLiveKeyError();
    }
    throw stripeTestModeNotVerifiedError();
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAllYenAmountsFromText(text: string): number[] {
    return [...text.replace(/,/g, '').matchAll(/¥\s*(\d+)/g)]
        .map((match) => Number(match[1]))
        .filter((amount) => Number.isFinite(amount));
}

export function yenAmountRegex(amountYen: number): RegExp {
    const withCommas = amountYen.toLocaleString('en-US');
    const commaFlexible = withCommas.replace(/,/g, ',?');
    return new RegExp(`¥\\s*(?:${commaFlexible}|${amountYen})(?!\\d)`);
}

export function extractLabeledYenTotal(text: string, labels: string[]): number | null {
    const normalized = text.replace(/,/g, '');
    for (const label of labels) {
        const pattern = new RegExp(`${label}[\\s\\S]{0,48}¥\\s*(\\d+)`);
        const match = normalized.match(pattern);
        if (match) {
            const parsed = Number(match[1]);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return null;
}

export function amountsEqualYen(a: number, b: number): boolean {
    return a === b;
}

export function findPublishableKeyInSecretsBody(body: unknown): string | null {
    const visit = (node: unknown): string | null => {
        if (typeof node === 'string' && node.startsWith('pk_')) {
            return node;
        }
        if (Array.isArray(node)) {
            for (const item of node) {
                const found = visit(item);
                if (found) {
                    return found;
                }
            }
            return null;
        }
        if (isJsonObject(node)) {
            for (const value of Object.values(node)) {
                const found = visit(value);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    };
    return visit(body);
}

function planNameLooksFree(planName: string | null): boolean {
    return !!planName && /free|フリー/i.test(planName);
}

function planNameLooksPaid(planName: string | null): boolean {
    return !!planName && !planNameLooksFree(planName);
}

function readUnixEpochSeconds(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function readBooleanField(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
        return value;
    }
    return null;
}

function readStringField(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readIntervalCount(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function parseSubscriptionPeriodNode(node: unknown): ParsedSubscriptionPeriod | null {
    if (!isJsonObject(node)) {
        return null;
    }
    return {
        subscriptionId: readStringField(node.subscriptionId),
        productId: readStringField(node.productId),
        status: readStringField(node.status),
        interval: readStringField(node.interval),
        intervalCount: readIntervalCount(node.intervalCount),
        paymentMethod: readStringField(node.paymentMethod),
        paid: readBooleanField(node.paid),
        invoiceStatus: readStringField(node.invoiceStatus),
        periodStart: readUnixEpochSeconds(node.periodStart),
        periodEnd: readUnixEpochSeconds(node.periodEnd),
        cancelAtPeriodEnd: readBooleanField(node.cancelAtPeriodEnd),
    };
}

export function subscriptionPeriodIsThreeMonthPlan(period: ParsedSubscriptionPeriod): boolean {
    return period.interval === 'month' && period.intervalCount === THREE_MONTH_PLAN_DURATION;
}

export function subscriptionPeriodIsActivePaidCurrent(period: ParsedSubscriptionPeriod): boolean {
    if (period.status !== 'active') {
        return false;
    }
    if (period.paid !== true) {
        return false;
    }
    if (period.invoiceStatus != null && period.invoiceStatus !== 'paid') {
        return false;
    }
    return subscriptionPeriodIsThreeMonthPlan(period);
}

export function formatContractPeriodBoundary(epochSeconds: number): string {
    const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
        timeZone: CONTRACT_DISPLAY_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
        .format(new Date(epochSeconds * 1000))
        .split('-');
    return `${year}/${month}/${day}`;
}

export function formatContractPeriodRange(periodStartSec: number, periodEndSec: number): string {
    return `${formatContractPeriodBoundary(periodStartSec)}~${formatContractPeriodBoundary(periodEndSec)}`;
}

export function parseSubscriptionEnvelope(body: unknown): {
    current: Record<string, unknown> | null;
    upcoming: Record<string, unknown> | null;
} {
    const envelope = isJsonObject(body) ? body : null;
    if (!envelope) {
        throw new PlanPurchasePersistenceError('subscription refresh returned non-object JSON.');
    }
    const root = isJsonObject(envelope.data) ? envelope.data : envelope;
    if (!isJsonObject(root)) {
        throw new PlanPurchasePersistenceError('subscription refresh payload shape was unexpected.');
    }
    const current = isJsonObject(root.current) ? root.current : null;
    const upcoming = isJsonObject(root.upcoming) ? root.upcoming : null;
    return { current, upcoming };
}

export function contractLabeledAdjacentValue(scope: Locator, label: string): Locator {
    return scope.getByText(label, { exact: true }).locator('+ div');
}

const DOCUMENTED_SUBSCRIPTION_STATUSES = new Set([
    'active',
    'trialing',
    'past_due',
    'canceled',
    'incomplete_expired',
]);

function resolveSubscriptionRoot(body: unknown): Record<string, unknown> {
    const envelope = isJsonObject(body) ? body : null;
    if (!envelope) {
        throw new PlanPurchaseEligibilityError(
            'subscription response was not a JSON object; cannot determine eligibility.'
        );
    }

    const root =
        isJsonObject(envelope.data) && ('current' in envelope.data || 'upcoming' in envelope.data)
            ? envelope.data
            : envelope;

    if (!isJsonObject(root)) {
        throw new PlanPurchaseEligibilityError(
            'subscription payload shape is unknown; refusing to assume purchase eligibility.'
        );
    }

    return root;
}

function isExplicitNoSubscriptionRoot(root: Record<string, unknown>): boolean {
    return 'current' in root && root.current === null && (!('upcoming' in root) || root.upcoming === null);
}

export function buildContractSubscriptionSnapshot(body: unknown): ContractSubscriptionSnapshot {
    const root = resolveSubscriptionRoot(body);

    if (Object.keys(root).length === 0) {
        throw new PlanPurchaseEligibilityError(
            'subscription response was an empty object; refusing to assume purchase eligibility.'
        );
    }

    if (!('current' in root) && !('upcoming' in root)) {
        throw new PlanPurchaseEligibilityError(
            'subscription response missing current/upcoming fields; schema unknown.'
        );
    }

    const currentRaw = root.current;
    const upcomingRaw = root.upcoming;

    if (currentRaw !== null && currentRaw !== undefined && !isJsonObject(currentRaw)) {
        throw new PlanPurchaseEligibilityError(
            'subscription current field is malformed; expected object or null.'
        );
    }
    if (upcomingRaw !== null && upcomingRaw !== undefined && !isJsonObject(upcomingRaw)) {
        throw new PlanPurchaseEligibilityError(
            'subscription upcoming field is malformed; expected object or null.'
        );
    }

    const current = isJsonObject(currentRaw) ? currentRaw : null;
    const upcoming = isJsonObject(upcomingRaw) ? upcomingRaw : null;

    if (current && Object.keys(current).length === 0) {
        throw new PlanPurchaseEligibilityError(
            'subscription current object is empty; malformed schema.'
        );
    }
    const pendingBank = root.oneTimeInvoicePendingSubscription;
    const requiresAction = root.requiresActionPendingSubscription;

    const currentStatus = typeof current?.status === 'string' ? current.status : null;
    const currentPlanName =
        typeof current?.planName === 'string'
            ? current.planName
            : typeof current?.name === 'string'
              ? current.name
              : null;

    const currentParsed = current ? parseSubscriptionPeriodNode(current) : null;
    const upcomingParsed = upcoming ? parseSubscriptionPeriodNode(upcoming) : null;

    const hasPendingPaymentAction = !!requiresAction;
    const hasPendingBankTransfer = !!pendingBank;

    const activeLikeStatuses = new Set(['active', 'trialing', 'past_due']);
    const hasStructuredActivePaid =
        !!currentParsed && subscriptionPeriodIsActivePaidCurrent(currentParsed);
    const hasLegacyActivePaid =
        !!current &&
        !!currentStatus &&
        activeLikeStatuses.has(currentStatus) &&
        planNameLooksPaid(currentPlanName);
    const hasActivePaidCurrent = hasStructuredActivePaid || hasLegacyActivePaid;

    const upcomingPlanName =
        typeof upcoming?.planName === 'string'
            ? upcoming.planName
            : typeof upcoming?.name === 'string'
              ? upcoming.name
              : null;
    const hasStructuredUpcomingPaid =
        !!upcomingParsed &&
        upcomingParsed.paid === true &&
        subscriptionPeriodIsThreeMonthPlan(upcomingParsed);
    const hasLegacyUpcomingPaid = !!upcoming && planNameLooksPaid(upcomingPlanName);
    const hasUpcomingPaidPlan = hasStructuredUpcomingPaid || hasLegacyUpcomingPaid;

    let eligibilityCategory: SubscriptionEligibilityCategory;

    if (hasPendingPaymentAction || hasPendingBankTransfer) {
        eligibilityCategory = 'blocked_pending';
    } else if (hasActivePaidCurrent || hasUpcomingPaidPlan) {
        eligibilityCategory = 'blocked_active_paid';
    } else if (isExplicitNoSubscriptionRoot(root)) {
        eligibilityCategory = 'eligible';
    } else if (
        current &&
        currentStatus &&
        (currentStatus === 'canceled' || currentStatus === 'incomplete_expired')
    ) {
        eligibilityCategory = 'eligible';
    } else if (
        current &&
        currentStatus &&
        activeLikeStatuses.has(currentStatus) &&
        planNameLooksFree(currentPlanName)
    ) {
        eligibilityCategory = 'eligible';
    } else if (current && currentStatus && !DOCUMENTED_SUBSCRIPTION_STATUSES.has(currentStatus)) {
        eligibilityCategory = 'blocked_unknown_schema';
    } else if (current && !currentPlanName && currentParsed?.interval != null) {
        eligibilityCategory = 'blocked_unknown_schema';
    } else if (current && !currentPlanName) {
        eligibilityCategory = 'blocked_unknown_schema';
    } else {
        eligibilityCategory = 'blocked_unknown_schema';
    }

    return {
        eligibilityCategory,
        hasActivePaidCurrent,
        currentPlanLabel: currentPlanName,
        currentStatus,
        hasPendingPaymentAction,
        hasPendingBankTransfer,
        hasUpcomingPaidPlan,
        summaryForLogs: {
            eligibilityCategory,
            currentStatus,
            currentPlanName,
            currentProductId: currentParsed?.productId ?? null,
            currentInterval: currentParsed?.interval ?? null,
            currentIntervalCount: currentParsed?.intervalCount ?? null,
            currentPaid: currentParsed?.paid ?? null,
            hasUpcoming: !!upcoming,
            upcomingPlanName,
            upcomingPaid: upcomingParsed?.paid ?? null,
            hasPendingBank: !!pendingBank,
            hasRequiresAction: !!requiresAction,
        },
    };
}

export function assertEligibleForThreeMonthCreditCardPurchase(
    snapshot: ContractSubscriptionSnapshot
): void {
    if (snapshot.eligibilityCategory === 'blocked_pending') {
        throw new PlanPurchaseEligibilityError(
            `Account has pending subscription action; resolve before purchasing. State: ${JSON.stringify(snapshot.summaryForLogs)}`
        );
    }
    if (snapshot.eligibilityCategory === 'blocked_active_paid') {
        throw new PlanPurchaseEligibilityError(
            `Account already has an active or upcoming paid plan; 3-month purchase not attempted. State: ${JSON.stringify(snapshot.summaryForLogs)}`
        );
    }
    if (snapshot.eligibilityCategory === 'blocked_unknown_schema') {
        throw new PlanPurchaseEligibilityError(
            `Subscription schema did not match a known eligible state; refusing purchase. State: ${JSON.stringify(snapshot.summaryForLogs)}`
        );
    }
    if (snapshot.eligibilityCategory !== 'eligible') {
        throw new PlanPurchaseEligibilityError(
            `Unexpected eligibility category ${snapshot.eligibilityCategory}. State: ${JSON.stringify(snapshot.summaryForLogs)}`
        );
    }
}

export function assertSubscriptionReflectsThreeMonthPurchase(
    body: unknown,
    selection: PlanSelectionCapture,
    context?: SubscriptionPurchaseVerificationContext
): void {
    const { current, upcoming } = parseSubscriptionEnvelope(body);
    const currentParsed = current ? parseSubscriptionPeriodNode(current) : null;
    const upcomingParsed = upcoming ? parseSubscriptionPeriodNode(upcoming) : null;

    if (!currentParsed) {
        throw new PlanPurchasePersistenceError(
            'Expected subscription current period after purchase; current was missing or malformed.'
        );
    }

    if (!subscriptionPeriodIsActivePaidCurrent(currentParsed)) {
        throw new PlanPurchasePersistenceError(
            `Current subscription did not match active paid 3-month plan. Got ${JSON.stringify(currentParsed)}`
        );
    }

    if (currentParsed.periodStart == null || currentParsed.periodEnd == null) {
        throw new PlanPurchasePersistenceError(
            'Current subscription periodStart/periodEnd are required after purchase.'
        );
    }

    if (upcomingParsed) {
        if (!subscriptionPeriodIsThreeMonthPlan(upcomingParsed)) {
            throw new PlanPurchasePersistenceError(
                `Upcoming renewal interval did not match 3-month plan. Got ${JSON.stringify({
                    interval: upcomingParsed.interval,
                    intervalCount: upcomingParsed.intervalCount,
                })}`
            );
        }
        if (upcomingParsed.periodStart == null || upcomingParsed.periodEnd == null) {
            throw new PlanPurchasePersistenceError(
                'Upcoming subscription periodStart/periodEnd are required when upcoming is present.'
            );
        }
        if (upcomingParsed.periodStart !== currentParsed.periodEnd) {
            throw new PlanPurchasePersistenceError(
                `Upcoming periodStart (${upcomingParsed.periodStart}) did not continue from current periodEnd (${currentParsed.periodEnd}).`
            );
        }
        if (
            currentParsed.productId &&
            upcomingParsed.productId &&
            currentParsed.productId !== upcomingParsed.productId
        ) {
            throw new PlanPurchasePersistenceError(
                'Upcoming productId did not match current subscription productId.'
            );
        }
    }

    const expectedProductId = context?.expectedProductId ?? selection.productId ?? null;
    if (expectedProductId && currentParsed.productId && currentParsed.productId !== expectedProductId) {
        throw new PlanPurchasePersistenceError(
            `Subscription productId ${currentParsed.productId} did not match selected product ${expectedProductId}.`
        );
    }

    const expectedSubscriptionId = context?.expectedSubscriptionId ?? null;
    if (
        expectedSubscriptionId &&
        currentParsed.subscriptionId &&
        currentParsed.subscriptionId !== expectedSubscriptionId
    ) {
        throw new PlanPurchasePersistenceError(
            `Subscription id ${currentParsed.subscriptionId} did not match purchase response ${expectedSubscriptionId}.`
        );
    }

    if (typeof current?.monthDuration === 'number' && current.monthDuration !== selection.monthDuration) {
        throw new PlanPurchasePersistenceError(
            `Legacy monthDuration ${current.monthDuration} did not match selected ${selection.monthDuration}-month plan.`
        );
    }
}

export async function verifyContractDisplayedPeriodsMatchSubscription(
    page: Page,
    subscriptionBody: unknown
): Promise<void> {
    const { current, upcoming } = parseSubscriptionEnvelope(subscriptionBody);
    const currentParsed = current ? parseSubscriptionPeriodNode(current) : null;
    if (
        !currentParsed ||
        currentParsed.periodStart == null ||
        currentParsed.periodEnd == null
    ) {
        throw new PlanPurchasePersistenceError(
            'Cannot verify contract period UI without current periodStart/periodEnd.'
        );
    }

    const activePlanRow = contractActivePlanRow(page);
    const currentValidityLabel = activePlanRow.getByText(CONTRACT_CURRENT_VALIDITY_PERIOD_LABEL, {
        exact: true,
    });
    await expect(currentValidityLabel).toHaveCount(1);
    await expect(currentValidityLabel).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const currentPeriodValue = contractLabeledAdjacentValue(
        activePlanRow,
        CONTRACT_CURRENT_VALIDITY_PERIOD_LABEL
    );
    await expect(currentPeriodValue).toHaveCount(1);
    await expect(currentPeriodValue).toHaveText(
        formatContractPeriodRange(currentParsed.periodStart, currentParsed.periodEnd),
        { timeout: ACTION_TIMEOUT_MS }
    );

    const upcomingParsed = upcoming ? parseSubscriptionPeriodNode(upcoming) : null;
    if (
        upcomingParsed &&
        upcomingParsed.periodStart != null &&
        upcomingParsed.periodEnd != null
    ) {
        const renewalSection = contractRenewalSection(page);

        const upcomingValidityLabel = renewalSection.getByText(
            CONTRACT_UPCOMING_VALIDITY_PERIOD_LABEL,
            { exact: true }
        );
        await expect(upcomingValidityLabel).toHaveCount(1);
        await expect(upcomingValidityLabel).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

        const renewalPeriodValue = contractLabeledAdjacentValue(
            renewalSection,
            CONTRACT_UPCOMING_VALIDITY_PERIOD_LABEL
        );
        await expect(renewalPeriodValue).toHaveCount(1);
        await expect(renewalPeriodValue).toHaveText(
            formatContractPeriodRange(upcomingParsed.periodStart, upcomingParsed.periodEnd),
            { timeout: ACTION_TIMEOUT_MS }
        );

        const billingDateLabel = renewalSection.getByText(CONTRACT_BILLING_DATE_LABEL, {
            exact: true,
        });
        await expect(billingDateLabel).toHaveCount(1);
        await expect(billingDateLabel).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

        const billingDateValue = contractLabeledAdjacentValue(
            renewalSection,
            CONTRACT_BILLING_DATE_LABEL
        );
        await expect(billingDateValue).toHaveCount(1);
        await expect(billingDateValue).toHaveText(
            formatContractPeriodBoundary(upcomingParsed.periodStart),
            { timeout: ACTION_TIMEOUT_MS }
        );
    }
}

export function assertPaymentHistoryResponseParseable(body: unknown): void {
    if (Array.isArray(body)) {
        return;
    }
    if (isJsonObject(body)) {
        if (!('data' in body)) {
            return;
        }
        const data = body.data;
        if (data === null || Array.isArray(data)) {
            return;
        }
        throw new PlanPurchaseFlowError(
            'payment history API returned non-array data; baseline cannot be established.'
        );
    }
    throw new PlanPurchaseFlowError(
        'payment history API response was not JSON array/object; baseline cannot be established.'
    );
}

export function parsePaymentHistoryEntries(body: unknown): PaymentHistoryEntry[] {
    const root = isJsonObject(body) && Array.isArray(body.data) ? body.data : body;
    if (!Array.isArray(root)) {
        if (isJsonObject(body) && Array.isArray(body.data)) {
            return parsePaymentHistoryEntries(body.data);
        }
        return [];
    }
    const entries: PaymentHistoryEntry[] = [];
    for (const row of root) {
        if (!isJsonObject(row)) {
            continue;
        }
        const id = typeof row.id === 'string' ? row.id : String(row.id ?? '');
        if (!id) {
            continue;
        }
        const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount);
        const status = typeof row.status === 'string' ? row.status : '';
        entries.push({
            id,
            amount: Number.isFinite(amount) ? amount : NaN,
            status,
            created: typeof row.created === 'number' ? row.created : undefined,
            receipt_url: typeof row.receipt_url === 'string' ? row.receipt_url : null,
        });
    }
    return entries;
}

export function findNewPaymentHistoryEntry(
    entries: PaymentHistoryEntry[],
    options: {
        expectedAmountYen: number;
        runStartedAtMs: number;
        idsBefore: Set<string>;
        purchaseCorrelationId?: string | null;
    }
): PaymentHistoryEntry | null {
    const { expectedAmountYen, runStartedAtMs, idsBefore, purchaseCorrelationId } = options;

    if (purchaseCorrelationId) {
        const byId = entries.find(
            (entry) =>
                entry.id === purchaseCorrelationId ||
                entry.id.includes(purchaseCorrelationId) ||
                purchaseCorrelationId.includes(entry.id)
        );
        if (byId && byId.status === 'succeeded' && amountsEqualYen(byId.amount, expectedAmountYen)) {
            return byId;
        }
    }

    const newlySeen = entries.filter((entry) => !idsBefore.has(entry.id));
    const candidates = newlySeen.filter((entry) => {
        if (entry.status !== 'succeeded') {
            return false;
        }
        if (!amountsEqualYen(entry.amount, expectedAmountYen)) {
            return false;
        }
        if (entry.created !== undefined) {
            return entry.created * 1000 >= runStartedAtMs - 120_000;
        }
        return false;
    });

    if (candidates.length === 1) {
        return candidates[0] ?? null;
    }
    if (candidates.length > 1) {
        candidates.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
        return candidates[0] ?? null;
    }

    if (idsBefore.size === 0) {
        return null;
    }

    const newWithoutTimestamp = newlySeen.filter(
        (entry) =>
            entry.status === 'succeeded' &&
            amountsEqualYen(entry.amount, expectedAmountYen) &&
            entry.created === undefined
    );
    if (newWithoutTimestamp.length === 1) {
        return newWithoutTimestamp[0] ?? null;
    }

    return null;
}

export function findPaymentHistoryEntryById(
    entries: PaymentHistoryEntry[],
    paymentHistoryId: string
): PaymentHistoryEntry | null {
    const trimmed = paymentHistoryId.trim();
    if (!trimmed) {
        return null;
    }
    return entries.find((entry) => entry.id === trimmed) ?? null;
}

/** @deprecated Prefer findNewPaymentHistoryEntry with idsBefore baseline. */
export function findPaymentHistoryEntryForRun(
    entries: PaymentHistoryEntry[],
    expectedAmountYen: number,
    runStartedAtMs: number
): PaymentHistoryEntry | null {
    return findNewPaymentHistoryEntry(entries, {
        expectedAmountYen,
        runStartedAtMs,
        idsBefore: new Set(),
    });
}

export function extractApiErrorMessage(body: unknown): string | null {
    if (!isJsonObject(body)) {
        return null;
    }
    for (const key of ['message', 'error', 'detail', 'title']) {
        const value = body[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    if (isJsonObject(body.data)) {
        return extractApiErrorMessage(body.data);
    }
    return null;
}

export function parsePlanPostResponse(body: unknown, httpStatus: number): PlanPurchaseSubmitResult {
    if (httpStatus !== 200) {
        const apiMessage = extractApiErrorMessage(body);
        throw new PlanPurchaseFlowError(
            apiMessage
                ? `Plan purchase API returned HTTP ${httpStatus}: ${apiMessage}`
                : `Plan purchase API returned HTTP ${httpStatus}.`
        );
    }

    const root = isJsonObject(body) && isJsonObject(body.data) ? body.data : body;
    const pickId = (node: unknown): string | null => {
        if (!isJsonObject(node)) {
            return null;
        }
        for (const key of [
            'paymentIntentId',
            'payment_intent_id',
            'subscriptionId',
            'subscription_id',
            'invoiceId',
            'invoice_id',
            'id',
        ]) {
            const value = node[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return null;
    };

    const purchaseCorrelationId = pickId(root) ?? pickId(body);
    const paymentIntentId =
        isJsonObject(root) && typeof root.paymentIntentId === 'string'
            ? root.paymentIntentId
            : isJsonObject(root) && typeof root.payment_intent_id === 'string'
              ? root.payment_intent_id
              : null;

    return {
        httpStatus,
        purchaseCorrelationId,
        paymentIntentId,
    };
}

function isContractSubscriptionGetResponse(res: Response): boolean {
    return (
        res.url().startsWith(GET_CONTRACT_SUBSCRIPTION_URL) &&
        res.request().method() === 'GET' &&
        res.status() === 200
    );
}

async function readApiResponseJsonBody(response: Response, label: string): Promise<unknown> {
    try {
        return await response.json();
    } catch (err) {
        throw new PlanPurchaseFlowError(
            `${label} response body unavailable (consume JSON before navigation): ${String(err)}`
        );
    }
}

/**
 * Register subscription GET observation, run `trigger` (navigation/click), consume JSON from that
 * document load before any later navigation.
 */
export async function captureContractSubscriptionBodyForTrigger(
    page: Page,
    trigger: () => Promise<unknown>,
    timeoutMs = CONTRACT_HYDRATION_TIMEOUT_MS
): Promise<unknown> {
    const bodyPromise = page
        .waitForResponse((res) => isContractSubscriptionGetResponse(res), { timeout: timeoutMs })
        .then((res) => readApiResponseJsonBody(res, 'Contract subscription GET'));

    await Promise.all([bodyPromise, trigger()]);
    return bodyPromise;
}

/** @deprecated Prefer captureContractSubscriptionBodyForTrigger tied to the navigation that fires the GET. */
export async function waitForContractSubscriptionGet(
    page: Page,
    timeoutMs = CONTRACT_HYDRATION_TIMEOUT_MS
): Promise<unknown> {
    const response = await page.waitForResponse(
        (res) => isContractSubscriptionGetResponse(res),
        { timeout: timeoutMs }
    );
    return readApiResponseJsonBody(response, 'Contract subscription GET');
}

export function contractPaymentHistoryRequestKind(url: string): 'probe' | 'full' | 'unknown' {
    try {
        const parsed = new URL(url);
        if (!parsed.href.startsWith(GET_CONTRACT_PAYMENT_HISTORY_URL)) {
            return 'unknown';
        }
        const limit = parsed.searchParams.get('limit');
        if (limit === String(CONTRACT_PAYMENT_HISTORY_PROBE_LIMIT)) {
            return 'probe';
        }
        if (limit === String(CONTRACT_PAYMENT_HISTORY_FULL_LIMIT)) {
            return 'full';
        }
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

function isContractPaymentHistoryProbeResponse(res: Response): boolean {
    return (
        res.request().method() === 'GET' &&
        contractPaymentHistoryRequestKind(res.url()) === 'probe'
    );
}

function isContractPaymentHistoryFullResponse(res: Response): boolean {
    return (
        res.request().method() === 'GET' &&
        contractPaymentHistoryRequestKind(res.url()) === 'full' &&
        res.status() === 200
    );
}

export async function waitForContractPaymentHistoryProbeGet(
    page: Page,
    timeoutMs = CONTRACT_HYDRATION_TIMEOUT_MS
): Promise<unknown> {
    const response = await page.waitForResponse(
        (res) => isContractPaymentHistoryProbeResponse(res),
        { timeout: timeoutMs }
    );
    if (response.status() !== 200) {
        throw new PlanPurchaseFlowError(
            `Payment history probe (limit=${CONTRACT_PAYMENT_HISTORY_PROBE_LIMIT}) returned HTTP ${response.status()}; baseline cannot be established.`
        );
    }
    return readApiResponseJsonBody(response, 'Payment history probe GET');
}

async function captureContractPaymentHistoryFullForTrigger(
    page: Page,
    trigger: () => Promise<void>,
    timeoutMs = CONTRACT_HYDRATION_TIMEOUT_MS
): Promise<unknown> {
    const bodyPromise = page
        .waitForResponse((res) => isContractPaymentHistoryFullResponse(res), { timeout: timeoutMs })
        .then((res) => readApiResponseJsonBody(res, 'Payment history full GET'));

    await Promise.all([bodyPromise, trigger()]);
    return bodyPromise;
}

export async function waitForContractPaymentHistoryFullGet(
    page: Page,
    timeoutMs = CONTRACT_HYDRATION_TIMEOUT_MS
): Promise<unknown> {
    const response = await page.waitForResponse(
        (res) => isContractPaymentHistoryFullResponse(res),
        { timeout: timeoutMs }
    );
    return readApiResponseJsonBody(response, 'Payment history full GET');
}

/** @deprecated Prefer waitForContractPaymentHistoryProbeGet or waitForContractPaymentHistoryFullGet. */
export async function waitForContractPaymentHistoryGet(
    page: Page,
    timeoutMs = CONTRACT_HYDRATION_TIMEOUT_MS
): Promise<unknown> {
    return waitForContractPaymentHistoryFullGet(page, timeoutMs);
}

export function hasPaymentHistoryFromProbeBody(probeBody: unknown): boolean {
    assertPaymentHistoryResponseParseable(probeBody);
    return parsePaymentHistoryEntries(probeBody).length > 0;
}

export function contractPaymentHistoryNavControl(page: Page): Locator {
    return page.getByText(CONTRACT_PAYMENT_HISTORY_NAV_LABEL, { exact: true });
}

/**
 * Contract page is already hydrated (probe limit=1 may have completed). Register full-list wait,
 * then open payment history via the nav control.
 */
export async function openPaymentHistoryFromContractAndAwaitFullResponse(
    page: Page
): Promise<unknown> {
    const historyNav = contractPaymentHistoryNavControl(page);
    await expect(historyNav).toHaveCount(1);
    await expect(historyNav).toBeVisible({ timeout: CONTRACT_HYDRATION_TIMEOUT_MS });

    const historyBody = await captureContractPaymentHistoryFullForTrigger(page, () =>
        historyNav.click()
    );
    await assertContractHistoryRoute(page);
    await expect(page.getByText(CONTRACT_PAYMENT_HISTORY_LINK, { exact: true })).toBeVisible({
        timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
    });
    return historyBody;
}

export type PaymentHistoryBaseline = {
    ids: Set<string>;
    /** True when history API returned HTTP 200 and body was parsed (including legitimately empty history). */
    established: true;
    /** Contract page probe (limit=1) indicated at least one stored payment. */
    hadStoredPayments: boolean;
};

/**
 * Uses Contract page probe (GET …/get_payment_history?limit=1) then, when probe shows payments exist,
 * navigates via PaymentHistoryWrapper for a full limit=999 baseline. Empty-history accounts keep an
 * empty baseline when probe succeeds with zero rows (nav control intentionally absent).
 */
export async function capturePaymentHistoryIdBaseline(
    page: Page,
    paymentHistoryProbeBody: unknown
): Promise<PaymentHistoryBaseline> {
    assertPaymentHistoryResponseParseable(paymentHistoryProbeBody);
    const probeEntries = parsePaymentHistoryEntries(paymentHistoryProbeBody);
    const hadStoredPayments = probeEntries.length > 0;

    if (!hadStoredPayments) {
        await expect(contractPaymentHistoryNavControl(page)).toHaveCount(0, {
            timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
        });
        return { ids: new Set(), established: true, hadStoredPayments: false };
    }

    let historyBody: unknown;
    try {
        historyBody = await openPaymentHistoryFromContractAndAwaitFullResponse(page);
    } catch (err) {
        throw new PlanPurchaseFlowError(
            `Full payment history GET (limit=${CONTRACT_PAYMENT_HISTORY_FULL_LIMIT}) did not succeed; baseline not established. ${String(err)}`
        );
    }

    assertPaymentHistoryResponseParseable(historyBody);
    const entries = parsePaymentHistoryEntries(historyBody);
    const ids = new Set(entries.map((entry) => entry.id));

    await returnFromPaymentHistoryToContract(page);

    return { ids, established: true, hadStoredPayments: true };
}

export function paymentHistoryTableRow(page: Page, entry: PaymentHistoryEntry): Locator {
    if (!entry.id) {
        throw new PlanPurchasePersistenceError(
            'Matched payment history entry has no id; live table rowKey requires id.'
        );
    }
    return page.locator(`tr[data-row-key="${entry.id}"]`);
}

export async function assertPaymentHistoryMatchedRowUi(
    page: Page,
    matched: PaymentHistoryEntry,
    selection: PlanSelectionCapture
): Promise<void> {
    const row = paymentHistoryTableRow(page, matched);
    await expect(row, `Expected one table row for payment id ${matched.id}`).toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(row).toContainText(PAYMENT_HISTORY_SUCCEEDED_LABEL);
    await expect(row).toContainText(yenAmountRegex(selection.totalAmountYen));
}

async function returnFromPaymentHistoryToContract(page: Page): Promise<void> {
    const returnButton = page.getByRole('button', {
        name: RETURN_TO_CONTRACT_INFORMATION,
        exact: true,
    });
    await expect(returnButton).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await returnButton.click();
    await assertContractInformationReady(page);
}

export function stripeSecurePaymentFrame(page: Page) {
    return page.frameLocator(`iframe[title="${STRIPE_SECURE_FRAME_TITLE}"]`);
}

export function settingsPlanChangeButton(page: Page): Locator {
    return page.getByRole('button', { name: SETTINGS_PLAN_BUTTON_NAME, exact: true });
}

export function threeMonthPlanCard(page: Page): Locator {
    return page.locator(PLAN_CARD_WRAPPER_SELECTOR).filter({
        has: page.locator('.duration').filter({ hasText: THREE_MONTH_PLAN_NAME_PATTERN }),
    });
}

export function planSelectionOrderSummaryFooter(page: Page): Locator {
    return page.locator(PLAN_ORDER_SUMMARY_FOOTER_SELECTOR);
}

/** Staging plan cards section title (distinct from MainLayout page title). */
export function planSelectionCardSectionTitle(page: Page): Locator {
    return page
        .locator(PLAN_CARD_SELECTION_TITLE_SELECTOR)
        .getByText('プラン選択', { exact: true });
}

export async function assertPlanSelectionPageReady(page: Page): Promise<void> {
    await assertContractPlansRoute(page);

    const selectionTitle = planSelectionCardSectionTitle(page);
    await expect(selectionTitle).toHaveCount(1);
    await expect(selectionTitle).toBeVisible({
        timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
    });

    const card = threeMonthPlanCard(page);
    await expect(card, 'Expected exactly one 3-month plan card wrapper').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(card.getByRole('button', { name: PLAN_SELECT_BUTTON_LABEL, exact: true })).toHaveCount(
        1
    );
    await expect(
        card.getByRole('button', { name: PLAN_SELECT_BUTTON_LABEL, exact: true })
    ).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
}

async function assertContractRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) => {
        const path = new URL(url).pathname.replace(/\/$/, '') || '/';
        return path === '/contract';
    });
}

/** Plan feature ends on Contract Information (/contract) with primary page chrome ready. */
export async function assertContractInformationReady(page: Page): Promise<void> {
    await assertContractRoute(page);
    await expect(page.getByText(CONTRACT_INFORMATION_TITLE, { exact: true })).toBeVisible({
        timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
    });
    await expect(
        page.getByRole('button', { name: CONTRACT_CHANGE_PLAN_BUTTON, exact: true })
    ).toBeVisible({ timeout: CONTRACT_HYDRATION_TIMEOUT_MS });
}

async function assertContractPlansRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) => {
        const path = new URL(url).pathname.replace(/\/$/, '') || '/';
        return path === '/contract/plans';
    });
}

async function assertContractPaymentRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) => {
        const path = new URL(url).pathname.replace(/\/$/, '') || '/';
        return path === '/contract/payment-information';
    });
}

async function assertContractPaymentCompleteRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) => {
        const path = new URL(url).pathname.replace(/\/$/, '') || '/';
        return path === '/contract/payment-complete';
    });
}

async function assertContractHistoryRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) => {
        const path = new URL(url).pathname.replace(/\/$/, '') || '/';
        return path === '/contract/history';
    });
}

export type OpenContractFromSettingsResult = {
    subscriptionBody: unknown;
    paymentHistoryProbeBody: unknown;
};

export async function openContractFromSettings(
    page: Page,
    options?: PlanPurchaseFlowOptions
): Promise<OpenContractFromSettingsResult> {
    await assertSettingsRoute(page, options);
    await waitForSettingsCompanyReadOnlyReady(page, options);

    const planButton = settingsPlanChangeButton(page);
    await expect(planButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });

    const subscriptionBodyPromise = page
        .waitForResponse((res) => isContractSubscriptionGetResponse(res), {
            timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
        })
        .then((res) => readApiResponseJsonBody(res, 'Contract subscription GET'));
    const paymentHistoryProbeBodyPromise = page
        .waitForResponse((res) => isContractPaymentHistoryProbeResponse(res), {
            timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
        })
        .then(async (res) => {
            if (res.status() !== 200) {
                throw new PlanPurchaseFlowError(
                    `Payment history probe (limit=${CONTRACT_PAYMENT_HISTORY_PROBE_LIMIT}) returned HTTP ${res.status()}; baseline cannot be established.`
                );
            }
            return readApiResponseJsonBody(res, 'Payment history probe GET');
        });

    await Promise.all([
        subscriptionBodyPromise,
        paymentHistoryProbeBodyPromise,
        planButton.click(),
    ]);

    await assertContractRoute(page);
    await expect(page.getByText(CONTRACT_INFORMATION_TITLE, { exact: true })).toBeVisible({
        timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
    });

    const [subscriptionBody, paymentHistoryProbeBody] = await Promise.all([
        subscriptionBodyPromise,
        paymentHistoryProbeBodyPromise,
    ]);

    return { subscriptionBody, paymentHistoryProbeBody };
}

export function readAndAssertPurchaseEligibility(
    subscriptionBody: unknown
): ContractSubscriptionSnapshot {
    const snapshot = buildContractSubscriptionSnapshot(subscriptionBody);
    assertEligibleForThreeMonthCreditCardPurchase(snapshot);
    return snapshot;
}

async function openPlanSelection(page: Page): Promise<void> {
    const changePlan = page.getByRole('button', { name: CONTRACT_CHANGE_PLAN_BUTTON, exact: true });
    await expect(changePlan).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await changePlan.click();
    await assertPlanSelectionPageReady(page);
}

async function readTotalFromPlanCard(card: Locator): Promise<number> {
    const cardText = (await card.innerText()).replace(/\s+/g, ' ');
    const labeled = extractLabeledYenTotal(cardText, ['合計金額', '合計']);
    if (labeled !== null) {
        return labeled;
    }
    const amounts = parseAllYenAmountsFromText(cardText);
    if (amounts.length === 0) {
        throw new PlanPurchaseFlowError('Could not parse yen total from 3-month plan card.');
    }
    return amounts[amounts.length - 1]!;
}

async function readOrderSummaryTotal(page: Page): Promise<number> {
    const footer = planSelectionOrderSummaryFooter(page);
    await expect(footer).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const footerText = (await footer.innerText()).replace(/\s+/g, ' ');
    const labeled = extractLabeledYenTotal(footerText, ['合計金額', '合計']);
    if (labeled !== null) {
        return labeled;
    }
    const amounts = parseAllYenAmountsFromText(footerText);
    if (amounts.length === 0) {
        throw new PlanPurchaseFlowError('Could not parse yen total from plan order summary footer.');
    }
    return amounts[amounts.length - 1]!;
}

export async function selectThreeMonthPlanAndCaptureTotals(page: Page): Promise<PlanSelectionCapture> {
    const card = threeMonthPlanCard(page);
    await expect(card, 'Expected exactly one 3-month plan card wrapper').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const cardText = (await card.innerText()).replace(/\s+/g, ' ');
    const totalFromCard = await readTotalFromPlanCard(card);

    const selectButton = card.getByRole('button', { name: PLAN_SELECT_BUTTON_LABEL, exact: true });
    await expect(selectButton).toHaveCount(1);
    await expect(selectButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await selectButton.click();

    await expect(page.getByText('選択中', { exact: true })).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const totalFromSummary = await readOrderSummaryTotal(page);
    if (!amountsEqualYen(totalFromCard, totalFromSummary)) {
        throw new PlanPurchaseFlowError(
            `Plan card total (¥${totalFromCard}) did not match order summary total (¥${totalFromSummary}).`
        );
    }

    const proceedButton = page.getByRole('button', { name: PLAN_ENTER_PAYMENT_INFO_BUTTON, exact: true });
    await expect(proceedButton).toBeEnabled({ timeout: CONTRACT_HYDRATION_TIMEOUT_MS });
    await proceedButton.click();
    await assertContractPaymentRoute(page);

    const planNameMatch = cardText.match(THREE_MONTH_PLAN_NAME_PATTERN);
    const planDisplayName = planNameMatch ? planNameMatch[0].replace(/\s+/g, '') : '3ヶ月プラン';

    return {
        planDisplayName,
        totalAmountYen: totalFromSummary,
        monthDuration: THREE_MONTH_PLAN_DURATION,
    };
}

async function readPaymentPageTotal(page: Page): Promise<number> {
    const finalTotal = paymentPageFinalTotal(page);
    await expect(finalTotal).toHaveCount(1);
    await expect(finalTotal).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const text = (await finalTotal.innerText()).replace(/\s+/g, ' ');
    const amounts = parseAllYenAmountsFromText(text);
    if (amounts.length !== 1) {
        throw new PlanPurchaseFlowError(
            `Expected exactly one yen amount in payment final total, got ${amounts.length} from "${text}".`
        );
    }
    return amounts[0]!;
}

export async function assertPaymentInformationMatchesSelection(
    page: Page,
    selection: PlanSelectionCapture
): Promise<void> {
    const billingTotal = paymentPageBillingTotalLine(page);
    await expect(billingTotal).toHaveCount(1);
    await expect(billingTotal).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(billingTotal).toContainText(selection.planDisplayName, {
        timeout: ACTION_TIMEOUT_MS,
    });

    const finalTotal = paymentPageFinalTotal(page);
    await expect(finalTotal).toHaveCount(1);
    await expect(finalTotal).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(finalTotal).toHaveText(yenAmountRegex(selection.totalAmountYen), {
        timeout: ACTION_TIMEOUT_MS,
    });

    const paymentTotal = await readPaymentPageTotal(page);
    if (!amountsEqualYen(paymentTotal, selection.totalAmountYen)) {
        throw new PlanPurchaseFlowError(
            `Payment page total (¥${paymentTotal}) did not match selected plan total (¥${selection.totalAmountYen}).`
        );
    }
}

async function fillStripeCardFields(page: Page): Promise<{ last4: string }> {
    const credentials = resolveStripeTestCardCredentials();
    await page.getByText(PAYMENT_METHOD_CREDIT_CARD, { exact: true }).first().click();

    const frame = stripeSecurePaymentFrame(page);
    const cardNumber = frame.getByRole('textbox', { name: 'カード番号' });
    await expect(cardNumber).toBeVisible({ timeout: CONTRACT_HYDRATION_TIMEOUT_MS });
    await cardNumber.fill(credentials.number);
    await frame.getByRole('textbox', { name: '有効期限' }).fill(credentials.expiry);
    await frame.getByRole('textbox', { name: 'セキュリティコード' }).fill(credentials.cvc);

    const submit = page.getByRole('button', { name: PAYMENT_SUBMIT_BUTTON, exact: true });
    await expect(submit).toBeEnabled({ timeout: CONTRACT_HYDRATION_TIMEOUT_MS });
    return { last4: credentials.last4 };
}

async function submitPaymentOnce(
    page: Page,
    guard: PaymentSubmissionGuard
): Promise<PlanPurchaseSubmitResult> {
    guard.assertCanSubmit();
    const submit = page.getByRole('button', { name: PAYMENT_SUBMIT_BUTTON, exact: true });
    await expect(submit).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });

    const planPostSettled = page.waitForResponse(
        (res) => res.url() === POST_CONTRACT_PLAN_URL && res.request().method() === 'POST',
        { timeout: PAYMENT_FLOW_TIMEOUT_MS }
    );

    const navigationSettled = page.waitForURL(
        (url) => new URL(url).pathname.replace(/\/$/, '') === '/contract/payment-complete',
        { timeout: PAYMENT_FLOW_TIMEOUT_MS, waitUntil: 'domcontentloaded' }
    );

    guard.markSubmitted();
    await submit.click();

    const planResponse = await planPostSettled;
    const planBody = await planResponse.json().catch(() => null);
    const submitResult = parsePlanPostResponse(planBody, planResponse.status());

    try {
        await navigationSettled;
    } catch (navErr) {
        throw new PlanPurchaseFlowError(
            `Payment submit did not reach payment-complete. Plan API HTTP ${planResponse.status()}. ${String(navErr)}`
        );
    }

    return submitResult;
}

async function verifyPaymentCompletePage(
    page: Page,
    selection: PlanSelectionCapture
): Promise<void> {
    await assertContractPaymentCompleteRoute(page);
    await expect(page.getByText(PAYMENT_COMPLETE_HEADING, { exact: true })).toBeVisible({
        timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
    });
    await expect(page.getByText(selection.planDisplayName)).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(page.locator('.invoice-details-item-plan')).toHaveText(selection.planDisplayName);
    await expect(page.locator('.invoice-details-item').filter({ hasText: PAYMENT_METHOD_CREDIT_CARD })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function returnToContractInformationAndCaptureSubscription(page: Page): Promise<unknown> {
    const returnControl = page.getByText(RETURN_TO_CONTRACT_INFORMATION, { exact: true });
    await expect(returnControl).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const subscriptionBody = await captureContractSubscriptionBodyForTrigger(page, () =>
        returnControl.click()
    );
    await assertContractRoute(page);
    await expect(page.getByText(CONTRACT_INFORMATION_TITLE, { exact: true })).toBeVisible({
        timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
    });
    return subscriptionBody;
}

export async function verifyContractUiAfterPurchase(
    page: Page,
    selection: PlanSelectionCapture,
    cardLast4: string
): Promise<void> {
    const activePlanRow = contractActivePlanRow(page);
    await expect(activePlanRow).toHaveCount(1);
    await expect(activePlanRow).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const currentPlanName = activePlanRow.getByText(selection.planDisplayName, { exact: true });
    await expect(currentPlanName).toHaveCount(1);
    await expect(currentPlanName).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const creditCardLabel = contractCreditCardPaymentMethodLabel(page);
    await expect(creditCardLabel).toHaveCount(1);
    await expect(creditCardLabel).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const creditCardValue = contractCreditCardMaskedValue(page);
    await expect(creditCardValue).toHaveCount(1);
    await expect(creditCardValue).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(creditCardValue).toContainText(cardLast4, { timeout: ACTION_TIMEOUT_MS });

    await expect(page.locator('.automatic-updates-label')).toHaveCount(1);
    await expect(page.locator('.automatic-updates-label')).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(page.locator('.automatic-updates-label ~ div')).toHaveText('有効', {
        timeout: ACTION_TIMEOUT_MS,
    });

    const renewalSection = contractRenewalSection(page);
    const renewalPlanName = renewalSection.getByText(
        threeMonthPlanAutoRenewalLabel(selection.planDisplayName),
        { exact: true }
    );
    await expect(renewalPlanName).toHaveCount(1);
    await expect(renewalPlanName).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}

export async function verifyContractAfterPurchase(
    page: Page,
    selection: PlanSelectionCapture,
    cardLast4: string,
    subscriptionBodyAfterPurchase: unknown,
    subscriptionContext?: SubscriptionPurchaseVerificationContext
): Promise<void> {
    await verifyContractUiAfterPurchase(page, selection, cardLast4);
    assertSubscriptionReflectsThreeMonthPurchase(
        subscriptionBodyAfterPurchase,
        selection,
        subscriptionContext
    );
    await verifyContractDisplayedPeriodsMatchSubscription(page, subscriptionBodyAfterPurchase);
}

export async function loadContractInformationAndCaptureSubscription(
    page: Page,
    contractUrl: string = STG_CONTRACT_URL
): Promise<unknown> {
    const subscriptionBody = await captureContractSubscriptionBodyForTrigger(page, () =>
        page.goto(contractUrl, { waitUntil: 'domcontentloaded' })
    );
    await expect(page.getByText(CONTRACT_INFORMATION_TITLE, { exact: true })).toBeVisible({
        timeout: CONTRACT_HYDRATION_TIMEOUT_MS,
    });
    return subscriptionBody;
}

export async function verifyKnownPaymentHistoryEntry(
    page: Page,
    selection: PlanSelectionCapture,
    paymentHistoryId: string
): Promise<PaymentHistoryEntry> {
    const historyBody = await openPaymentHistoryFromContractAndAwaitFullResponse(page);
    const entries = parsePaymentHistoryEntries(historyBody);
    const matched = findPaymentHistoryEntryById(entries, paymentHistoryId);
    if (!matched) {
        throw new PlanPurchasePersistenceError(
            `Payment history did not contain expected id "${paymentHistoryId}". Rows: ${JSON.stringify(
                entries.map((e) => ({ id: e.id, amount: e.amount, status: e.status }))
            )}`
        );
    }
    if (matched.status !== 'succeeded') {
        throw new PlanPurchasePersistenceError(
            `Payment history id "${paymentHistoryId}" status was "${matched.status}", expected succeeded.`
        );
    }
    if (!amountsEqualYen(matched.amount, selection.totalAmountYen)) {
        throw new PlanPurchasePersistenceError(
            `Payment history id "${paymentHistoryId}" amount ¥${matched.amount} did not match expected ¥${selection.totalAmountYen}.`
        );
    }

    await assertPaymentHistoryMatchedRowUi(page, matched, selection);
    await returnFromPaymentHistoryToContract(page);

    return matched;
}

export type ExistingPaidPlanVerificationOptions = PlanPurchaseFlowOptions & {
    cardLast4?: string;
    paymentHistoryId: string;
    selection?: PlanSelectionCapture;
};

/**
 * Read-only verification for an account that already completed the 3-month plan purchase.
 * Does not enter card details, submit payment, or change/cancel plans.
 * Ends on Contract Information (/contract) after payment-history verification.
 */
export async function runExistingPaidPlanVerificationOnly(
    page: Page,
    account: SmokeAccountRef,
    options: ExistingPaidPlanVerificationOptions
): Promise<void> {
    const selection = options.selection ?? DEFAULT_THREE_MONTH_PLAN_SELECTION;
    const cardLast4 = options.cardLast4 ?? resolveStripeTestCardCredentials().last4;
    const paymentHistoryId = options.paymentHistoryId.trim();
    if (!paymentHistoryId) {
        throw new PlanPurchaseFlowError(
            'paymentHistoryId is required for existing paid plan verification (決済履歴 data-row-key / API id).'
        );
    }

    const opened = await test.step('paid plan verification: open contract from Settings', async () => {
        await assertSettingsRoute(page, options);
        await waitForSettingsCompanyReadOnlyReady(page, options);
        return openContractFromSettings(page, options);
    });

    await test.step('paid plan verification: contract UI + subscription API', async () => {
        await verifyContractAfterPurchase(
            page,
            selection,
            cardLast4,
            opened.subscriptionBody
        );
    });

    const subscriptionReload = await test.step('paid plan verification: persistence after reload', async () => {
        const body = await loadContractInformationAndCaptureSubscription(page);
        await verifyContractAfterPurchase(page, selection, cardLast4, body);
        return body;
    });

    await test.step('paid plan verification: payment history → Contract Information', async () => {
        await verifyKnownPaymentHistoryEntry(page, selection, paymentHistoryId);
        await assertContractInformationReady(page);
    });

    console.log(
        'PLAN_PURCHASE_VERIFICATION_ONLY',
        JSON.stringify({
            accountEmail: account.email,
            plan: selection.planDisplayName,
            amountYen: selection.totalAmountYen,
            paymentHistoryId,
            cardLast4,
            subscriptionReloadVerified: subscriptionReload !== undefined,
            finalRoute: '/contract',
        })
    );
}

async function verifyPaymentHistoryForPurchase(
    page: Page,
    selection: PlanSelectionCapture,
    runStartedAtMs: number,
    paymentHistoryIdsBefore: Set<string>,
    purchaseCorrelationId: string | null
): Promise<PaymentHistoryEntry> {
    const historyBody = await openPaymentHistoryFromContractAndAwaitFullResponse(page);
    const entries = parsePaymentHistoryEntries(historyBody);
    const matched = findNewPaymentHistoryEntry(entries, {
        expectedAmountYen: selection.totalAmountYen,
        runStartedAtMs,
        idsBefore: paymentHistoryIdsBefore,
        purchaseCorrelationId,
    });
    if (!matched) {
        throw new PlanPurchasePersistenceError(
            `No payment-history row matched this run (amount ¥${selection.totalAmountYen}, new ids since baseline). Rows: ${JSON.stringify(
                entries.map((e) => ({
                    id: e.id,
                    amount: e.amount,
                    status: e.status,
                    created: e.created,
                }))
            )}`
        );
    }

    await assertPaymentHistoryMatchedRowUi(page, matched, selection);
    await returnFromPaymentHistoryToContract(page);

    return matched;
}

async function attachSanitizedPreSubmitEvidence(
    page: Page,
    evidence: CustomerFlowEvidence,
    selection: PlanSelectionCapture
): Promise<void> {
    try {
        await evidence.attachJson('plan-purchase-before-payment-submit', {
            planDisplayName: selection.planDisplayName,
            totalAmountYen: selection.totalAmountYen,
            stripeTestModeVerified: isStripeTestModeVerifiedForPage(page),
            note: 'Full-page screenshot omitted to avoid capturing card fields.',
        });
    } catch {
        // Preserve original flow error if evidence attachment fails.
    }
}

/**
 * Starts on Settings (read-only, same authenticated session).
 * Performs one 3-month plan credit-card purchase and verifies contract + payment history.
 * Ends on Contract Information (/contract); does not navigate to Settings afterward.
 */
export async function runPlanPurchaseAndVerify(
    page: Page,
    account: SmokeAccountRef,
    evidence?: CustomerFlowEvidence,
    options?: PlanPurchaseFlowOptions
): Promise<void> {
    const runStartedAtMs = Date.now();
    const paymentGuard = new PaymentSubmissionGuard();
    beginStripeTestModeObservation(page);

    try {
        let subscriptionBody: unknown;
        let paymentHistoryProbeBody: unknown;

        await test.step('plan purchase: open contract from Settings', async () => {
            await assertSettingsRoute(page, options);
            await waitForSettingsCompanyReadOnlyReady(page, options);
            const opened = await openContractFromSettings(page, options);
            subscriptionBody = opened.subscriptionBody;
            paymentHistoryProbeBody = opened.paymentHistoryProbeBody;
        });

        const eligibility = await test.step('plan purchase: eligibility from subscription', async () => {
            return readAndAssertPurchaseEligibility(subscriptionBody);
        });

        const paymentHistoryBaseline = await test.step(
            'plan purchase: payment history baseline ids',
            async () => capturePaymentHistoryIdBaseline(page, paymentHistoryProbeBody)
        );
        if (!paymentHistoryBaseline.established) {
            throw new PlanPurchaseFlowError(
                'Payment history baseline was not established before plan purchase submit.'
            );
        }

        console.log(
            'PLAN_PURCHASE_ELIGIBILITY',
            JSON.stringify({ accountEmail: account.email, ...eligibility.summaryForLogs })
        );
        if (evidence) {
            await evidence.attachJson('PLAN_PURCHASE_ELIGIBILITY', eligibility.summaryForLogs);
        }

        await test.step('plan purchase: plan selection', async () => {
            await openPlanSelection(page);
        });

        const selection = await test.step('plan purchase: select 3-month plan', async () => {
            return selectThreeMonthPlanAndCaptureTotals(page);
        });

        console.log(
            'PLAN_PURCHASE_SELECTION',
            JSON.stringify({ accountEmail: account.email, ...selection })
        );
        if (evidence) {
            await evidence.attachJson('PLAN_PURCHASE_SELECTION', selection);
        }

        await test.step('plan purchase: payment information matches selection', async () => {
            await assertPaymentInformationMatchesSelection(page, selection);
        });

        const cardLast4 = await test.step('plan purchase: stripe test mode + card entry', async () => {
            await requireStripeTestModeVerified(page);
            return (await fillStripeCardFields(page)).last4;
        });

        let submitResult: PlanPurchaseSubmitResult | undefined;

        await test.step('plan purchase: submit payment once', async () => {
            if (evidence) {
                await attachSanitizedPreSubmitEvidence(page, evidence, selection);
            }
            submitResult = await submitPaymentOnce(page, paymentGuard);
        });

        await test.step('plan purchase: payment complete', async () => {
            await verifyPaymentCompletePage(page, selection);
            if (evidence) {
                await evidence.attachScreenshot('plan-purchase-payment-complete');
            }
        });

        await test.step('plan purchase: contract information', async () => {
            const subscriptionBodyAfterPurchase =
                await returnToContractInformationAndCaptureSubscription(page);
            await verifyContractAfterPurchase(
                page,
                selection,
                cardLast4,
                subscriptionBodyAfterPurchase,
                {
                    expectedSubscriptionId: submitResult?.purchaseCorrelationId ?? null,
                    expectedProductId: selection.productId ?? null,
                }
            );
        });

        const historyEntry = await test.step('plan purchase: payment history → Contract Information', async () => {
            const entry = await verifyPaymentHistoryForPurchase(
                page,
                selection,
                runStartedAtMs,
                paymentHistoryBaseline.ids,
                submitResult?.purchaseCorrelationId ?? null
            );
            await assertContractInformationReady(page);
            return entry;
        });

        console.log(
            'PLAN_PURCHASE_PERSISTED',
            JSON.stringify({
                accountEmail: account.email,
                plan: selection.planDisplayName,
                amountYen: selection.totalAmountYen,
                paymentHistoryId: historyEntry.id,
                purchaseCorrelationId: submitResult?.purchaseCorrelationId ?? null,
                cardLast4,
                finalRoute: '/contract',
            })
        );
        if (evidence) {
            await evidence.attachJson('PLAN_PURCHASE_PERSISTED', {
                selection,
                paymentHistoryId: historyEntry.id,
                purchaseCorrelationId: submitResult?.purchaseCorrelationId ?? null,
                cardLast4,
            });
        }
    } catch (err) {
        if (evidence) {
            try {
                await evidence.attachScreenshot('plan-purchase-failure');
                await evidence.attachPageHtml('plan-purchase-failure-dom');
            } catch {
                // Preserve original error.
            }
        }
        throw err;
    } finally {
        endStripeTestModeObservation(page);
    }
}
