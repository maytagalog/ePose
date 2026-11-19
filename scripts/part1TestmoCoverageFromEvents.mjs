import {
    NOT_REACHED_DETAIL_PART1,
    PART1_DEFERRED_CASE_KEYS,
    PART1_FLOW_CASE_KEYS,
    PART1_TESTMO_CASE_DEFINITIONS,
    PASSED_OUTCOME_ONLY_DETAIL_PART1,
    UNKNOWN_DETAIL_PART1,
} from './part1TestmoConstants.mjs';
import { enrichPart1CaseDurations } from './testmoFeatureTiming.mjs';

const EVENT_LINE = /^([A-Z0-9_]+) (\{[\s\S]*\})\s*$/;

export function parsePart1ConsoleEvents(systemOut) {
    const events = {};
    if (!systemOut) {
        return events;
    }
    const text = systemOut.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line.startsWith('PART1_')) {
            continue;
        }
        const match = EVENT_LINE.exec(line);
        if (!match) {
            continue;
        }
        try {
            events[match[1]] = JSON.parse(match[2]);
        } catch {
            /* ignore */
        }
    }
    return events;
}

function outcomeToStatus(outcome) {
    if (outcome === 'passed') {
        return 'Passed';
    }
    if (outcome === 'failed') {
        return 'Failed';
    }
    return 'Skipped';
}

function sanitizeFailureReason(message) {
    return String(message ?? '')
        .replace(/Passw0rd|P@ssw0rd|Password123/gi, '[redacted-password]')
        .slice(0, 500);
}

function verificationFromEvents(key, events, featureOutcome) {
    const map = {
        accountRegistration: events.PART1_REGISTRATION_VERIFIED,
        firstLogin: events.PART1_FIRST_LOGIN_VERIFIED,
        onlineBooking: events.PART1_ONLINE_BOOKING_VERIFIED,
        logoutBeforeForgotPassword: events.PART1_LOGOUT_VERIFIED,
        forgotPasswordSecondLogin: events.PART1_FORGOT_PASSWORD_VERIFIED,
        customerCreate: events.PART1_CUSTOMER_CREATE_VERIFIED,
        customerUpdate: events.PART1_CUSTOMER_UPDATE_VERIFIED,
        customerDelete: events.PART1_CUSTOMER_DELETE_VERIFIED,
        myPageProfile: events.PART1_MY_PAGE_PROFILE_VERIFIED,
        changeEmail: events.PART1_CHANGE_EMAIL_VERIFIED,
        changePassword: events.PART1_CHANGE_PASSWORD_VERIFIED,
        companyInformation: events.PART1_COMPANY_INFORMATION_VERIFIED,
        displayItemSettings: events.PART1_DISPLAY_ITEM_SETTINGS_VERIFIED,
        planPurchase: events.PART1_PLAN_PURCHASE_VERIFIED,
        contractPersistence: events.PART1_CONTRACT_PERSISTENCE_VERIFIED,
        paymentHistoryReceipt: events.PART1_PAYMENT_HISTORY_VERIFIED,
        referralCouponEmail: events.PART1_REFERRAL_COUPON_EMAIL_VERIFIED,
        withdrawal:
            events.PART1_WITHDRAWAL_ACCOUNT_DELETION_VERIFIED ??
            events.WITHDRAWAL_ACCOUNT_DELETION_VERIFIED ??
            events.PART1_WITHDRAWAL_VERIFIED,
    };
    const raw = map[key];
    if (!raw) {
        if (featureOutcome === 'passed') {
            return { evidenceStatus: 'unknown', note: PASSED_OUTCOME_ONLY_DETAIL_PART1 };
        }
        return undefined;
    }
    return raw;
}

function passedRequiresEvidence(status, verificationDetails) {
    if (status !== 'Passed') {
        return true;
    }
    if (!verificationDetails) {
        return false;
    }
    if (verificationDetails.evidenceStatus === 'unknown') {
        return true;
    }
    return true;
}

function applyDerivedPassedCopy(caseResult, markDerived) {
    if (!markDerived || caseResult.status !== 'Passed') {
        return caseResult;
    }
  if (caseResult.verificationDetails?.evidenceStatus === 'unknown') {
        return { ...caseResult, outcomeDetail: PASSED_OUTCOME_ONLY_DETAIL_PART1 };
    }
    return caseResult;
}

/**
 * @param {object} input
 * @param {Record<string, string>} input.featureOutcomes
 * @param {Record<string, number>} [input.caseDurationsMs]
 * @param {string | null | undefined} input.failureReason
 * @param {object} input.events
 * @param {boolean} [input.markDerived]
 */
