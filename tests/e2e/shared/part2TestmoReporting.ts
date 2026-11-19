import type { AnalysisReportFullRunEvidence } from '../../analysisReport/smoke/analysisReportFullReporting';
import type { AnalysisReportFullFeature } from '../../analysisReport/smoke/analysisReportFullStageTracker';
import type { Part2ComparisonReportRunEvidence } from './part2ComparisonReportReporting';
import type { Part2ComparisonReportFeature } from './part2ComparisonReportReporting';
import {
    type Part2FeatureOutcome,
    type Part2FeatureOutcomes,
    logPart2SmokeEvent,
    sanitizeFailureReason,
} from './smokePart2Reporting';
import { SHARE_EMAIL_UI_SEND_CONFIRMATION_LABEL } from '../../analysisReport/sharing/email/shareEmailValidationMode';

const PART2_SHARE_EMAIL_PASSED_DETAIL = `${SHARE_EMAIL_UI_SEND_CONFIRMATION_LABEL}. Inbox delivery and guest report verification excluded from this validation mode.`;

/** TestMo-supported status surfaced on each mapped case (Not reached kept in details). */
export type Part2TestmoCaseStatus = 'Passed' | 'Failed' | 'Skipped';

export type Part2TestmoCaseKey =
    | 'login'
    | 'limitDialog'
    | 'cirsRecordNavigation'
    | 'cirsResponseDetails'
    | 'cirsHandwrittenNotes'
    | 'cirsTakeoverHandover'
    | 'cirsPostureAnalysisListHandoff'
    | 'cirsRecordDeletion'
    | 'analysisReportView'
    | 'analysisReportDisplaySettings'
    | 'analysisReportShareQr'
    | 'analysisReportShareEmail'
    | 'analysisReportPdf'
    | 'analysisReportHistory'
    | 'analysisReportDeletion'
    | 'comparisonReportView'
    | 'comparisonShareQr'
    | 'comparisonShareEmail'
    | 'comparisonReportPdf'
    | 'exitComparison'
    | 'logout';

export type Part2TestmoCaseDefinition = {
    key: Part2TestmoCaseKey;
    /** Stable automation identity — matches Testmo case automation keys for Part 2 smoke. */
    automationKey: string;
    title: string;
    coverageArea: 'core' | 'cirs' | 'analysisReport' | 'excluded';
};

