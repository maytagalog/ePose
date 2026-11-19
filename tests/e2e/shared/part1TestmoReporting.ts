import {
    logPart1SmokeEvent,
    logPart1ForgotPasswordVerified,
    type Part1ForgotPasswordVerifiedParams,
    buildPart1ForgotPasswordVerifiedPayload,
} from './smokePart1Reporting';
import { sanitizeFailureReason, sanitizePageLocation } from './smokePart2Reporting';

export type Part1FeatureOutcome = 'passed' | 'failed' | 'not_reached' | 'skipped';

export type Part1TestmoCaseStatus = 'Passed' | 'Failed' | 'Skipped';

export type Part1FeatureOutcomes = {
    accountRegistration: Part1FeatureOutcome;
    firstLogin: Part1FeatureOutcome;
    onlineBooking: Part1FeatureOutcome;
    logoutBeforeForgotPassword: Part1FeatureOutcome;
    forgotPasswordSecondLogin: Part1FeatureOutcome;
    customerCreate: Part1FeatureOutcome;
    customerUpdate: Part1FeatureOutcome;
    customerDelete: Part1FeatureOutcome;
    myPageProfile: Part1FeatureOutcome;
    changeEmail: Part1FeatureOutcome;
    changePassword: Part1FeatureOutcome;
    companyInformation: Part1FeatureOutcome;
    displayItemSettings: Part1FeatureOutcome;
    planPurchase: Part1FeatureOutcome;
    contractPersistence: Part1FeatureOutcome;
    paymentHistoryReceipt: Part1FeatureOutcome;
    referralCouponEmail: Part1FeatureOutcome;
    withdrawal: Part1FeatureOutcome;
};

export type Part1TestmoCaseKey = keyof Part1FeatureOutcomes | 'postureAnalysis' | 'referralCouponCopy';

export type Part1TestmoCaseDefinition = {
    key: Part1TestmoCaseKey;
    automationKey: string;
    title: string;
    deferred?: boolean;
    deferredReason?: string;
};

export const PART1_TESTMO_CASE_DEFINITIONS: Part1TestmoCaseDefinition[] = [
    { key: 'accountRegistration', automationKey: 'part1-smoke-account-registration', title: 'Account Registration' },
    { key: 'firstLogin', automationKey: 'part1-smoke-first-login', title: 'First Login' },
    {
        key: 'onlineBooking',
        automationKey: 'part1-smoke-online-booking',
        title: 'Online Booking and booking email verification',
    },
    {
        key: 'logoutBeforeForgotPassword',
        automationKey: 'part1-smoke-logout-before-forgot-password',
        title: 'Logout before Forgot Password',
    },
    {
        key: 'forgotPasswordSecondLogin',
        automationKey: 'part1-smoke-forgot-password-second-login',
        title: 'Forgot Password, second login, and Customers verification',
    },
    { key: 'customerCreate', automationKey: 'part1-smoke-customer-create', title: 'Customer creation' },
    { key: 'customerUpdate', automationKey: 'part1-smoke-customer-update', title: 'Customer update' },
    { key: 'customerDelete', automationKey: 'part1-smoke-customer-delete', title: 'Customer deletion' },
    { key: 'myPageProfile', automationKey: 'part1-smoke-my-page-profile', title: 'My Page profile update' },
    { key: 'changeEmail', automationKey: 'part1-smoke-change-email', title: 'Change Email' },
    { key: 'changePassword', automationKey: 'part1-smoke-change-password', title: 'Change Password' },
    { key: 'companyInformation', automationKey: 'part1-smoke-company-information', title: 'Company Information' },
    { key: 'displayItemSettings', automationKey: 'part1-smoke-display-item-settings', title: 'Display Item Settings' },
    { key: 'planPurchase', automationKey: 'part1-smoke-plan-purchase', title: 'Plan purchase' },
    { key: 'contractPersistence', automationKey: 'part1-smoke-contract-persistence', title: 'Contract persistence' },
    {
        key: 'paymentHistoryReceipt',
        automationKey: 'part1-smoke-payment-history-receipt',
        title: 'Payment History / receipt',
    },
    { key: 'referralCouponEmail', automationKey: 'part1-smoke-referral-coupon-email', title: 'Referral Coupon Email' },
    {
        key: 'withdrawal',
        automationKey: 'part1-smoke-withdrawal',
        title: 'Withdrawal (renewal stop and rejected login)',
    },
    {
        key: 'postureAnalysis',
        automationKey: 'part1-smoke-posture-analysis',
        title: 'Posture Analysis',
        deferred: true,
        deferredReason: 'outside Part 1 scope',
    },
    {
        key: 'referralCouponCopy',
        automationKey: 'part1-smoke-referral-coupon-copy',
        title: 'Referral Coupon Copy',
        deferred: true,
        deferredReason: 'pending product issue',
    },
];

