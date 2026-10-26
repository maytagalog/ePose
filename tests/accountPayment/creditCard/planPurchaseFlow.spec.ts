import { test, expect } from '@playwright/test';
import {
    PaymentSubmissionGuard,
    PlanPurchaseEligibilityError,
    PlanPurchaseFlowError,
    assertEligibleForThreeMonthCreditCardPurchase,
    assertPaymentHistoryResponseParseable,
    buildContractSubscriptionSnapshot,
    contractPaymentHistoryRequestKind,
    findNewPaymentHistoryEntry,
    findPaymentHistoryEntryById,
    hasPaymentHistoryFromProbeBody,
    findPublishableKeyInSecretsBody,
    parsePaymentHistoryEntries,
    parsePlanPostResponse,
    yenAmountRegex,
    extractLabeledYenTotal,
    resetStripeTestModeObservationForTests,
} from './planPurchaseFlow';

test.beforeEach(() => {
    resetStripeTestModeObservationForTests();
});

test('findPublishableKeyInSecretsBody: detects pk_test key', () => {
    expect(
        findPublishableKeyInSecretsBody({ data: { stripePublishableKey: 'pk_test_abc' } })
    ).toBe('pk_test_abc');
});

test('buildContractSubscriptionSnapshot: explicit no-subscription (current/upcoming null) is eligible', () => {
    const snapshot = buildContractSubscriptionSnapshot({ current: null, upcoming: null });
    expect(snapshot.eligibilityCategory).toBe('eligible');
    expect(() => assertEligibleForThreeMonthCreditCardPurchase(snapshot)).not.toThrow();
});

test('buildContractSubscriptionSnapshot: active free plan is eligible', () => {
    const snapshot = buildContractSubscriptionSnapshot({
        current: { status: 'active', planName: 'フリープラン' },
        upcoming: null,
    });
    expect(snapshot.eligibilityCategory).toBe('eligible');
});

test('buildContractSubscriptionSnapshot: empty object is not eligible', () => {
    expect(() => buildContractSubscriptionSnapshot({})).toThrow(PlanPurchaseEligibilityError);
});

test('buildContractSubscriptionSnapshot: malformed current is not eligible', () => {
    expect(() =>
        buildContractSubscriptionSnapshot({ current: 'not-an-object', upcoming: null })
    ).toThrow(PlanPurchaseEligibilityError);
    expect(() => buildContractSubscriptionSnapshot({ current: {}, upcoming: null })).toThrow(
        PlanPurchaseEligibilityError
    );
});

test('buildContractSubscriptionSnapshot: unknown current status is not eligible', () => {
    const snapshot = buildContractSubscriptionSnapshot({
        current: { status: 'paused', planName: '3ヶ月プラン' },
        upcoming: null,
    });
    expect(snapshot.eligibilityCategory).toBe('blocked_unknown_schema');
    expect(() => assertEligibleForThreeMonthCreditCardPurchase(snapshot)).toThrow(
        PlanPurchaseEligibilityError
    );
});

test('assertEligibleForThreeMonthCreditCardPurchase: active paid plan fails clearly', () => {
    const snapshot = buildContractSubscriptionSnapshot({
        current: { status: 'active', planName: '3ヶ月プラン' },
        upcoming: null,
    });
    expect(snapshot.eligibilityCategory).toBe('blocked_active_paid');
    expect(() => assertEligibleForThreeMonthCreditCardPurchase(snapshot)).toThrow(
        PlanPurchaseEligibilityError
    );
});

test('buildContractSubscriptionSnapshot: structured active paid without planName blocks purchase', () => {
    const snapshot = buildContractSubscriptionSnapshot({
        current: {
            status: 'active',
            interval: 'month',
            intervalCount: 3,
            paid: true,
            invoiceStatus: 'paid',
            productId: 'prod_fixture',
        },
        upcoming: {
            interval: 'month',
            intervalCount: 3,
            paid: false,
            productId: 'prod_fixture',
        },
    });
    expect(snapshot.eligibilityCategory).toBe('blocked_active_paid');
});