/** Preserves existing Testmo case identities; new keys extend the same Part 2 automation bucket. */
export const PART2_TESTMO_CASE_DEFINITIONS: Part2TestmoCaseDefinition[] = [
    {
        key: 'login',
        automationKey: 'part2-smoke-login',
        title: 'Login',
        coverageArea: 'core',
    },
    {
        key: 'limitDialog',
        automationKey: 'part2-smoke-limit-dialog',
        title: 'Limit Dialog',
        coverageArea: 'core',
    },
    {
        key: 'cirsRecordNavigation',
        automationKey: 'part2-smoke-cirs-record-navigation',
        title: 'CIRS record creation and list navigation',
        coverageArea: 'cirs',
    },
    {
        key: 'cirsResponseDetails',
        automationKey: 'part2-smoke-cirs-response-details',
        title: 'CIRS Response Details',
        coverageArea: 'cirs',
    },
    {
        key: 'cirsHandwrittenNotes',
        automationKey: 'part2-smoke-cirs-handwritten-notes',
        title: 'Handwritten note create/read/update/delete',
        coverageArea: 'cirs',
    },
    {
        key: 'cirsTakeoverHandover',
        automationKey: 'part2-smoke-cirs-takeover-handover',
        title: 'Takeover handover create/read/update/delete',
        coverageArea: 'cirs',
    },
    {
        key: 'cirsPostureAnalysisListHandoff',
        automationKey: 'part2-smoke-cirs-posture-list-handoff',
        title: 'CIRS posture analysis (limit dialog, list verification, Analysis Report handoff)',
        coverageArea: 'cirs',
    },
    {
        key: 'cirsRecordDeletion',
        automationKey: 'part2-smoke-cirs-record-deletion',
        title: 'CIRS record deletion',
        coverageArea: 'excluded',
    },
    {
        key: 'analysisReportView',
        automationKey: 'part2-smoke-analysis-report-view',
        title: 'Analysis Report view',
        coverageArea: 'analysisReport',
    },
    {
        key: 'analysisReportDisplaySettings',
        automationKey: 'part2-smoke-analysis-report-display-settings',
        title: 'Analysis Report display settings',
        coverageArea: 'analysisReport',
    },
    {
        key: 'analysisReportShareQr',
        automationKey: 'part2-smoke-analysis-report-share-qr',
        title: 'Analysis Report QR sharing',
        coverageArea: 'analysisReport',
    },
    {
        key: 'analysisReportShareEmail',
        automationKey: 'part2-smoke-analysis-report-share-email',
        title: 'Share email — UI send confirmation (Analysis Report)',
        coverageArea: 'analysisReport',
    },
    {
        key: 'analysisReportPdf',
        automationKey: 'part2-smoke-analysis-report-pdf',
        title: 'A4 PDF generation and validation',
        coverageArea: 'analysisReport',
    },
    {
        key: 'analysisReportHistory',
        automationKey: 'part2-smoke-analysis-report-history',
        title: 'Ellipsis Report History',
        coverageArea: 'analysisReport',
    },
    {
        key: 'analysisReportDeletion',
        automationKey: 'part2-smoke-analysis-report-deletion',
        title: 'Analysis Report deletion (simplified UI confirm + customer list redirect)',
        coverageArea: 'analysisReport',
    },
    {
        key: 'comparisonReportView',
        automationKey: 'part2-smoke-comparison-report-view',
        title: 'Comparison Report view and report switch',
        coverageArea: 'analysisReport',
    },
    {
        key: 'comparisonShareQr',
        automationKey: 'part2-smoke-comparison-share-qr',
        title: 'Comparison Report QR sharing',
        coverageArea: 'analysisReport',
    },
    {
        key: 'comparisonShareEmail',
        automationKey: 'part2-smoke-comparison-share-email',
        title: 'Share email — UI send confirmation (Comparison Report)',
        coverageArea: 'analysisReport',
    },
    {
        key: 'comparisonReportPdf',
        automationKey: 'part2-smoke-comparison-report-pdf',
        title: 'Comparison A4 PDF save and validation',
        coverageArea: 'analysisReport',
    },
    {
        key: 'exitComparison',
        automationKey: 'part2-smoke-exit-comparison',
        title: 'Exit comparison to single Analysis Report',
        coverageArea: 'analysisReport',
    },
    {
        key: 'logout',
        automationKey: 'part2-smoke-logout',
        title: 'Logout',
        coverageArea: 'core',
    },
];

const FEATURE_TO_CASE_KEY: Record<keyof Part2FeatureOutcomes, Part2TestmoCaseKey> = {
    login: 'login',
    limitDialog: 'limitDialog',
    cirsRecordNavigation: 'cirsRecordNavigation',
    cirsResponseDetails: 'cirsResponseDetails',
    cirsHandwrittenNotes: 'cirsHandwrittenNotes',
    cirsTakeoverHandover: 'cirsTakeoverHandover',
    cirsPostureAnalysis: 'cirsPostureAnalysisListHandoff',
    analysisReport: 'analysisReportView',
    comparisonReport: 'comparisonReportView',
    logout: 'logout',
};

const COMPARISON_FEATURE_TO_CASE: Record<Part2ComparisonReportFeature, Part2TestmoCaseKey> = {
    customersNavigation: 'comparisonReportView',
    singleReportEntry: 'comparisonReportView',
    comparisonView: 'comparisonReportView',
    comparisonShareQr: 'comparisonShareQr',
    comparisonShareEmail: 'comparisonShareEmail',
    comparisonReportPdf: 'comparisonReportPdf',
    exitComparison: 'exitComparison',
};