export function buildPart1TestmoCoverageFromEvents(input) {
    const failureDetail = input.failureReason?.trim()
        ? `Failure: ${sanitizeFailureReason(input.failureReason)}`
        : null;
    const outcomes = input.featureOutcomes ?? {};
    const cases = [];

    for (const def of PART1_TESTMO_CASE_DEFINITIONS) {
        if (def.deferred) {
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

        const gate = outcomes[def.key] ?? 'not_reached';
        let status = outcomeToStatus(gate);
        let outcomeDetail =
            gate === 'passed'
                ? 'Required verifications completed'
                : gate === 'failed' && failureDetail
                  ? failureDetail
                  : gate === 'failed'
                    ? 'Failed'
                    : NOT_REACHED_DETAIL_PART1;

        const verificationDetails = verificationFromEvents(def.key, input.events ?? {}, gate);
        if (gate === 'passed' && !passedRequiresEvidence(status, verificationDetails)) {
            status = 'Failed';
            outcomeDetail = 'Passed outcome without feature-specific verification evidence';
        }

        const durationMs = input.caseDurationsMs?.[def.key];
        const durationSeconds =
            typeof durationMs === 'number' && durationMs >= 0
                ? Math.round((durationMs / 1000) * 1000) / 1000
                : 0;

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

    const finalCases = input.markDerived
        ? cases.map((c) => applyDerivedPassedCopy(c, true))
        : cases;

    return {
        schemaVersion: 2,
        smokePart: 1,
        junitTestcase: { name: 'fullE2ESmokePart1', classname: 'e2e/fullE2ESmokePart1.spec.ts' },
        flowCaseKeys: [...PART1_FLOW_CASE_KEYS],
        deferredCaseKeys: [...PART1_DEFERRED_CASE_KEYS],
        cases: finalCases,
        artifacts: [],
        derived: Boolean(input.markDerived),
        note: 'Part 1 feature cases map to fullE2ESmokePart1 flow boundaries for TestMo submit.',
    };
}

export function buildPart1CoverageFromSystemOut(systemOut, { markDerived = false } = {}) {
    const events = parsePart1ConsoleEvents(systemOut);
    if (events.PART1_TESTMO_COVERAGE) {
        const embedded = events.PART1_TESTMO_COVERAGE;
        const cases = enrichPart1CaseDurations(
            (embedded.cases ?? []).map((c) => ({
                ...c,
                verificationDetails:
                    c.verificationDetails ??
                    verificationFromEvents(
                        c.key,
                        events,
                        c.status === 'Passed' ? 'passed' : c.status === 'Failed' ? 'failed' : 'not_reached'
                    ),
            })),
            embedded.caseDurationsMs
        );
        return {
            ...embedded,
            derived: false,
            cases,
        };
    }

    const failed = events.PART1_RUN_FAILED;
    const completed = events.PART1_RUN_COMPLETED;
    const coverageFailed = events.PART1_TESTMO_COVERAGE_FAILED;
    const outcomes =
        coverageFailed?.featureOutcomes ??
        failed?.featureOutcomes ??
        completed?.featureOutcomes ??
        null;
    if (!outcomes) {
        return null;
    }

    return buildPart1TestmoCoverageFromEvents({
        featureOutcomes: outcomes,
        failureReason:
            coverageFailed?.failureReason ?? failed?.failureReason ?? failed?.failureMessage ?? null,
        caseDurationsMs: coverageFailed?.caseDurationsMs ?? completed?.caseDurationsMs,
        events,
        markDerived: markDerived || !events.PART1_TESTMO_COVERAGE,
    });
}

export function rebuildPart1CoverageFromFeatureSubmitXml(xml) {
    const cases = [];
    const re =
        /<testcase\b[^>]*name="([^"]+)"[^>]*classname="e2e\/part1SmokeTestmoFeature\.spec\.ts"[^>]*>[\s\S]*?<system-out>([\s\S]*?)<\/system-out>/g;
    let match;
    while ((match = re.exec(xml)) !== null) {
        const automationKey = match[1];
        const out = match[2].replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
        const line = out
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l.startsWith('TESTMO_PART1_FEATURE '));
        if (!line) {
            continue;
        }
        try {
            const payload = JSON.parse(line.slice('TESTMO_PART1_FEATURE '.length));
            cases.push({
                key: payload.key,
                automationKey: payload.automationKey ?? automationKey,
                title: payload.title,
                status: payload.status,
                outcomeDetail: payload.outcomeDetail,
                verificationDetails: payload.verificationDetails,
                durationSeconds: payload.durationSeconds ?? 0,
            });
        } catch {
            /* ignore */
        }
    }
    if (!cases.length) {
        return null;
    }
    return {
        schemaVersion: 2,
        smokePart: 1,
        cases,
        derived: false,
        artifacts: [],
        note: 'Rebuilt from feature-only submit JUnit',
    };
}