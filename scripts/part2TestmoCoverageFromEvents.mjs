import {
    AR_FEATURE_TO_CASE,
    FEATURE_TO_CASE_KEY,
    NOT_REACHED_DETAIL,
    PART2_TESTMO_CASE_DEFINITIONS,
    PASSED_OUTCOME_ONLY_DETAIL,
    UNKNOWN_DETAIL,
} from './part2TestmoConstants.mjs';
import { enrichPart2CaseDurations, msToDurationSeconds } from './testmoFeatureTiming.mjs';

const ANALYSIS_REPORT_CASE_KEYS = new Set(
    Object.values(AR_FEATURE_TO_CASE).filter(Boolean)
);

const EVENT_LINE = /^([A-Z0-9_]+) (\{[\s\S]*\})\s*$/;

export function parsePart2ConsoleEvents(systemOut) {
    const events = {};
    if (!systemOut) {
        return events;
    }
    const text = systemOut.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line.startsWith('PART2_')) {
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

function arStageToStatus(stage, featureGate) {
    if (featureGate === 'not_reached') {
        return { status: 'Skipped', detail: NOT_REACHED_DETAIL };
    }
    if (stage === 'Passed') {
        return { status: 'Passed', detail: 'Required verifications completed' };
    }
    if (stage === 'Skipped') {
        return { status: 'Skipped', detail: 'Explicitly skipped for this run' };
    }
    if (stage === 'Failed') {
        return { status: 'Failed', detail: 'Feature stage failed' };
    }
    if (stage === 'Not reached') {
        return { status: 'Skipped', detail: NOT_REACHED_DETAIL };
    }
    if (featureGate === 'failed') {
        return { status: 'Skipped', detail: NOT_REACHED_DETAIL };
    }
    return { status: 'Skipped', detail: UNKNOWN_DETAIL };
}

function verificationFromEvents(key, events, featureOutcome) {
    const map = {
        login: events.PART2_LOGIN_VERIFIED,
        limitDialog: events.PART2_LIMIT_DIALOG_VERIFIED,
        cirsRecordNavigation: events.PART2_CIRS_RECORD_NAVIGATION_VERIFIED,
        cirsResponseDetails: events.PART2_CIRS_RESPONSE_DETAILS_VERIFIED,
        cirsHandwrittenNotes: {
            create: events.PART2_CIRS_HANDWRITTEN_CREATE_VERIFIED,
            update: events.PART2_CIRS_HANDWRITTEN_UPDATE_VERIFIED,
            delete: events.PART2_CIRS_HANDWRITTEN_DELETE_VERIFIED,
        },
        cirsTakeoverHandover: events.PART2_CIRS_TAKEOVER_CRUD_VERIFIED,
        cirsPostureAnalysisListHandoff: events.PART2_CIRS_POSTURE_ANALYSIS_NAVIGATION_VERIFIED,
        logout: events.PART2_LOGOUT_VERIFIED,
        analysisReportView: events.PART2_ANALYSIS_REPORT_VERIFIED,
    };
    const raw = map[key];
    if (key === 'cirsHandwrittenNotes' && typeof raw === 'object') {
        if (!raw.create && !raw.update && !raw.delete) {
            return featureOutcome === 'passed'
                ? { evidenceStatus: 'unknown', note: PASSED_OUTCOME_ONLY_DETAIL }
                : undefined;
        }
        return raw;
    }
    if (!raw) {
        if (featureOutcome === 'passed') {
            return { evidenceStatus: 'unknown', note: PASSED_OUTCOME_ONLY_DETAIL };
        }
        return undefined;
    }
    return raw;
}

function applyDerivedPassedCopy(caseResult, markDerived) {
    if (!markDerived || caseResult.status !== 'Passed') {
        return caseResult;
    }
    const unknownEvidence =
        caseResult.verificationDetails?.evidenceStatus === 'unknown' ||
        (caseResult.verificationDetails &&
            typeof caseResult.verificationDetails === 'object' &&
            !Object.values(caseResult.verificationDetails).some(Boolean));
    if (unknownEvidence) {
        return { ...caseResult, outcomeDetail: PASSED_OUTCOME_ONLY_DETAIL };
    }
    return caseResult;
}

function sanitizeFailureReason(message) {
    return String(message ?? '').slice(0, 500);
}

/**
 * @param {object} input
 * @param {Record<string, string>} input.featureOutcomes
 * @param {string | null | undefined} input.failureReason
 * @param {object | null | undefined} input.analysisReport
 * @param {Record<string, number>} [input.caseDurationsMs]
 * @param {string} [input.systemOut]
 * @param {boolean} [input.markDerived]
 */
export function buildPart2TestmoCoverageFromEvents(input) {
    const failureDetail = input.failureReason?.trim()
        ? `Failure: ${sanitizeFailureReason(input.failureReason)}`
        : null;

    const cases = [];
    const arGate = input.featureOutcomes?.analysisReport ?? 'not_reached';
    const stages = input.analysisReport?.featureStages;

    for (const def of PART2_TESTMO_CASE_DEFINITIONS) {
        if (def.key === 'cirsRecordDeletion') {
            continue;
        }

        if (ANALYSIS_REPORT_CASE_KEYS.has(def.key)) {
            if (!stages) {
                cases.push({
                    key: def.key,
                    automationKey: def.automationKey,
                    title: def.title,
                    status: 'Skipped',
                    outcomeDetail: arGate === 'not_reached' ? NOT_REACHED_DETAIL : UNKNOWN_DETAIL,
                });
                continue;
            }
            if (def.key === 'analysisReportView') {
                const view = arStageToStatus(stages.reportView, arGate);
                let status = view.status;
                let outcomeDetail =
                    status === 'Failed' && failureDetail ? failureDetail : view.detail;
                if (arGate === 'passed' && stages.reportView !== 'Passed') {
                    status = 'Failed';
                    outcomeDetail = failureDetail ?? 'Analysis Report view stage not Passed';
                }
                cases.push({
                    key: def.key,
                    automationKey: def.automationKey,
                    title: def.title,
                    status,
                    outcomeDetail,
                    verificationDetails: eventsSliceForAr(input.analysisReport, def.key),
                });
                continue;
            }
            const arFeature = Object.entries(AR_FEATURE_TO_CASE).find(([, ck]) => ck === def.key)?.[0];
            if (!arFeature) {
                continue;
            }
            const mapped = arStageToStatus(stages[arFeature], arGate);
            let detail = mapped.status === 'Failed' && failureDetail ? failureDetail : mapped.detail;
            if (arFeature === 'reportDeletion' && stages.reportDeletion === 'Skipped') {
                detail =
                    input.analysisReport?.deletionMode === 'off'
                        ? 'Deletion mode off (no plan/reservation)'
                        : detail;
            }
            if (arFeature === 'reportDeletion' && stages.reportDeletion === 'Passed') {
                detail = 'ui-confirmation-and-customer-list-redirect';
            }
            if (arFeature === 'reportPdf' && stages.reportPdf === 'Skipped') {
                const reason =
                    input.analysisReport?.reportPdf?.pdfGenerationSkipReason ??
                    input.analysisReport?.reportPdf?.pdfExecutionContextNote;
                if (reason) {
                    detail = `Skipped: ${String(reason).slice(0, 300)}`;
                }
                mapped.status = 'Skipped';
                mapped.detail = detail;
            }
            cases.push({
                key: def.key,
                automationKey: def.automationKey,
                title: def.title,
                status: mapped.status,
                outcomeDetail: detail,
                verificationDetails: eventsSliceForAr(input.analysisReport, def.key),
            });
            continue;
        }

        const featureKey = Object.entries(FEATURE_TO_CASE_KEY).find(([, ck]) => ck === def.key)?.[0];
        const gate = featureKey ? input.featureOutcomes?.[featureKey] ?? 'not_reached' : 'not_reached';
        const status = outcomeToStatus(gate);
        const outcomeDetail =
            gate === 'passed'
                ? 'Required verifications completed'
                : gate === 'failed' && failureDetail
                  ? failureDetail
                  : gate === 'failed'
                    ? 'Failed'
                    : NOT_REACHED_DETAIL;

        cases.push({
            key: def.key,
            automationKey: def.automationKey,
            title: def.title,
            status,
            outcomeDetail,
            verificationDetails: verificationFromEvents(def.key, input.events ?? {}, gate),
        });
    }

    cases.push({
        key: 'cirsRecordDeletion',
        automationKey: 'part2-smoke-cirs-record-deletion',
        title: 'CIRS record deletion',
        status: 'Skipped',
        outcomeDetail: 'explicitly out of Part 2 smoke scope',
    });

    const finalCases = input.markDerived
        ? cases.map((c) => applyDerivedPassedCopy(c, true))
        : cases;

    const withDurations = enrichPart2CaseDurations(finalCases, {
        caseDurationsMs: input.caseDurationsMs,
        systemOut: input.systemOut ?? null,
    }).map((caseResult) => ({
        ...caseResult,
        durationSeconds:
            caseResult.durationSeconds ??
            msToDurationSeconds(input.caseDurationsMs?.[caseResult.key] ?? 0),
    }));

    return {
        schemaVersion: 2,
        smokePart: 2,
        junitTestcase: { name: 'fullE2ESmokePart2', classname: 'e2e/fullE2ESmokePart2.spec.ts' },
        cases: withDurations,
        caseDurationsMs: input.caseDurationsMs ? { ...input.caseDurationsMs } : undefined,
        excluded: [{ key: 'cirsRecordDeletion', reason: 'explicitly out of Part 2 smoke scope' }],
        artifacts: [],
        derived: Boolean(input.markDerived),
        note: 'Feature cases are emitted as separate JUnit testcases at Testmo submit time.',
    };
}

function eventsSliceForAr(analysisReport, caseKey) {
    if (!analysisReport) {
        return { evidenceStatus: 'unknown', note: UNKNOWN_DETAIL };
    }
    if (caseKey === 'analysisReportView') {
        return {
            featureStages: analysisReport.featureStages,
            samePageHandoff: analysisReport.samePageHandoff,
            runOutputRoot: analysisReport.runOutputRoot,
        };
    }
    const stageKey = Object.entries(AR_FEATURE_TO_CASE).find(([, ck]) => ck === caseKey)?.[0];
    if (!stageKey) {
        return undefined;
    }
    return {
        stage: analysisReport.featureStages?.[stageKey],
        runOutputRoot: analysisReport.runOutputRoot,
    };
}

export function rebuildPart2CoverageFromFeatureSubmitXml(xml) {
    const cases = [];
    const re =
        /<testcase\b[^>]*name="([^"]+)"[^>]*classname="e2e\/part2SmokeTestmoFeature\.spec\.ts"[^>]*>[\s\S]*?<system-out>([\s\S]*?)<\/system-out>/g;
    let match;
    while ((match = re.exec(xml)) !== null) {
        const automationKey = match[1];
        const out = match[2].replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1');
        const line = out
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l.startsWith('TESTMO_PART2_FEATURE '));
        if (!line) {
            continue;
        }
        try {
            const payload = JSON.parse(line.slice('TESTMO_PART2_FEATURE '.length));
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
        smokePart: 2,
        cases,
        derived: false,
        artifacts: [],
        note: 'Rebuilt from feature-only submit JUnit',
    };
}