const AR_FEATURE_TO_CASE: Record<AnalysisReportFullFeature, Part2TestmoCaseKey | null> = {
    login: null,
    preflight: null,
    reportView: 'analysisReportView',
    displaySettings: 'analysisReportDisplaySettings',
    shareQr: 'analysisReportShareQr',
    shareEmail: 'analysisReportShareEmail',
    reportPdf: 'analysisReportPdf',
    reportHistory: 'analysisReportHistory',
    reportDeletion: 'analysisReportDeletion',
};

export type Part2TestmoCaseResult = {
    key: Part2TestmoCaseKey;
    automationKey: string;
    title: string;
    status: Part2TestmoCaseStatus;
    outcomeDetail: string;
    verificationDetails?: Record<string, unknown>;
    durationSeconds?: number;
};

export type Part2TestmoArtifactRef = {
    kind: string;
    relativePath: string;
    included: boolean;
    reason?: string;
};

export type Part2TestmoCoverageReport = {
    schemaVersion: 2;
    smokePart: 2;
    junitTestcase: { name: 'fullE2ESmokePart2'; classname: 'e2e/fullE2ESmokePart2.spec.ts' };
    caseDurationsMs?: Record<string, number>;
    cases: Part2TestmoCaseResult[];
    excluded: Array<{ key: Part2TestmoCaseKey; reason: string }>;
    artifacts: Part2TestmoArtifactRef[];
    note: string;
};

function msToDurationSeconds(durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return 0;
    }
    return Math.round((durationMs / 1000) * 1000) / 1000;
}

function durationSecondsForCase(
    key: Part2TestmoCaseKey,
    status: Part2TestmoCaseStatus,
    caseDurationsMs?: Record<string, number>
): number {
    const durationMs = caseDurationsMs?.[key];
    if (typeof durationMs !== 'number' || durationMs < 0) {
        return status === 'Passed' || status === 'Failed' ? 0 : 0;
    }
    return msToDurationSeconds(durationMs);
}

export type BuildPart2TestmoCoverageInput = {
    featureOutcomes: Part2FeatureOutcomes;
    caseDurationsMs?: Record<string, number>;
    failureReason?: string | null;
    analysisReport?: Pick<
        AnalysisReportFullRunEvidence,
        'featureStages' | 'deletionMode' | 'combinedPassed' | 'runOutputRoot' | 'reportPdf' | 'reportDeletion'
    > | null;
    comparisonReport?: Pick<
        Part2ComparisonReportRunEvidence,
        'featureStages' | 'combinedPassed' | 'runOutputRoot' | 'reportPdf' | 'exitComparison'
    > | null;
    /** Optional Playwright attachment names from the same invocation (JUnit does not embed files). */
    playwrightAttachments?: string[];
};

const NOT_REACHED_DETAIL = 'Not reached: blocked by earlier Part 2 failure';

function outcomeToTestmoStatus(outcome: Part2FeatureOutcome): Part2TestmoCaseStatus {
    if (outcome === 'passed') {
        return 'Passed';
    }
    if (outcome === 'failed') {
        return 'Failed';
    }
    return 'Skipped';
}

function arStageToTestmoStatus(
    stage: string,
    featureGate: Part2FeatureOutcome
): { status: Part2TestmoCaseStatus; detail: string } {
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
    return { status: 'Skipped', detail: NOT_REACHED_DETAIL };
}

function buildExcludedCirsDeletion(): Part2TestmoCaseResult {
    const def = PART2_TESTMO_CASE_DEFINITIONS.find((d) => d.key === 'cirsRecordDeletion')!;
    return {
        key: def.key,
        automationKey: def.automationKey,
        title: def.title,
        status: 'Skipped',
        outcomeDetail: 'explicitly out of Part 2 smoke scope',
        durationSeconds: 0,
    };
}