const NOT_REACHED_DETAIL = 'Not reached: blocked by earlier Part 1 failure';

function emptyOutcomes(): Part1FeatureOutcomes {
    return {
        accountRegistration: 'not_reached',
        firstLogin: 'not_reached',
        onlineBooking: 'not_reached',
        logoutBeforeForgotPassword: 'not_reached',
        forgotPasswordSecondLogin: 'not_reached',
        customerCreate: 'not_reached',
        customerUpdate: 'not_reached',
        customerDelete: 'not_reached',
        myPageProfile: 'not_reached',
        changeEmail: 'not_reached',
        changePassword: 'not_reached',
        companyInformation: 'not_reached',
        displayItemSettings: 'not_reached',
        planPurchase: 'not_reached',
        contractPersistence: 'not_reached',
        paymentHistoryReceipt: 'not_reached',
        referralCouponEmail: 'not_reached',
        withdrawal: 'not_reached',
    };
}

export type Part1TestmoCaseResult = {
    key: Part1TestmoCaseKey;
    automationKey: string;
    title: string;
    status: Part1TestmoCaseStatus;
    outcomeDetail: string;
    verificationDetails?: Record<string, unknown>;
    durationSeconds?: number;
};

export type Part1TestmoCoverageReport = {
    schemaVersion: 2;
    smokePart: 1;
    junitTestcase: { name: 'fullE2ESmokePart1'; classname: 'e2e/fullE2ESmokePart1.spec.ts' };
    cases: Part1TestmoCaseResult[];
    featureOutcomes: Part1FeatureOutcomes;
    caseDurationsMs: Record<string, number>;
    deferred: Array<{ key: Part1TestmoCaseKey; reason: string }>;
    artifacts: Array<{ kind: string; relativePath: string; included: boolean; reason?: string }>;
    sourceRun?: {
        registrationEmail?: string;
        finalAccountEmail?: string;
        resumedApplicationSubmit?: boolean;
    };
    note: string;
};

export type BuildPart1TestmoCoverageInput = {
    featureOutcomes: Part1FeatureOutcomes;
    caseDurationsMs: Record<string, number>;
    verificationByKey?: Partial<Record<keyof Part1FeatureOutcomes, Record<string, unknown>>>;
    failureReason?: string | null;
    registrationResume?: {
        resumedApplicationSubmit: boolean;
        registrationEmail: string;
        priorApplicationSubmitPerformedInThisRun: boolean;
    };
    playwrightAttachments?: string[];
    sourceRun?: Part1TestmoCoverageReport['sourceRun'];
};

function outcomeToStatus(outcome: Part1FeatureOutcome): Part1TestmoCaseStatus {
    if (outcome === 'passed') return 'Passed';
    if (outcome === 'failed') return 'Failed';
    return 'Skipped';
}

function evidenceForKey(
    key: Part1TestmoCaseKey,
    input: BuildPart1TestmoCoverageInput
): Record<string, unknown> | undefined {
    if (key in (input.verificationByKey ?? {})) {
        return input.verificationByKey?.[key as keyof Part1FeatureOutcomes];
    }
    if (key === 'accountRegistration' && input.registrationResume) {
        const { resumedApplicationSubmit, priorApplicationSubmitPerformedInThisRun, registrationEmail } =
            input.registrationResume;
        return {
            registrationEmail: registrationEmail.trim(),
            resumedApplicationSubmit,
            priorApplicationSubmitPerformedInThisRun,
            note: resumedApplicationSubmit
                ? 'Registration resumed from prior application_submit_pending; initial application send was not repeated in this run.'
                : 'Fresh registration including application confirmation send in this run.',
        };
    }
    return undefined;
}

