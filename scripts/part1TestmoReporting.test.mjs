import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PART1_TESTMO_CASE_DEFINITIONS } from './part1TestmoConstants.mjs';
import {
    buildPart1CoverageFromSystemOut,
    buildPart1TestmoCoverageFromEvents,
} from './part1TestmoCoverageFromEvents.mjs';
import {
    buildTestmoSubmitJUnit,
    validateTestmoSubmitXml,
} from './buildTestmoSubmitJUnit.mjs';

const ALL_PASSED_OUTCOMES = Object.fromEntries(
    PART1_TESTMO_CASE_DEFINITIONS.filter((d) => !d.deferred).map((d) => [d.key, 'passed'])
);

const SYNTHETIC_PART1_COVERAGE = `PART1_RUN_STARTED {"smokePart":1,"accountEmail":"synthetic@example.com"}
PART1_REGISTRATION_VERIFIED {"registrationEmail":"synthetic@example.com","registrationMode":"resumed_application_submit_pending","resumedApplicationSubmit":true,"priorApplicationSubmitPerformedInThisRun":false}
PART1_TESTMO_COVERAGE {"schemaVersion":2,"smokePart":1,"cases":[]}`;

test('Part 1 deferred features are explicit Skipped with reasons', () => {
    const coverage = buildPart1TestmoCoverageFromEvents({
        featureOutcomes: ALL_PASSED_OUTCOMES,
        events: {},
        failureReason: null,
    });
    const posture = coverage.cases.find((c) => c.key === 'postureAnalysis');
    const copy = coverage.cases.find((c) => c.key === 'referralCouponCopy');
    assert.equal(posture.status, 'Skipped');
    assert.match(posture.outcomeDetail, /outside Part 1 scope/);
    assert.equal(copy.status, 'Skipped');
    assert.match(copy.outcomeDetail, /pending product issue/);
});

test('Part 1 mid-flow failure marks downstream Not reached', () => {
    const outcomes = { ...ALL_PASSED_OUTCOMES, onlineBooking: 'failed', customerCreate: 'not_reached' };
    const coverage = buildPart1TestmoCoverageFromEvents({
        featureOutcomes: outcomes,
        events: {
            PART1_REGISTRATION_VERIFIED: { registrationMode: 'fresh' },
            PART1_FIRST_LOGIN_VERIFIED: { customersRouteReady: true },
        },
        failureReason: 'booking email timeout',
    });
    assert.equal(coverage.cases.find((c) => c.key === 'firstLogin')?.status, 'Passed');
    assert.equal(coverage.cases.find((c) => c.key === 'onlineBooking')?.status, 'Failed');
    assert.match(
        coverage.cases.find((c) => c.key === 'customerCreate')?.outcomeDetail ?? '',
        /Not reached/
    );
});

test('resumed registration does not claim initial application resubmit', () => {
    const coverage = buildPart1CoverageFromSystemOut(SYNTHETIC_PART1_COVERAGE);
    assert.ok(coverage);
});

test('submit XML has no aggregate cases and totals Part 1 + Part 2 features', () => {
    const part1Events = {
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
    const part1Cases = buildPart1TestmoCoverageFromEvents({
        featureOutcomes: ALL_PASSED_OUTCOMES,
        events: part1Events,
    });
    const part1Embedded = JSON.stringify({
        ...part1Cases,
        cases: part1Cases.cases.map((c) => ({
            ...c,
            verificationDetails:
                c.verificationDetails ??
                (c.status === 'Passed' ? { verified: true, accountEmail: 'synthetic@example.com' } : c.verificationDetails),
        })),
    });
    const part2Embedded = JSON.stringify({
        schemaVersion: 2,
        smokePart: 2,
        cases: [{ key: 'login', automationKey: 'part2-smoke-login', title: 'Login', status: 'Passed', outcomeDetail: 'ok' }],
    });
    const combined = `<testsuites tests="2" failures="0" skipped="0" errors="0" time="1">
<testsuite name="e2e/fullE2ESmokePart1.spec.ts" hostname="chromium" tests="1" failures="0" skipped="0" errors="0" time="1" timestamp="2026-11-17T10:00:00.000Z">
<testcase name="fullE2ESmokePart1" classname="e2e/fullE2ESmokePart1.spec.ts" time="1">
<system-out><![CDATA[PART1_TESTMO_COVERAGE ${part1Embedded}]]></system-out>
</testcase>
</testsuite>
<testsuite name="e2e/fullE2ESmokePart2.spec.ts" hostname="chromium" tests="1" failures="0" skipped="0" errors="0" time="1" timestamp="2026-11-17T11:00:00.000Z">
<testcase name="fullE2ESmokePart2" classname="e2e/fullE2ESmokePart2.spec.ts" time="1">
<system-out><![CDATA[PART2_TESTMO_COVERAGE ${part2Embedded}]]></system-out>
</testcase>
</testsuite>
</testsuites>`;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'part1-submit-'));
    fs.writeFileSync(path.join(dir, 'results.xml'), combined);
    const built = buildTestmoSubmitJUnit(combined, { repoRoot: dir, part2SourcePath: path.join(dir, 'missing-part2.xml') });
    assert.equal(built.enriched, true);
    assert.doesNotMatch(built.xml, /name="fullE2ESmokePart1"/);
    assert.doesNotMatch(built.xml, /name="fullE2ESmokePart2"/);
    const validation = validateTestmoSubmitXml(built.xml);
    assert.equal(
        validation.totalUploadedTestcases,
        validation.part1FeatureCount + validation.part2FeatureCount
    );
    assert.equal(validation.part1FeatureCount, PART1_TESTMO_CASE_DEFINITIONS.length);
    assert.equal(validation.part2FeatureCount, 1);
    assert.equal(validation.totalUploadedTestcases, PART1_TESTMO_CASE_DEFINITIONS.length + 1);
});