export function buildPart2CoverageFromSystemOut(systemOut, { markDerived = false } = {}) {
    const events = parsePart2ConsoleEvents(systemOut);
    if (events.PART2_TESTMO_COVERAGE) {
        const embedded = events.PART2_TESTMO_COVERAGE;
        const cases = enrichPart2CaseDurations(
            (embedded.cases ?? []).map((c) => ({
                ...c,
                verificationDetails:
                    c.verificationDetails ??
                    verificationFromEvents(c.key, events, c.status === 'Passed' ? 'passed' : 'failed'),
            })),
            { caseDurationsMs: embedded.caseDurationsMs, systemOut }
        );
        return {
            ...embedded,
            derived: false,
            cases,
        };
    }
    const failed = events.PART2_RUN_FAILED;
    const completed = events.PART2_RUN_COMPLETED;
    const arVerified = events.PART2_ANALYSIS_REPORT_VERIFIED;
    const outcomes = failed?.featureOutcomes ?? completed?.featureOutcomes;
    if (!outcomes) {
        return null;
    }
    return buildPart2TestmoCoverageFromEvents({
        featureOutcomes: outcomes,
        failureReason: failed?.failureReason ?? null,
        caseDurationsMs: failed?.caseDurationsMs ?? completed?.caseDurationsMs,
        systemOut,
        analysisReport: arVerified
            ? {
                  featureStages: arVerified.featureStages,
                  deletionMode: arVerified.deletionMode ?? 'off',
                  combinedPassed: Boolean(arVerified.combinedPassed),
                  runOutputRoot: arVerified.runOutputRoot ?? '',
                  samePageHandoff: arVerified.samePageHandoff,
                  reportPdf: arVerified.reportPdf ?? null,
                  reportDeletion: arVerified.reportDeletion ?? null,
              }
            : null,
        events,
        markDerived,
    });
}
