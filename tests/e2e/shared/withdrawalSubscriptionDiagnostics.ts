import { parseSubscriptionEnvelope, parseSubscriptionPeriodNode } from '../../accountPayment/creditCard/planPurchaseFlow';

export type WithdrawalSubscriptionDiagnostics = {
    subscriptionId: string | null;
    productId: string | null;
    status: string | null;
    paid: boolean | null;
    cancelAtPeriodEnd: boolean | null;
    interval: string | null;
    intervalCount: number | null;
};

export function summarizeSubscriptionForDiagnostics(subscriptionBody: unknown): WithdrawalSubscriptionDiagnostics {
    const { current } = parseSubscriptionEnvelope(subscriptionBody);
    const parsed = current ? parseSubscriptionPeriodNode(current) : null;
    if (!parsed) {
        return {
            subscriptionId: null,
            productId: null,
            status: null,
            paid: null,
            cancelAtPeriodEnd: null,
            interval: null,
            intervalCount: null,
        };
    }
    return {
        subscriptionId: parsed.subscriptionId,
        productId: parsed.productId,
        status: parsed.status,
        paid: parsed.paid,
        cancelAtPeriodEnd: parsed.cancelAtPeriodEnd,
        interval: parsed.interval,
        intervalCount: parsed.intervalCount,
    };
}