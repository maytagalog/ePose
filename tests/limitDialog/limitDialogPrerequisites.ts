import type { Response } from '@playwright/test';
import {
    buildContractSubscriptionSnapshot,
    contractPaymentHistoryRequestKind,
    GET_CONTRACT_PAYMENT_HISTORY_URL,
    GET_CONTRACT_SUBSCRIPTION_URL,
} from '../accountPayment/creditCard/planPurchaseFlow';
import type { ContractSubscriptionSnapshot } from '../accountPayment/creditCard/planPurchaseFlow';
import { SMOKE_PART2_LIMIT_DIALOG_CURRENT_PLAN_TEXT } from '../e2e/shared/smokePart2Config';

const MS_PER_DAY = 86_400_000;

export type AccountAgeEvidence =
    | { status: 'not_verifiable'; reason: string }
    | { status: 'verified_over_14_days'; accountAgeDays: number; sourceField: string }
    | { status: 'failed_under_14_days'; accountAgeDays: number; sourceField: string };

export type PaymentHistoryPrerequisiteEvidence =
    | { status: 'not_observed'; reason: string }
    | { status: 'probe_empty'; note: string }
    | { status: 'probe_has_entries'; entryCount: number; note: string }
    | { status: 'probe_failed'; httpStatus: number };

export type FreePlanEvidenceSource =
    | {
          source: 'contract_subscription_get';
          kind: 'named_free_plan';
          planName: string;
      }
    | {
          source: 'contract_subscription_get';
          kind: 'explicit_null_current_upcoming';
      }
    | {
          source: 'limit_dialog_ui';
          kind: 'trial_ended_dialog_current_plan_label';
          planName: string;
      };

export type LimitDialogUiFreePlanEvidence = {
    /** Each required Limit Dialog dismissal verified フリープラン in the trial-ended dialog. */
    verifiedInTrialEndedDialog: boolean;
};

export type LimitDialogPrerequisiteEvidence = {
    subscriptionObserved: boolean;
    subscriptionSnapshot: ContractSubscriptionSnapshot['summaryForLogs'] | null;
    freePlanVerified: boolean | 'inconclusive';
    freePlanEvidence: FreePlanEvidenceSource[];
    neverPurchasedVerified: boolean | 'inconclusive';
    accountAge: AccountAgeEvidence;
    paymentHistory: PaymentHistoryPrerequisiteEvidence;
};

function planNameLooksFree(planName: string | null | undefined): boolean {
    return !!planName && /free|フリー/i.test(planName);
}

function unwrapSubscriptionRoot(
    body: unknown
): Record<string, unknown> | 'not_object' | 'unknown_shape' {
    if (!body || typeof body !== 'object') {
        return 'not_object';
    }
    const envelope = body as Record<string, unknown>;
    const data = envelope.data;
    if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        ('current' in (data as Record<string, unknown>) ||
            'upcoming' in (data as Record<string, unknown>))
    ) {
        return data as Record<string, unknown>;
    }
    if ('current' in envelope || 'upcoming' in envelope) {
        return envelope;
    }
    return 'unknown_shape';
}

/**
 * Staging HTTP 200 with `"current": null` and `"upcoming": null` only — not missing keys,
 * not `undefined`, and not an empty/malformed current object.
 */
export function isStrictExplicitNullSubscriptionRoot(root: Record<string, unknown>): boolean {
    if (!('current' in root) || root.current !== null) {
        return false;
    }
    if (!('upcoming' in root) || root.upcoming !== null) {
        return false;
    }
    for (const key of ['oneTimeInvoicePendingSubscription', 'requiresActionPendingSubscription'] as const) {
        if (key in root && root[key] !== null) {
            return false;
        }
    }
    return true;
}

function subscriptionBlocksFreePlan(snapshot: ContractSubscriptionSnapshot): boolean {
    return (
        snapshot.hasActivePaidCurrent ||
        snapshot.hasPendingPaymentAction ||
        snapshot.hasPendingBankTransfer ||
        snapshot.hasUpcomingPaidPlan
    );
}

