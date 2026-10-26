import { test, expect } from '@playwright/test';
import { ReferralEmailSendGuard, ReferralCouponFlowError } from './referralCouponFlow';

test('ReferralEmailSendGuard: second send throws without retry', () => {
    const guard = new ReferralEmailSendGuard();
    guard.markSent();
    expect(() => guard.markSent()).toThrow(ReferralCouponFlowError);
    expect(() => guard.markSent()).toThrow(/already attempted/);
});
