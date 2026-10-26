import { test, expect } from '@playwright/test';
import {
    PlanPurchaseEligibilityError,
    PlanPurchasePersistenceError,
    THREE_MONTH_PLAN_DURATION,
    assertEligibleForThreeMonthCreditCardPurchase,
    assertSubscriptionReflectsThreeMonthPurchase,
    buildContractSubscriptionSnapshot,
    formatContractPeriodBoundary,
    formatContractPeriodRange,
    parseSubscriptionPeriodNode,
    subscriptionPeriodIsActivePaidCurrent,
    subscriptionPeriodIsThreeMonthPlan,
    DEFAULT_THREE_MONTH_PLAN_SELECTION,
} from './planPurchaseFlow';
import { STAGING_PAID_THREE_MONTH_SUBSCRIPTION } from './planPurchaseSubscriptionFixtures';

test('parseSubscriptionPeriodNode: reads staging structured current period', () => {
    const parsed = parseSubscriptionPeriodNode(STAGING_PAID_THREE_MONTH_SUBSCRIPTION.current);
    expect(parsed?.interval).toBe('month');
    expect(parsed?.intervalCount).toBe(3);
    expect(parsed?.paid).toBe(true);
    expect(parsed?.invoiceStatus).toBe('paid');
    expect(subscriptionPeriodIsActivePaidCurrent(parsed!)).toBe(true);
});

test('assertSubscriptionReflectsThreeMonthPurchase: accepts active paid current without planName', () => {
    expect(() =>
        assertSubscriptionReflectsThreeMonthPurchase(
            STAGING_PAID_THREE_MONTH_SUBSCRIPTION,
            DEFAULT_THREE_MONTH_PLAN_SELECTION
        )
    ).not.toThrow();
});

test('assertSubscriptionReflectsThreeMonthPurchase: upcoming paid:false does not fail verification', () => {
    const body = {
        current: STAGING_PAID_THREE_MONTH_SUBSCRIPTION.current,
        upcoming: { ...STAGING_PAID_THREE_MONTH_SUBSCRIPTION.upcoming, paid: false },
    };
    expect(() =>
        assertSubscriptionReflectsThreeMonthPurchase(body, DEFAULT_THREE_MONTH_PLAN_SELECTION)
    ).not.toThrow();
});

test('assertSubscriptionReflectsThreeMonthPurchase: rejects wrong intervalCount', () => {
    const body = {
        current: {
            ...STAGING_PAID_THREE_MONTH_SUBSCRIPTION.current,
            intervalCount: 6,
        },
        upcoming: STAGING_PAID_THREE_MONTH_SUBSCRIPTION.upcoming,
    };
    expect(() =>
        assertSubscriptionReflectsThreeMonthPurchase(body, DEFAULT_THREE_MONTH_PLAN_SELECTION)
    ).toThrow(PlanPurchasePersistenceError);
});

test('assertSubscriptionReflectsThreeMonthPurchase: rejects productId mismatch when expected', () => {
    expect(() =>
        assertSubscriptionReflectsThreeMonthPurchase(
            STAGING_PAID_THREE_MONTH_SUBSCRIPTION,
            DEFAULT_THREE_MONTH_PLAN_SELECTION,
            { expectedProductId: 'prod_other_product' }
        )
    ).toThrow(/productId/);
});

test('assertSubscriptionReflectsThreeMonthPurchase: rejects malformed missing current', () => {
    expect(() =>
        assertSubscriptionReflectsThreeMonthPurchase({ current: null, upcoming: null }, DEFAULT_THREE_MONTH_PLAN_SELECTION)
    ).toThrow(PlanPurchasePersistenceError);
});

test('buildContractSubscriptionSnapshot: active paid 3-month without planName blocks purchase', () => {
    const snapshot = buildContractSubscriptionSnapshot(STAGING_PAID_THREE_MONTH_SUBSCRIPTION);
    expect(snapshot.eligibilityCategory).toBe('blocked_active_paid');
    expect(snapshot.hasActivePaidCurrent).toBe(true);
    expect(() => assertEligibleForThreeMonthCreditCardPurchase(snapshot)).toThrow(
        PlanPurchaseEligibilityError
    );
});

test('buildContractSubscriptionSnapshot: malformed empty current still fails clearly', () => {
    expect(() => buildContractSubscriptionSnapshot({ current: {}, upcoming: null })).toThrow(
        PlanPurchaseEligibilityError
    );
});

test('formatContractPeriodRange: uses Asia/Tokyo YYYY/MM/DD for staging epochs', () => {
    expect(formatContractPeriodBoundary(1792846747)).toBe('2026/10/24');
    expect(formatContractPeriodBoundary(1800795547)).toBe('2027/01/24');
    expect(formatContractPeriodRange(1792846747, 1800795547)).toBe('2026/10/24~2027/01/24');
    expect(formatContractPeriodRange(1800795547, 1808571547)).toBe('2027/01/24~2027/04/24');
});

test('subscriptionPeriodIsThreeMonthPlan: requires month interval and configured duration', () => {
    const parsed = parseSubscriptionPeriodNode(STAGING_PAID_THREE_MONTH_SUBSCRIPTION.current);
    expect(subscriptionPeriodIsThreeMonthPlan(parsed!)).toBe(true);
    expect(THREE_MONTH_PLAN_DURATION).toBe(3);
});
