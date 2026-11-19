export const PART1_FEATURE_CLASSNAME = 'e2e/part1SmokeTestmoFeature.spec.ts';
export const PART1_AGGREGATE_CLASSNAME = 'e2e/fullE2ESmokePart1.spec.ts';
export const PART1_AGGREGATE_TESTNAME = 'fullE2ESmokePart1';

/** Stable TestMo automation identities (Part 1 smoke bucket). Order defines cascade "Not reached". */
export const PART1_TESTMO_CASE_DEFINITIONS = [
    {
        key: 'accountRegistration',
        automationKey: 'part1-smoke-account-registration',
        title: 'Account Registration',
        flowOrder: 1,
    },
    {
        key: 'firstLogin',
        automationKey: 'part1-smoke-first-login',
        title: 'First Login',
        flowOrder: 2,
    },
    {
        key: 'onlineBooking',
        automationKey: 'part1-smoke-online-booking',
        title: 'Online Booking and booking email verification',
        flowOrder: 3,
    },
    {
        key: 'logoutBeforeForgotPassword',
        automationKey: 'part1-smoke-logout-before-forgot-password',
        title: 'Logout before Forgot Password',
        flowOrder: 4,
    },
    {
        key: 'forgotPasswordSecondLogin',
        automationKey: 'part1-smoke-forgot-password-second-login',
        title: 'Forgot Password, second login, and Customers verification',
        flowOrder: 5,
    },
    {
        key: 'customerCreate',
        automationKey: 'part1-smoke-customer-create',
        title: 'Customer creation',
        flowOrder: 6,
    },
    {
        key: 'customerUpdate',
        automationKey: 'part1-smoke-customer-update',
        title: 'Customer update',
        flowOrder: 7,
    },
    {
        key: 'customerDelete',
        automationKey: 'part1-smoke-customer-delete',
        title: 'Customer deletion',
        flowOrder: 8,
    },
    {
        key: 'myPageProfile',
        automationKey: 'part1-smoke-my-page-profile',
        title: 'My Page profile update',
        flowOrder: 9,
    },
    {
        key: 'changeEmail',
        automationKey: 'part1-smoke-change-email',
        title: 'Change Email',
        flowOrder: 10,
    },
    {
        key: 'changePassword',
        automationKey: 'part1-smoke-change-password',
        title: 'Change Password',
        flowOrder: 11,
    },
    {
        key: 'companyInformation',
        automationKey: 'part1-smoke-company-information',
        title: 'Company Information',
        flowOrder: 12,
    },
    {
        key: 'displayItemSettings',
        automationKey: 'part1-smoke-display-item-settings',
        title: 'Display Item Settings',
        flowOrder: 13,
    },
    {
        key: 'planPurchase',
        automationKey: 'part1-smoke-plan-purchase',
        title: 'Plan purchase',
        flowOrder: 14,
    },
    {
        key: 'contractPersistence',
        automationKey: 'part1-smoke-contract-persistence',
        title: 'Contract persistence',
        flowOrder: 15,
    },
    {
        key: 'paymentHistoryReceipt',
        automationKey: 'part1-smoke-payment-history-receipt',
        title: 'Payment History / receipt',
        flowOrder: 16,
    },
    {
        key: 'referralCouponEmail',
        automationKey: 'part1-smoke-referral-coupon-email',
        title: 'Referral Coupon Email',
        flowOrder: 17,
    },
    {
        key: 'withdrawal',
        automationKey: 'part1-smoke-withdrawal',
        title: 'Withdrawal (renewal stop and rejected login)',
        flowOrder: 18,
    },
    {
        key: 'postureAnalysis',
        automationKey: 'part1-smoke-posture-analysis',
        title: 'Posture Analysis',
        flowOrder: 19,
        deferred: true,
        deferredReason: 'outside Part 1 scope',
    },
    {
        key: 'referralCouponCopy',
        automationKey: 'part1-smoke-referral-coupon-copy',
        title: 'Referral Coupon Copy',
        flowOrder: 20,
        deferred: true,
        deferredReason: 'pending product issue',
    },
];

export const PART1_FLOW_CASE_KEYS = PART1_TESTMO_CASE_DEFINITIONS.filter((d) => !d.deferred).map(
    (d) => d.key
);

export const PART1_DEFERRED_CASE_KEYS = PART1_TESTMO_CASE_DEFINITIONS.filter((d) => d.deferred).map(
    (d) => d.key
);

export const NOT_REACHED_DETAIL_PART1 = 'Not reached: blocked by earlier Part 1 failure';
export const UNKNOWN_DETAIL_PART1 = 'Unknown: insufficient retained verification evidence';
export const PASSED_OUTCOME_ONLY_DETAIL_PART1 =
    'Passed according to retained run outcome; detailed verification evidence unavailable.';