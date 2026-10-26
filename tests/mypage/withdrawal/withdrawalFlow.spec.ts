import { test, expect } from '@playwright/test';
import {
    WithdrawalFlowError,
    WithdrawalSubmitGuard,
    assertInvalidCredentialsLoginResponse,
    assertSubscriptionRenewalDisabled,
} from './withdrawalFlow';

test('WithdrawalSubmitGuard: second final 退会する throws', () => {
    const guard = new WithdrawalSubmitGuard();
    guard.markFinalWithdrawalAttempted();
    expect(() => guard.markFinalWithdrawalAttempted()).toThrow(WithdrawalFlowError);
    expect(() => guard.markFinalWithdrawalAttempted()).toThrow(/already attempted/);
});

test('assertSubscriptionRenewalDisabled: requires cancelAtPeriodEnd true', () => {
    const activePaid = {
        current: {
            subscriptionId: 'sub_1',
            productId: 'prod',
            status: 'active',
            interval: 'month',
            intervalCount: 3,
            paid: true,
            invoiceStatus: 'paid',
            periodStart: 1_700_000_000,
            periodEnd: 1_700_900_000,
            cancelAtPeriodEnd: false,
        },
        upcoming: null,
    };
    expect(() => assertSubscriptionRenewalDisabled(activePaid)).toThrow(/cancelAtPeriodEnd/);

    assertSubscriptionRenewalDisabled({
        current: { ...activePaid.current, cancelAtPeriodEnd: true },
        upcoming: null,
    });
});

test('assertInvalidCredentialsLoginResponse: 401 InvalidParameter vs 503', () => {
    const body = {
        errors: [{ extensions: { errorCode: 'InvalidParameter', statusCode: 401 } }],
    };
    assertInvalidCredentialsLoginResponse(401, body);
    expect(() => assertInvalidCredentialsLoginResponse(503, body)).toThrow(/server error/i);
});