function readAccountAgeDays(body: unknown): AccountAgeEvidence {
    if (!body || typeof body !== 'object') {
        return {
            status: 'not_verifiable',
            reason: 'auth/profile or account payload not available for age verification.',
        };
    }
    const root = body as Record<string, unknown>;
    const candidates: Array<{ field: string; epochMs: number }> = [];
    for (const field of ['createdAt', 'registeredAt', 'accountCreatedAt', 'created_at']) {
        const raw = root[field];
        if (typeof raw === 'string' || typeof raw === 'number') {
            const epochMs =
                typeof raw === 'number'
                    ? raw > 1_000_000_000_000
                        ? raw
                        : raw * 1000
                    : Date.parse(raw);
            if (Number.isFinite(epochMs)) {
                candidates.push({ field, epochMs });
            }
        }
    }
    if (candidates.length === 0) {
        return {
            status: 'not_verifiable',
            reason:
                'Observed auth/profile JSON has no createdAt-style field; account age >14 days cannot be verified from current API contract.',
        };
    }
    const chosen = candidates[0];
    const accountAgeDays = Math.floor((Date.now() - chosen.epochMs) / MS_PER_DAY);
    if (accountAgeDays > 14) {
        return {
            status: 'verified_over_14_days',
            accountAgeDays,
            sourceField: chosen.field,
        };
    }
    return {
        status: 'failed_under_14_days',
        accountAgeDays,
        sourceField: chosen.field,
    };
}

export function evaluateSubscriptionPrerequisites(
    subscriptionBody: unknown,
    uiEvidence: LimitDialogUiFreePlanEvidence = { verifiedInTrialEndedDialog: false }
): Pick<
    LimitDialogPrerequisiteEvidence,
    | 'subscriptionObserved'
    | 'subscriptionSnapshot'
    | 'freePlanVerified'
    | 'freePlanEvidence'
    | 'neverPurchasedVerified'
> {
    const freePlanEvidence: FreePlanEvidenceSource[] = [];

    if (subscriptionBody === null || subscriptionBody === undefined) {
        return {
            subscriptionObserved: false,
            subscriptionSnapshot: null,
            freePlanVerified: 'inconclusive',
            freePlanEvidence,
            neverPurchasedVerified: 'inconclusive',
        };
    }

    const subscriptionObserved = true;
    let snapshot: ContractSubscriptionSnapshot;
    try {
        snapshot = buildContractSubscriptionSnapshot(subscriptionBody);
    } catch {
        return {
            subscriptionObserved,
            subscriptionSnapshot: null,
            freePlanVerified: 'inconclusive',
            freePlanEvidence,
            neverPurchasedVerified: 'inconclusive',
        };
    }

    const root = unwrapSubscriptionRoot(subscriptionBody);
    const uiVerified = uiEvidence.verifiedInTrialEndedDialog === true;
    if (uiVerified) {
        freePlanEvidence.push({
            source: 'limit_dialog_ui',
            kind: 'trial_ended_dialog_current_plan_label',
            planName: SMOKE_PART2_LIMIT_DIALOG_CURRENT_PLAN_TEXT,
        });
    }

    if (subscriptionBlocksFreePlan(snapshot)) {
        return {
            subscriptionObserved,
            subscriptionSnapshot: snapshot.summaryForLogs,
            freePlanVerified: false,
            freePlanEvidence,
            neverPurchasedVerified: 'inconclusive',
        };
    }

    const planLabel = snapshot.currentPlanLabel;
    if (planNameLooksFree(planLabel)) {
        freePlanEvidence.unshift({
            source: 'contract_subscription_get',
            kind: 'named_free_plan',
            planName: planLabel!,
        });
        return {
            subscriptionObserved,
            subscriptionSnapshot: snapshot.summaryForLogs,
            freePlanVerified: true,
            freePlanEvidence,
            neverPurchasedVerified: 'inconclusive',
        };
    }

    if (root !== 'not_object' && root !== 'unknown_shape' && isStrictExplicitNullSubscriptionRoot(root)) {
        freePlanEvidence.unshift({
            source: 'contract_subscription_get',
            kind: 'explicit_null_current_upcoming',
        });
        if (uiVerified) {
            return {
                subscriptionObserved,
                subscriptionSnapshot: snapshot.summaryForLogs,
                freePlanVerified: true,
                freePlanEvidence,
                neverPurchasedVerified: 'inconclusive',
            };
        }
        return {
            subscriptionObserved,
            subscriptionSnapshot: snapshot.summaryForLogs,
            freePlanVerified: 'inconclusive',
            freePlanEvidence,
            neverPurchasedVerified: 'inconclusive',
        };
    }

    return {
        subscriptionObserved,
        subscriptionSnapshot: snapshot.summaryForLogs,
        freePlanVerified: 'inconclusive',
        freePlanEvidence,
        neverPurchasedVerified: 'inconclusive',
    };
}