function passedHasEvidence(
    key: Part1TestmoCaseKey,
    status: Part1TestmoCaseStatus,
    verificationDetails?: Record<string, unknown>
): boolean {
    if (status !== 'Passed') return true;
    if (!verificationDetails) return false;
    if (verificationDetails.evidenceStatus === 'unknown') return true;
    return Object.keys(verificationDetails).length > 0;
}

export function buildPart1TestmoCoverageReport(
    input: BuildPart1TestmoCoverageInput
): Part1TestmoCoverageReport {
    const failureDetail = input.failureReason?.trim()
        ? `Failure: ${sanitizeFailureReason(new Error(input.failureReason))}`
        : null;
    const cases: Part1TestmoCaseResult[] = [];
    const deferred: Part1TestmoCoverageReport['deferred'] = [];

    for (const def of PART1_TESTMO_CASE_DEFINITIONS) {
        if (def.deferred) {
            deferred.push({ key: def.key, reason: def.deferredReason ?? 'deferred' });
            cases.push({
                key: def.key,
                automationKey: def.automationKey,
                title: def.title,
                status: 'Skipped',
                outcomeDetail: `Deferred: ${def.deferredReason ?? 'out of scope'}`,
                durationSeconds: 0,
            });
            continue;
        }

        const gate = input.featureOutcomes[def.key as keyof Part1FeatureOutcomes];
        let status = outcomeToStatus(gate);
        let outcomeDetail =
            gate === 'passed'
                ? 'Required verifications completed'
                : gate === 'failed' && failureDetail
                  ? failureDetail
                  : gate === 'failed'
                    ? 'Failed'
                    : NOT_REACHED_DETAIL;

        const verificationDetails = gate === 'passed' ? evidenceForKey(def.key, input) : undefined;

        if (!passedHasEvidence(def.key, status, verificationDetails)) {
            status = 'Failed';
            outcomeDetail = 'Passed outcome without feature-specific verification evidence';
        }

        const durationMs = input.caseDurationsMs[def.key] ?? 0;
        const durationSeconds = durationMs > 0 ? Math.round((durationMs / 1000) * 1000) / 1000 : 0;

        cases.push({
            key: def.key,
            automationKey: def.automationKey,
            title: def.title,
            status,
            outcomeDetail,
            verificationDetails,
            durationSeconds,
        });
    }

    return {
        schemaVersion: 2,
        smokePart: 1,
        junitTestcase: { name: 'fullE2ESmokePart1', classname: 'e2e/fullE2ESmokePart1.spec.ts' },
        cases,
        featureOutcomes: { ...input.featureOutcomes },
        caseDurationsMs: { ...input.caseDurationsMs },
        deferred,
        artifacts: (input.playwrightAttachments ?? [])
            .filter((name) => !/password|token|secret|otp/i.test(name))
            .map((name) => ({
                kind: 'playwright-attachment-ref',
                relativePath: name,
                included: true,
                reason: 'Playwright attachment name from same run',
            })),
        sourceRun: input.sourceRun,
        note: 'Feature cases emitted as separate JUnit testcases at Testmo submit time.',
    };
}

export function logPart1TestmoCoverage(input: BuildPart1TestmoCoverageInput): Part1TestmoCoverageReport {
    const report = buildPart1TestmoCoverageReport(input);
    logPart1SmokeEvent('PART1_TESTMO_COVERAGE', report as unknown as Record<string, unknown>);
    return report;
}

export function logPart1TestmoCoverageFailed(
    input: BuildPart1TestmoCoverageInput & { failureReason: string }
): Part1TestmoCoverageReport {
    const report = buildPart1TestmoCoverageReport(input);
    logPart1SmokeEvent('PART1_TESTMO_COVERAGE_FAILED', {
        failureReason: sanitizeFailureReason(new Error(input.failureReason)),
        featureOutcomes: input.featureOutcomes,
        caseDurationsMs: input.caseDurationsMs,
        cases: report.cases,
    });
    return report;
}