test('findPaymentHistoryEntryById: resolves exact payment history id', () => {
    const entries = parsePaymentHistoryEntries([
        { id: 'pay_target', amount: 29400, status: 'succeeded' },
        { id: 'pay_other', amount: 29400, status: 'succeeded' },
    ]);
    expect(findPaymentHistoryEntryById(entries, 'pay_target')?.id).toBe('pay_target');
    expect(findPaymentHistoryEntryById(entries, 'missing')).toBeNull();
});

test('findNewPaymentHistoryEntry: prefers new id over older succeeded row', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const entries = parsePaymentHistoryEntries([
        { id: 'old', amount: 29400, status: 'succeeded', created: nowSec - 86400 },
        { id: 'run', amount: 29400, status: 'succeeded', created: nowSec },
        { id: 'other', amount: 1000, status: 'succeeded', created: nowSec },
    ]);
    const matched = findNewPaymentHistoryEntry(entries, {
        expectedAmountYen: 29400,
        runStartedAtMs: Date.now(),
        idsBefore: new Set(['old']),
    });
    expect(matched?.id).toBe('run');
});

test('findNewPaymentHistoryEntry: rejects stale row when baseline empty and timestamp old', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const entries = parsePaymentHistoryEntries([
        { id: 'old-only', amount: 29400, status: 'succeeded', created: nowSec - 86400 },
    ]);
    const matched = findNewPaymentHistoryEntry(entries, {
        expectedAmountYen: 29400,
        runStartedAtMs: Date.now(),
        idsBefore: new Set(),
    });
    expect(matched).toBeNull();
});

test('contractPaymentHistoryRequestKind: distinguishes probe limit=1 and full limit=999', () => {
    const base = 'https://api-stg.epose.com/contract/get_payment_history?accountId=a';
    expect(contractPaymentHistoryRequestKind(`${base}&limit=1`)).toBe('probe');
    expect(contractPaymentHistoryRequestKind(`${base}&limit=999`)).toBe('full');
});

test('hasPaymentHistoryFromProbeBody: empty probe means no stored payments', () => {
    expect(hasPaymentHistoryFromProbeBody({ data: [] })).toBe(false);
    expect(hasPaymentHistoryFromProbeBody({ data: [{ id: 'x', amount: 1, status: 'succeeded' }] })).toBe(
        true
    );
});

test('assertPaymentHistoryResponseParseable: rejects non-array data envelope', () => {
    expect(() => assertPaymentHistoryResponseParseable({ data: { unexpected: true } })).toThrow(
        PlanPurchaseFlowError
    );
});

test('findPaymentHistoryEntryById: matches exact transaction id without receipt_url', () => {
    const entries = parsePaymentHistoryEntries([
        { id: 'pay_a', amount: 29400, status: 'succeeded' },
        { id: 'pay_b', amount: 100, status: 'succeeded' },
    ]);
    expect(findPaymentHistoryEntryById(entries, 'pay_a')?.amount).toBe(29400);
    expect(findPaymentHistoryEntryById(entries, 'missing')).toBeNull();
});

test('parsePlanPostResponse: non-200 surfaces API message', () => {
    expect(() => parsePlanPostResponse({ message: 'card declined' }, 402)).toThrow(PlanPurchaseFlowError);
    expect(() => parsePlanPostResponse({ message: 'card declined' }, 402)).toThrow(/card declined/);
});

test('parsePlanPostResponse: 200 extracts correlation id', () => {
    const result = parsePlanPostResponse({ data: { paymentIntentId: 'pi_test_123' } }, 200);
    expect(result.purchaseCorrelationId).toBe('pi_test_123');
});

test('yenAmountRegex and labeled totals normalize comma formatting', () => {
    expect(extractLabeledYenTotal('合計金額 ¥29,400', ['合計金額'])).toBe(29400);
    expect('page ¥29,400'.match(yenAmountRegex(29400))).toBeTruthy();
    expect('page ¥29400'.match(yenAmountRegex(29400))).toBeTruthy();
});

test('PaymentSubmissionGuard: second submit throws without retry', () => {
    const guard = new PaymentSubmissionGuard();
    guard.markSubmitted();
    expect(() => guard.assertCanSubmit()).toThrow(/already attempted once/);
});