function verificationFromEvents(
    key: Part2TestmoCaseKey,
    events: Record<string, unknown>
): Record<string, unknown> | undefined {
    switch (key) {
        case 'cirsHandwrittenNotes':
            return {
                create: events.PART2_CIRS_HANDWRITTEN_CREATE_VERIFIED,
                update: events.PART2_CIRS_HANDWRITTEN_UPDATE_VERIFIED,
                delete: events.PART2_CIRS_HANDWRITTEN_DELETE_VERIFIED,
            };
        case 'cirsPostureAnalysisListHandoff':
            return events.PART2_CIRS_POSTURE_ANALYSIS_NAVIGATION_VERIFIED as Record<string, unknown>;
        case 'limitDialog':
            return events.PART2_LIMIT_DIALOG_VERIFIED as Record<string, unknown>;
        default:
            return undefined;
    }
}

const ANALYSIS_REPORT_CASE_KEYS: Part2TestmoCaseKey[] = [
    'analysisReportView',
    'analysisReportDisplaySettings',
    'analysisReportShareQr',
    'analysisReportShareEmail',
    'analysisReportPdf',
    'analysisReportHistory',
    'analysisReportDeletion',
];

const COMPARISON_REPORT_CASE_KEYS: Part2TestmoCaseKey[] = [
    'comparisonReportView',
    'comparisonShareQr',
    'comparisonShareEmail',
    'comparisonReportPdf',
    'exitComparison',
];

function isAnalysisReportCaseKey(key: Part2TestmoCaseKey): boolean {
    return ANALYSIS_REPORT_CASE_KEYS.includes(key);
}

function isComparisonReportCaseKey(key: Part2TestmoCaseKey): boolean {
    return COMPARISON_REPORT_CASE_KEYS.includes(key);
}