export class SmokePart1RunTracker {
    readonly registrationEmail: string;
    readonly outcomes: Part1FeatureOutcomes = emptyOutcomes();
    readonly caseDurationsMs: Record<string, number> = {};
    readonly stepStartedAt: Record<string, number> = {};
    lastStartedKey: keyof Part1FeatureOutcomes | null = null;
    resumedApplicationSubmit = false;
    readonly verificationByKey: Partial<Record<keyof Part1FeatureOutcomes, Record<string, unknown>>> = {};

    constructor(registrationEmail: string) {
        this.registrationEmail = registrationEmail.trim();
    }

    setResumedApplicationSubmit(resumed: boolean): void {
        this.resumedApplicationSubmit = resumed;
    }

    featureStarted(key: keyof Part1FeatureOutcomes): void {
        this.lastStartedKey = key;
        this.stepStartedAt[key] = Date.now();
    }

    featurePassed(key: keyof Part1FeatureOutcomes): void {
        const started = this.stepStartedAt[key];
        if (started) {
            this.caseDurationsMs[key] = Date.now() - started;
            delete this.stepStartedAt[key];
        }
        this.outcomes[key] = 'passed';
    }

    featureFailed(key: keyof Part1FeatureOutcomes): void {
        const started = this.stepStartedAt[key];
        if (started) {
            this.caseDurationsMs[key] = Date.now() - started;
            delete this.stepStartedAt[key];
        }
        this.outcomes[key] = 'failed';
    }

    private markFeaturePassedIfNeeded(key: keyof Part1FeatureOutcomes): void {
        if (this.outcomes[key] !== 'passed') {
            this.featurePassed(key);
        }
    }

    failAtCurrentStep(error: unknown): void {
        const key = this.lastStartedKey;
        if (key) {
            this.featureFailed(key);
        }
    }

    logRegistrationVerified(evidence: {
        accountRegistrationComplete: boolean;
        registrationMode: 'fresh' | 'resumed_application_submit_pending';
    }): void {
        const payload = {
            registrationEmail: this.registrationEmail,
            accountRegistrationComplete: evidence.accountRegistrationComplete,
            registrationMode: evidence.registrationMode,
            priorApplicationSubmitPerformedInThisRun: evidence.registrationMode === 'fresh',
            resumedApplicationSubmit: evidence.registrationMode === 'resumed_application_submit_pending',
        };
        logPart1SmokeEvent('PART1_REGISTRATION_VERIFIED', payload);
        this.verificationByKey.accountRegistration = payload;
        this.featurePassed('accountRegistration');
    }

    logFirstLoginVerified(accountEmail: string): void {
        const payload = {
            accountEmail: accountEmail.trim(),
            customersRouteReady: true,
        };
        logPart1SmokeEvent('PART1_FIRST_LOGIN_VERIFIED', payload);
        this.verificationByKey.firstLogin = payload;
        this.featurePassed('firstLogin');
    }

    logOnlineBookingVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_ONLINE_BOOKING_VERIFIED', payload);
        this.verificationByKey.onlineBooking = payload;
        this.featurePassed('onlineBooking');
    }

    logLogoutVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_LOGOUT_VERIFIED', payload);
        this.verificationByKey.logoutBeforeForgotPassword = payload;
        this.featurePassed('logoutBeforeForgotPassword');
    }

    logForgotPasswordVerified(params: Part1ForgotPasswordVerifiedParams): void {
        const payload = buildPart1ForgotPasswordVerifiedPayload(params);
        logPart1ForgotPasswordVerified(params);
        this.verificationByKey.forgotPasswordSecondLogin = payload;
        this.featurePassed('forgotPasswordSecondLogin');
    }

    logCustomerCreateVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_CUSTOMER_CREATE_VERIFIED', payload);
        this.verificationByKey.customerCreate = payload;
        this.featurePassed('customerCreate');
    }

    logCustomerUpdateVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_CUSTOMER_UPDATE_VERIFIED', payload);
        this.verificationByKey.customerUpdate = payload;
        this.featurePassed('customerUpdate');
    }

    logCustomerDeleteVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_CUSTOMER_DELETE_VERIFIED', payload);
        this.verificationByKey.customerDelete = payload;
        this.featurePassed('customerDelete');
    }

    logMyPageProfileVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_MY_PAGE_PROFILE_VERIFIED', payload);
        this.verificationByKey.myPageProfile = payload;
        this.featurePassed('myPageProfile');
    }

    logChangeEmailVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_CHANGE_EMAIL_VERIFIED', payload);
        this.verificationByKey.changeEmail = payload;
        this.featurePassed('changeEmail');
    }

    logChangePasswordVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_CHANGE_PASSWORD_VERIFIED', payload);
        this.verificationByKey.changePassword = payload;
        this.featurePassed('changePassword');
    }

    logCompanyInformationVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_COMPANY_INFORMATION_VERIFIED', payload);
        this.verificationByKey.companyInformation = payload;
        this.featurePassed('companyInformation');
    }

    logDisplayItemSettingsVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_DISPLAY_ITEM_SETTINGS_VERIFIED', payload);
        this.verificationByKey.displayItemSettings = payload;
        this.featurePassed('displayItemSettings');
    }

    logPlanPurchaseVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_PLAN_PURCHASE_VERIFIED', payload);
        this.verificationByKey.planPurchase = payload;
        this.markFeaturePassedIfNeeded('planPurchase');
    }

    logContractPersistenceVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_CONTRACT_PERSISTENCE_VERIFIED', payload);
        this.verificationByKey.contractPersistence = payload;
        this.markFeaturePassedIfNeeded('contractPersistence');
    }

    logPaymentHistoryVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_PAYMENT_HISTORY_VERIFIED', payload);
        this.verificationByKey.paymentHistoryReceipt = payload;
        this.markFeaturePassedIfNeeded('paymentHistoryReceipt');
    }

    logReferralCouponEmailVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_REFERRAL_COUPON_EMAIL_VERIFIED', payload);
        this.verificationByKey.referralCouponEmail = payload;
        this.featurePassed('referralCouponEmail');
    }

    logWithdrawalAccountDeletionVerified(
        payload: Record<string, unknown> & { loginRouteReached?: boolean }
    ): void {
        logPart1SmokeEvent('PART1_WITHDRAWAL_ACCOUNT_DELETION_VERIFIED', payload);
        logPart1SmokeEvent('WITHDRAWAL_ACCOUNT_DELETION_VERIFIED', payload);
        this.verificationByKey.withdrawal = {
            accountDeletion: payload,
            rejectedLogin: this.verificationByKey.withdrawal?.rejectedLogin,
        };
    }

    logWithdrawalRejectedLoginVerified(payload: Record<string, unknown>): void {
        logPart1SmokeEvent('PART1_WITHDRAWAL_REJECTED_LOGIN_VERIFIED', payload);
        logPart1SmokeEvent('WITHDRAWAL_REJECTED_LOGIN_VERIFIED', payload);
        const prior = this.verificationByKey.withdrawal ?? {};
        this.verificationByKey.withdrawal = {
            ...prior,
            rejectedLogin: payload,
            rejectedLoginVerified: true,
            verificationMode: 'fresh_browser_context',
        };
        this.featurePassed('withdrawal');
    }

    buildCoverageInput(
        failureReason: string | null,
        extra?: Partial<BuildPart1TestmoCoverageInput>
    ): BuildPart1TestmoCoverageInput {
        return {
            featureOutcomes: { ...this.outcomes },
            caseDurationsMs: { ...this.caseDurationsMs },
            verificationByKey: { ...this.verificationByKey },
            failureReason,
            registrationResume: {
                resumedApplicationSubmit: this.resumedApplicationSubmit,
                registrationEmail: this.registrationEmail,
                priorApplicationSubmitPerformedInThisRun: !this.resumedApplicationSubmit,
            },
            ...extra,
        };
    }

    logRunFailed(error: unknown, finalUrl?: string): void {
        const location = finalUrl ? sanitizePageLocation(finalUrl) : undefined;
        logPart1SmokeEvent('PART1_RUN_FAILED', {
            smokePart: 1,
            featureOutcomes: { ...this.outcomes },
            failureReason: sanitizeFailureReason(error),
            finalOrigin: location?.origin,
            finalPathname: location?.pathname,
        });
    }
}