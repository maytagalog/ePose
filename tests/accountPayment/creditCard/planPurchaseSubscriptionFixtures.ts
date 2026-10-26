/** Staging-shaped subscription payload (2026-10 verification trace); for tests/fixtures only. */
export const STAGING_PAID_THREE_MONTH_SUBSCRIPTION = {
    current: {
        subscriptionId: 'sub_1UU4XPGOFKxlleFj294uXwjQ',
        productId: 'prod_RXIaLSfCyyeH7d',
        status: 'active',
        interval: 'month',
        intervalCount: 3,
        paymentMethod: 'card',
        paid: true,
        invoiceStatus: 'paid',
        periodStart: 1792846747,
        periodEnd: 1800795547,
        cancelAtPeriodEnd: false,
    },
    upcoming: {
        subscriptionId: 'sub_1UU4XPGOFKxlleFj294uXwjQ',
        productId: 'prod_RXIaLSfCyyeH7d',
        interval: 'month',
        intervalCount: 3,
        periodStart: 1800795547,
        periodEnd: 1808571547,
        paymentMethod: 'charge_automatically',
        paid: false,
    },
};