export function buildPart2TestmoCoverageReport(
    input: BuildPart2TestmoCoverageInput
): Part2TestmoCoverageReport {
    const failureDetail = input.failureReason?.trim()
        ? `Failure: ${sanitizeFailureReason(new Error(input.failureReason))}`
        : null;

    const cases: Part2TestmoCaseResult[] = [];
    const arGate = input.featureOutcomes.analysisReport;
    const stages = input.analysisReport?.featureStages;
    const cmpGate = input.featureOutcomes.comparisonReport;
    const cmpStages = input.comparisonReport?.featureStages;

    for (const def of PART2_TESTMO_CASE_DEFINITIONS) {
        if (def.key === 'cirsRecordDeletion') {
            continue;
        }
        if (isComparisonReportCaseKey(def.key)) {
            if (!cmpStages) {
                cases.push({
                    key: def.key,
                    automationKey: def.automationKey,
                    title: def.title,
                    status: 'Skipped',
                    outcomeDetail: NOT_REACHED_DETAIL,
                });
                continue;
            }
            if (def.key === 'comparisonReportView') {
                const viewParts = [
                    cmpStages.customersNavigation,
                    cmpStages.singleReportEntry,
                    cmpStages.comparisonView,
                ];
                const viewFailed = viewParts.some((p) => p === 'Failed');
                const viewPassed = viewParts.every((p) => p === 'Passed');
                let status: Part2TestmoCaseStatus = 'Skipped';
                let outcomeDetail = NOT_REACHED_DETAIL;
                if (cmpGate === 'not_reached') {
                    outcomeDetail = NOT_REACHED_DETAIL;
                } else if (viewFailed || cmpGate === 'failed') {
                    status = 'Failed';
                    outcomeDetail = failureDetail ?? 'Comparison Report view phase not Passed';
                } else if (viewPassed && cmpGate === 'passed') {
                    status = 'Passed';
                    outcomeDetail = 'Required verifications completed';
                }
                cases.push({
                    key: def.key,
                    automationKey: def.automationKey,
                    title: def.title,
                    status,
                    outcomeDetail,
                });
                continue;
            }
            const cmpFeature = (
                Object.entries(COMPARISON_FEATURE_TO_CASE).find(([, ck]) => ck === def.key)?.[0] ??
                null
            ) as Part2ComparisonReportFeature | null;
            if (!cmpFeature) {
                continue;
            }
            const mapped = arStageToTestmoStatus(cmpStages[cmpFeature], cmpGate);
            let detail = mapped.status === 'Failed' && failureDetail ? failureDetail : mapped.detail;
            if (cmpFeature === 'comparisonReportPdf' && cmpStages.comparisonReportPdf === 'Skipped') {
                const reason = input.comparisonReport?.reportPdf?.pdfGenerationSkipReason;
                if (reason) {
                    detail = `Skipped: ${String(reason).slice(0, 300)}`;
                }
            }
            if (cmpFeature === 'exitComparison' && cmpStages.exitComparison === 'Passed') {
                detail = `Returned analysis ${input.comparisonReport?.exitComparison?.returnedAnalysisId ?? 'unknown'}`;
            }
            if (def.key === 'comparisonShareEmail' && mapped.status === 'Passed') {
                detail = PART2_SHARE_EMAIL_PASSED_DETAIL;
            }
            cases.push({
                key: def.key,
                automationKey: def.automationKey,
                title: def.title,
                status: mapped.status,
                outcomeDetail: detail,
            });
            continue;
        }
        if (isAnalysisReportCaseKey(def.key)) {
            if (!stages) {
                cases.push({
                    key: def.key,
                    automationKey: def.automationKey,
                    title: def.title,
                    status: 'Skipped',
                    outcomeDetail: NOT_REACHED_DETAIL,
                });
                continue;
            }
            if (def.key === 'analysisReportView') {
                const view = arStageToTestmoStatus(stages.reportView, arGate);
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
                });
                continue;
            }
            const arFeature = (Object.entries(AR_FEATURE_TO_CASE).find(
                ([, ck]) => ck === def.key
            )?.[0] ?? null) as AnalysisReportFullFeature | null;
            if (!arFeature) {
                continue;
            }
            const mapped = arStageToTestmoStatus(stages[arFeature], arGate);
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
            }
            if (def.key === 'analysisReportShareEmail' && mapped.status === 'Passed') {
                detail = PART2_SHARE_EMAIL_PASSED_DETAIL;
            }
            cases.push({
                key: def.key,
                automationKey: def.automationKey,
                title: def.title,
                status: mapped.status,
                outcomeDetail: detail,
            });
            continue;
        }

        const featureKey = (Object.keys(FEATURE_TO_CASE_KEY) as (keyof Part2FeatureOutcomes)[]).find(
            (k) => FEATURE_TO_CASE_KEY[k] === def.key
        );
        const gate: Part2FeatureOutcome = featureKey
            ? input.featureOutcomes[featureKey]
            : 'not_reached';

        const status = outcomeToTestmoStatus(gate);
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
        });
    }

    cases.push(buildExcludedCirsDeletion());

    const casesWithDurations = cases.map((caseResult) => ({
        ...caseResult,
        durationSeconds:
            caseResult.durationSeconds ??
            durationSecondsForCase(caseResult.key, caseResult.status, input.caseDurationsMs),
    }));

    const artifacts = buildPart2TestmoArtifactRefs(input);

    return {
        schemaVersion: 2,
        smokePart: 2,
        junitTestcase: {
            name: 'fullE2ESmokePart2',
            classname: 'e2e/fullE2ESmokePart2.spec.ts',
        },
        cases: casesWithDurations,
        caseDurationsMs: { ...(input.caseDurationsMs ?? {}) },
        excluded: [
            {
                key: 'cirsRecordDeletion',
                reason: 'explicitly out of Part 2 smoke scope',
            },
        ],
        artifacts,
        note: 'Aggregate JUnit stays one testcase; Testmo submit injects feature testcases by automationKey with verification details.',
    };
}

