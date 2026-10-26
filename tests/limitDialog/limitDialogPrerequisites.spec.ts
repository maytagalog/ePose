import { test, expect } from '@playwright/test';
import {
    evaluateSubscriptionPrerequisites,
    enrichPaymentHistoryEvidence,
    evaluatePaymentHistoryProbe,
    isStrictExplicitNullSubscriptionRoot,
    paymentHistoryProbeHasEntries,
} from './limitDialogPrerequisites';

const STAGING_NULL_SUBSCRIPTION_BODY = {
    current: null,
    upcoming: null,
    oneTimeInvoicePendingSubscription: null,
    couponInformation: null,
};

test('evaluateSubscriptionPrerequisites: free plan without paid current', () => {
    const result = evaluateSubscriptionPrerequisites({
        data: { current: { status: 'active', planName: 'フリープラン' }, upcoming: null },
    });
    expect(result.freePlanVerified).toBe(true);
    expect(result.subscriptionObserved).toBe(true);
    expect(result.freePlanEvidence).toEqual([
        { source: 'contract_subscription_get', kind: 'named_free_plan', planName: 'フリープラン' },
    ]);
});

test('evaluateSubscriptionPrerequisites: rejects active paid plan', () => {
    const result = evaluateSubscriptionPrerequisites({
        data: {
            current: {
                status: 'active',
                planName: '3ヶ月プラン',
                paid: true,
                interval: 'month',
                intervalCount: 3,
            },
            upcoming: null,
        },
    });
    expect(result.freePlanVerified).toBe(false);
});

test('staging null subscription + verified Limit Dialog Free Plan → accepted', () => {
    expect(isStrictExplicitNullSubscriptionRoot(STAGING_NULL_SUBSCRIPTION_BODY)).toBe(true);
    const result = evaluateSubscriptionPrerequisites(STAGING_NULL_SUBSCRIPTION_BODY, {
        verifiedInTrialEndedDialog: true,
    });
    expect(result.freePlanVerified).toBe(true);
    expect(result.freePlanEvidence).toEqual([
        { source: 'contract_subscription_get', kind: 'explicit_null_current_upcoming' },
        {
            source: 'limit_dialog_ui',
            kind: 'trial_ended_dialog_current_plan_label',
            planName: 'フリープラン',
        },
    ]);
    expect(result.neverPurchasedVerified).toBe('inconclusive');
});

test('null subscription without Free Plan UI evidence → inconclusive', () => {
    const result = evaluateSubscriptionPrerequisites(STAGING_NULL_SUBSCRIPTION_BODY, {
        verifiedInTrialEndedDialog: false,
    });
    expect(result.freePlanVerified).toBe('inconclusive');
    expect(result.freePlanEvidence).toEqual([
        { source: 'contract_subscription_get', kind: 'explicit_null_current_upcoming' },
    ]);
});

test('malformed subscription fields → inconclusive, never accepted', () => {
    const emptyCurrent = evaluateSubscriptionPrerequisites({
        current: {},
        upcoming: null,
    });
    expect(emptyCurrent.freePlanVerified).toBe('inconclusive');
    expect(emptyCurrent.subscriptionSnapshot).toBeNull();

    const missingUpcoming = evaluateSubscriptionPrerequisites({
        current: null,
    });
    expect(missingUpcoming.freePlanVerified).toBe('inconclusive');
});

test('active paid subscription + Free Plan UI → contradiction failure', () => {
    const result = evaluateSubscriptionPrerequisites(
        {
            data: {
                current: {
                    status: 'active',
                    planName: '3ヶ月プラン',
                    paid: true,
                    interval: 'month',
                    intervalCount: 3,
                },
                upcoming: null,
            },
        },
        { verifiedInTrialEndedDialog: true }
    );
    expect(result.freePlanVerified).toBe(false);
    expect(result.freePlanEvidence).toEqual([
        {
            source: 'limit_dialog_ui',
            kind: 'trial_ended_dialog_current_plan_label',
            planName: 'フリープラン',
        },
    ]);
});

test('paymentHistoryProbeHasEntries: empty data array', () => {
    expect(paymentHistoryProbeHasEntries({ data: [] })).toBe(false);
});

test('enrichPaymentHistoryEvidence: empty probe does not prove never purchased', () => {
    const enriched = enrichPaymentHistoryEvidence(
        { status: 'probe_empty', note: 'Probe HTTP 200; classify body separately.' },
        { data: [] }
    );
    expect(enriched.status).toBe('probe_empty');
    if (enriched.status === 'probe_empty') {
        expect(enriched.note).toMatch(/does not prove/);
    }
});

test('evaluatePaymentHistoryProbe: not observed without response', () => {
    expect(evaluatePaymentHistoryProbe(null).status).toBe('not_observed');
});