export function evaluatePaymentHistoryProbe(
    response: Response | null
): PaymentHistoryPrerequisiteEvidence {
    if (!response) {
        return {
            status: 'not_observed',
            reason: 'Payment history probe (limit=1) was not observed on /customers.',
        };
    }
    const httpStatus = response.status();
    if (httpStatus !== 200) {
        return { status: 'probe_failed', httpStatus };
    }
    return {
        status: 'probe_empty',
        note: 'Probe HTTP 200; classify body separately.',
    };
}

export function mergePrerequisiteEvidence(
    subscriptionPart: ReturnType<typeof evaluateSubscriptionPrerequisites>,
    paymentHistory: PaymentHistoryPrerequisiteEvidence,
    authProfileBody: unknown | null
): LimitDialogPrerequisiteEvidence {
    const accountAge = readAccountAgeDays(authProfileBody);
    return {
        ...subscriptionPart,
        neverPurchasedVerified: 'inconclusive',
        accountAge,
        paymentHistory,
    };
}

export function isContractSubscriptionGetResponse(res: Response): boolean {
    return (
        res.url().startsWith(GET_CONTRACT_SUBSCRIPTION_URL) &&
        res.request().method() === 'GET' &&
        res.status() === 200
    );
}

export function isContractPaymentHistoryProbeResponse(res: Response): boolean {
    return (
        res.request().method() === 'GET' &&
        contractPaymentHistoryRequestKind(res.url()) === 'probe' &&
        res.status() >= 200 &&
        res.status() < 500
    );
}

export function paymentHistoryProbeHasEntries(body: unknown): boolean | 'unknown_shape' {
    if (!body || typeof body !== 'object') {
        return 'unknown_shape';
    }
    const record = body as Record<string, unknown>;
    const data = record.data;
    if (Array.isArray(data)) {
        return data.length > 0;
    }
    if (Array.isArray(record.payments)) {
        return record.payments.length > 0;
    }
    return 'unknown_shape';
}

export function enrichPaymentHistoryEvidence(
    base: PaymentHistoryPrerequisiteEvidence,
    body: unknown
): PaymentHistoryPrerequisiteEvidence {
    if (base.status !== 'probe_empty' && base.status !== 'not_observed') {
        return base;
    }
    const hasEntries = paymentHistoryProbeHasEntries(body);
    if (hasEntries === 'unknown_shape') {
        return {
            status: 'not_observed',
            reason: 'Payment history probe shape unknown; cannot infer prior purchases.',
        };
    }
    if (hasEntries) {
        return {
            status: 'probe_has_entries',
            entryCount: 1,
            note: 'Probe showed stored payments; account is not "never purchased" by this evidence alone.',
        };
    }
    return {
        status: 'probe_empty',
        note:
            'Probe returned no payment rows, but API contract does not prove the account never purchased historically.',
    };
}

export { GET_CONTRACT_SUBSCRIPTION_URL, GET_CONTRACT_PAYMENT_HISTORY_URL };
