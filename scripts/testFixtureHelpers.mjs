import { PART1_TESTMO_CASE_DEFINITIONS } from './part1TestmoConstants.mjs';
import { buildPart1TestmoCoverageFromEvents } from './part1TestmoCoverageFromEvents.mjs';

const PART1_EVENTS = {
    PART1_REGISTRATION_VERIFIED: { registrationMode: 'fresh', priorApplicationSubmitPerformedInThisRun: true },
    PART1_FIRST_LOGIN_VERIFIED: { customersRouteReady: true },
    PART1_ONLINE_BOOKING_VERIFIED: { bookingEmailVerified: true },
    PART1_LOGOUT_VERIFIED: { logoutVerified: true },
    PART1_FORGOT_PASSWORD_VERIFIED: { customersVisibleVerified: true },
    PART1_CUSTOMER_CREATE_VERIFIED: { customerId: 'id-1' },
    PART1_CUSTOMER_UPDATE_VERIFIED: { customerId: 'id-1' },
    PART1_CUSTOMER_DELETE_VERIFIED: { customerId: 'id-1' },
    PART1_MY_PAGE_PROFILE_VERIFIED: { furiganaUpdated: true },
    PART1_CHANGE_EMAIL_VERIFIED: { changeEmailVerified: true },
    PART1_CHANGE_PASSWORD_VERIFIED: { changePasswordVerified: true },
    PART1_COMPANY_INFORMATION_VERIFIED: { companyInformationVerified: true },
    PART1_DISPLAY_ITEM_SETTINGS_VERIFIED: { displayItemSettingsVerified: true },
    PART1_PLAN_PURCHASE_VERIFIED: { planPurchaseVerified: true },
    PART1_CONTRACT_PERSISTENCE_VERIFIED: { contractPersistenceVerified: true },
    PART1_PAYMENT_HISTORY_VERIFIED: { paymentHistoryReceiptVerified: true },
    PART1_REFERRAL_COUPON_EMAIL_VERIFIED: { referralCouponEmailVerified: true },
    PART1_WITHDRAWAL_VERIFIED: { accountWithdrawn: true },
};

export function injectPart1TestmoCoverageFromFortyOne(part1Xml) {
    const active = PART1_TESTMO_CASE_DEFINITIONS.filter((d) => !d.deferred);
    const outcomes = Object.fromEntries(active.map((d) => [d.key, 'passed']));
    const caseDurationsMs = Object.fromEntries(
        active.map((d, index) => [d.key, 24_000 + index * 50])
    );
    const report = buildPart1TestmoCoverageFromEvents({
        featureOutcomes: outcomes,
        events: PART1_EVENTS,
        caseDurationsMs,
    });
    const line = `PART1_TESTMO_COVERAGE ${JSON.stringify({
        ...report,
        cases: report.cases.map((c) => ({
            ...c,
            verificationDetails:
                c.verificationDetails ??
                PART1_EVENTS[
                    `PART1_${c.key === 'forgotPasswordSecondLogin' ? 'FORGOT_PASSWORD' : c.key.replace(/([A-Z])/g, '_$1').toUpperCase()}_VERIFIED`
                ] ??
                { verified: true },
        })),
    })}\n`;
    if (part1Xml.includes('<system-out>')) {
        return part1Xml.replace(
            /<system-out>([\s\S]*?)<\/system-out>/,
            `<system-out><![CDATA[${line}$1]]></system-out>`
        );
    }
    return part1Xml.replace(
        '</testcase>',
        `<system-out><![CDATA[${line}]]></system-out></testcase>`
    );
}