export function buildPart2TestmoArtifactRefs(
    input: BuildPart2TestmoCoverageInput
): Part2TestmoArtifactRef[] {
    const refs: Part2TestmoArtifactRef[] = [];
    const root = input.analysisReport?.runOutputRoot?.trim();
    if (root) {
        const candidates = [
            { kind: 'analysis-report-full-evidence', relativePath: `${root}/analysis-report-full-smoke.json` },
            { kind: 'analysis-report-pdf', relativePath: `${root}/analysis-report-generated.pdf` },
            { kind: 'junit', relativePath: `${root}/results-analysisReportFull.xml` },
        ];
        for (const c of candidates) {
            refs.push({
                kind: c.kind,
                relativePath: c.relativePath,
                included: false,
                reason: 'Resolve at submit time via part2TestmoArtifacts.mjs (freshness-checked)',
            });
        }
    }
    if (input.playwrightAttachments?.length) {
        for (const name of input.playwrightAttachments) {
            if (/password|token|secret/i.test(name)) {
                continue;
            }
            refs.push({
                kind: 'playwright-attachment-ref',
                relativePath: name,
                included: true,
                reason: 'Playwright attachment name from same run; upload separately in Testmo if required',
            });
        }
    }
    return refs;
}

export function logPart2TestmoCoverage(input: BuildPart2TestmoCoverageInput): Part2TestmoCoverageReport {
    const report = buildPart2TestmoCoverageReport(input);
    logPart2SmokeEvent('PART2_TESTMO_COVERAGE', report as unknown as Record<string, unknown>);
    return report;
}

const EVENT_LINE = /^([A-Z0-9_]+) (\{[\s\S]*\})\s*$/;

export function parsePart2ConsoleEvents(systemOut: string): Record<string, unknown> {
    const events: Record<string, unknown> = {};
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
            events[match[1]!] = JSON.parse(match[2]!);
        } catch {
            /* ignore malformed */
        }
    }
    return events;
}

export function buildPart2TestmoCoverageFromJUnitSystemOut(
    systemOut: string
): Part2TestmoCoverageReport | null {
    const events = parsePart2ConsoleEvents(systemOut);
    if (events.PART2_TESTMO_COVERAGE) {
        return attachVerificationDetailsFromEvents(
            events.PART2_TESTMO_COVERAGE as Part2TestmoCoverageReport,
            events
        );
    }
    const failed = events.PART2_RUN_FAILED as
        | { featureOutcomes?: Part2FeatureOutcomes; failureReason?: string }
        | undefined;
    const completed = events.PART2_RUN_COMPLETED as { featureOutcomes?: Part2FeatureOutcomes } | undefined;
    const arVerified = events.PART2_ANALYSIS_REPORT_VERIFIED as {
        featureStages?: AnalysisReportFullRunEvidence['featureStages'];
        deletionMode?: string;
        combinedPassed?: boolean;
        runOutputRoot?: string;
    };
    const outcomes = failed?.featureOutcomes ?? completed?.featureOutcomes;
    if (!outcomes) {
        return null;
    }
  const report = buildPart2TestmoCoverageReport({
        featureOutcomes: outcomes,
        failureReason: failed?.failureReason ?? null,
        analysisReport: arVerified
            ? {
                  featureStages: arVerified.featureStages!,
                  deletionMode: arVerified.deletionMode ?? 'off',
                  combinedPassed: Boolean(arVerified.combinedPassed),
                  runOutputRoot: arVerified.runOutputRoot ?? '',
                  reportPdf: null,
                  reportDeletion: null,
              }
            : null,
    });
    return attachVerificationDetailsFromEvents(report, events);
}

export function attachVerificationDetailsFromEvents(
    report: Part2TestmoCoverageReport,
    events: Record<string, unknown>
): Part2TestmoCoverageReport {
    return {
        ...report,
        cases: report.cases.map((c) => ({
            ...c,
            verificationDetails: verificationFromEvents(c.key, events) ?? c.verificationDetails,
        })),
    };
}
