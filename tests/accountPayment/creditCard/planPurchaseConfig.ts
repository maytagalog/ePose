/**
 * Stripe test card defaults match tests/accountPayment/creditCard/creditCard.spec.ts (staging).
 * Override via env without logging secrets in test output.
 */
export const STRIPE_TEST_CARD_NUMBER_ENV = 'EPOSE_STRIPE_TEST_CARD_NUMBER';
export const STRIPE_TEST_CARD_EXPIRY_ENV = 'EPOSE_STRIPE_TEST_CARD_EXPIRY';
export const STRIPE_TEST_CARD_CVC_ENV = 'EPOSE_STRIPE_TEST_CARD_CVC';

const DEFAULT_CARD_NUMBER = '4242 4242 4242 4242';
const DEFAULT_CARD_EXPIRY = '04 / 29';
const DEFAULT_CARD_CVC = '832';

export type StripeTestCardCredentials = {
    number: string;
    expiry: string;
    cvc: string;
    last4: string;
};

function digitsOnly(value: string): string {
    return value.replace(/\D/g, '');
}

export function resolveStripeTestCardCredentials(): StripeTestCardCredentials {
    const numberRaw = process.env[STRIPE_TEST_CARD_NUMBER_ENV]?.trim() || DEFAULT_CARD_NUMBER;
    const expiry = process.env[STRIPE_TEST_CARD_EXPIRY_ENV]?.trim() || DEFAULT_CARD_EXPIRY;
    const cvc = process.env[STRIPE_TEST_CARD_CVC_ENV]?.trim() || DEFAULT_CARD_CVC;
    const digits = digitsOnly(numberRaw);
    const last4 = digits.length >= 4 ? digits.slice(-4) : '4242';
    return {
        number: numberRaw,
        expiry,
        cvc,
        last4,
    };
}
