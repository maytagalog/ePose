import { test, type TestInfo } from '@playwright/test';
import type { AnalysisReportFullRunEvidence } from '../analysisReport/smoke/analysisReportFullReporting';
import { runPart2AnalysisReportPhase } from './shared/part2AnalysisReportHandoff';
import {
    cirsEvidenceAttachmentBody,
    runCirsRecordCreationAndListNavigation,
    type CirsRecordContext,
    type CirsRecordRunEvidence,
} from '../CIRS/cirsRecord/cirsRecordFlow';
import { runLimitDialogFlowAfterLogin } from '../limitDialog/limitDialogFlow';
import {
    loginExistingUserForPart2,
    resolvePart2LoginAccount,
} from '../login/existingUserLoginFlow';
import {
    logoutEvidenceAttachmentBody,
    runLogoutAndVerify,
    type LogoutRunEvidence,
} from '../logout/logoutFlow';
import {
    responseDetailsEvidenceAttachmentBody,
    runCirsResponseDetailsFlow,
    type CirsResponseDetailsRunResult,
} from '../CIRS/responseDetails/responseDetailsFlow';
import {
    handwrittenNotesEvidenceAttachmentBody,
    runCirsHandwrittenNoteDeleteFlow,
    runCirsHandwrittenNoteUpdateFlow,
    runCirsHandwrittenNotesFlow,
    type HandwrittenNotesRunResult,
} from '../CIRS/handwrittenNotes/handwrittenNotesFlow';
import type { HandwrittenNotesRunEvidence } from '../CIRS/handwrittenNotes/handwrittenNotesReporting';
import type { TakeoverRunEvidence } from '../CIRS/takeover/takeoverReporting';
import {
    runCirsTakeoverCrudFlow,
    takeoverEvidenceAttachmentBody,
    type TakeoverCrudRunResult,
} from '../CIRS/takeover/takeoverFlow';
import type { PostureAnalysisRunEvidence } from '../CIRS/postureAnalysis/postureAnalysisReporting';
import {
    postureAnalysisEvidenceAttachmentBody,
    runCirsPostureAnalysisNavigationFlow,
    type PostureAnalysisNavigationResult,
} from '../CIRS/postureAnalysis/postureAnalysisFlow';
import { SmokePart2RunTracker, sanitizeFailureReason } from './shared/smokePart2Reporting';
import { attachSmokePageDiagnostics } from './shared/smokePageDiagnostics';
import { persistSmokeEvidenceJson } from './shared/smokeEvidencePersistence';
import { logPart2TestmoCoverage } from './shared/part2TestmoReporting';
import {
    attachPart2ComparisonReportEvidence,
    type Part2ComparisonReportRunEvidence,
} from './shared/part2ComparisonReportReporting';
import { runPart2ComparisonReportPhase } from './shared/part2ComparisonReportPhase';

/**
 * Full E2E smoke Part 2 (existing account).
 *
 * Coverage: Login → Limit Dialog → CIRS → Analysis Report (view through history; deletion off) →
 * Comparison Report (view, QR, email, PDF, exit) → Logout.
 *
 * Side effect: each successful run creates one interaction record, one handwritten note (deleted at end),
 * and one handover note (deleted at end) on staging.
 *
 * Independent of Part 1 account allocation, state files, and execution order.
 * Uses dedicated credentials from tests/e2e/shared/smokePart2Config.ts only.
 *
 * Structured console lines (PART2_*, CIRS_RECORD_*, CIRS_RESPONSE_DETAILS_*, CIRS_HANDWRITTEN_*, CIRS_TAKEOVER_*)
 * in JUnit <system-out>.
 *
 * Run: npm run pw:part2
 */
test.describe.configure({ retries: 0 });
test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure' });

async function attachCirsEvidence(
    testInfo: TestInfo,
    payload: CirsRecordContext | CirsRecordRunEvidence
): Promise<void> {
    try {
        await testInfo.attach('cirs-record-context', {
            body: cirsEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

async function attachResponseDetailsEvidence(
    testInfo: TestInfo,
    payload: CirsResponseDetailsRunResult
): Promise<void> {
    try {
        await testInfo.attach('cirs-response-details', {
            body: responseDetailsEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

async function attachHandwrittenEvidence(
    testInfo: TestInfo,
    payload: HandwrittenNotesRunResult
): Promise<void> {
    try {
        await testInfo.attach('cirs-handwritten-notes', {
            body: handwrittenNotesEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

async function attachTakeoverEvidence(
    testInfo: TestInfo,
    payload: TakeoverCrudRunResult | TakeoverRunEvidence | Record<string, unknown>
): Promise<void> {
    try {
        await testInfo.attach('cirs-takeover-crud', {
            body: takeoverEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

async function attachPostureAnalysisEvidence(
    testInfo: TestInfo,
    payload: PostureAnalysisNavigationResult | PostureAnalysisRunEvidence | Record<string, unknown>
): Promise<void> {
    try {
        await testInfo.attach('cirs-posture-analysis-navigation', {
            body: postureAnalysisEvidenceAttachmentBody(payload),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

async function attachLogoutEvidence(testInfo: TestInfo, evidence: LogoutRunEvidence): Promise<void> {
    try {
        await testInfo.attach('logout-evidence', {
            body: logoutEvidenceAttachmentBody(evidence),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

async function attachAnalysisReportEvidence(
    testInfo: TestInfo,
    evidence: AnalysisReportFullRunEvidence | null
): Promise<void> {
    if (!evidence) {
        return;
    }
    try {
        await testInfo.attach('analysis-report-full-run', {
            body: JSON.stringify(evidence, null, 2),
            contentType: 'application/json',
        });
    } catch {
        /* Do not mask the original failure. */
    }
}

test('fullE2ESmokePart2', async ({ page, browser }, testInfo) => {
    test.setTimeout(900000);

    const account = resolvePart2LoginAccount();
    const report = new SmokePart2RunTracker(account.email);
    const pageDiagnostics = attachSmokePageDiagnostics(page);
    let cirsRecordContext: CirsRecordContext | null = null;
    let latestCirsEvidence: CirsRecordRunEvidence | null = null;
    let latestResponseDetails: CirsResponseDetailsRunResult | null = null;
    let latestHandwrittenEvidence: HandwrittenNotesRunEvidence | null = null;
    let latestHandwrittenResult: HandwrittenNotesRunResult | null = null;
    let latestTakeoverEvidence: TakeoverRunEvidence | null = null;
    let latestTakeoverResult: TakeoverCrudRunResult | null = null;
    let latestPostureAnalysisEvidence: PostureAnalysisRunEvidence | null = null;
    let latestPostureAnalysisResult: PostureAnalysisNavigationResult | null = null;
    let latestLogoutEvidence: LogoutRunEvidence | null = null;
    let latestAnalysisReportEvidence: AnalysisReportFullRunEvidence | null = null;
    let latestComparisonReportEvidence: Part2ComparisonReportRunEvidence | null = null;

    report.logRunStarted();

    try {
        report.stepStarted('login existing account');
        const loginReadiness = await test.step('login existing account', async () => {
            return loginExistingUserForPart2(page, account);
        });
        report.logLoginVerified(loginReadiness);
        report.stepCompleted('login existing account');

        report.stepStarted('limit dialog checks');
        const limitResult = await test.step('limit dialog checks', async () => {
            return runLimitDialogFlowAfterLogin(page, account, loginReadiness, {
                authProfileBody: loginReadiness.authProfile ?? null,
            });
        });
        report.logLimitDialogVerified(limitResult);
        report.stepCompleted('limit dialog checks');

        report.stepStarted('cirs record creation and list navigation');
        try {
            cirsRecordContext = await test.step('cirs record creation and list navigation', async () => {
                return runCirsRecordCreationAndListNavigation(page, {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestCirsEvidence = evidence;
                    },
                });
            });
            report.logCirsRecordNavigationVerified(cirsRecordContext);
            report.stepCompleted('cirs record creation and list navigation');
            await attachCirsEvidence(testInfo, cirsRecordContext);
        } catch (error) {
            if (latestCirsEvidence) {
                await attachCirsEvidence(testInfo, latestCirsEvidence);
            }
            throw error;
        }

        if (!cirsRecordContext) {
            throw new Error('CIRS record context missing after navigation step.');
        }

        report.stepStarted('cirs response details');
        try {
            latestResponseDetails = await test.step('cirs response details', async () => {
                const load = cirsRecordContext!.responseDetailLoad;
                if (!load) {
                    throw new Error(
                        'Missing responseDetailLoad on CIRS record context; capture response_detail before reopen.'
                    );
                }
                return runCirsResponseDetailsFlow(page, cirsRecordContext!, {
                    accountEmail: account.email,
                    responseDetailLoad: load,
                });
            });
            report.logCirsResponseDetailsVerified(latestResponseDetails);
            report.stepCompleted('cirs response details');
            await attachResponseDetailsEvidence(testInfo, latestResponseDetails);
        } catch (error) {
            if (latestResponseDetails) {
                await attachResponseDetailsEvidence(testInfo, latestResponseDetails);
            }
            throw error;
        }

        report.stepStarted('cirs handwritten note creation');
        try {
            latestHandwrittenResult = await test.step('cirs handwritten note creation', async () => {
                return runCirsHandwrittenNotesFlow(page, cirsRecordContext!, {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestHandwrittenEvidence = evidence;
                    },
                });
            });
            report.logCirsHandwrittenCreateVerified(latestHandwrittenResult);
            await attachHandwrittenEvidence(testInfo, latestHandwrittenResult);

            if (!latestHandwrittenResult.noteId) {
                throw new Error(
                    'Handwritten note update requires a created noteId from save_memo identity capture.'
                );
            }

            report.stepStarted('cirs handwritten note update');
            const updateResult = await test.step('cirs handwritten note update', async () => {
                return runCirsHandwrittenNoteUpdateFlow(page, {
                    customerId: latestHandwrittenResult!.customerId,
                    recordId: latestHandwrittenResult!.recordId,
                    noteId: latestHandwrittenResult!.noteId!,
                }, {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestHandwrittenEvidence = evidence;
                    },
                });
            });
            report.logCirsHandwrittenUpdateVerified({
                ...latestHandwrittenResult,
                updateAttempted: updateResult.updateAttempted,
                updateVerified: updateResult.updateVerified,
            });

            report.stepStarted('cirs handwritten note delete');
            const deleteResult = await test.step('cirs handwritten note delete', async () => {
                return runCirsHandwrittenNoteDeleteFlow(page, {
                    customerId: latestHandwrittenResult!.customerId,
                    recordId: latestHandwrittenResult!.recordId,
                    noteId: latestHandwrittenResult!.noteId!,
                }, {
                    accountEmail: account.email,
                    onEvidence: (evidence) => {
                        latestHandwrittenEvidence = evidence;
                    },
                });
            });
            report.logCirsHandwrittenDeleteVerified({
                ...latestHandwrittenResult,
                updateAttempted: updateResult.updateAttempted,
                updateVerified: updateResult.updateVerified,
                deleteAttempted: deleteResult.deleteAttempted,
                deleteServerConfirmed: deleteResult.deleteServerConfirmed,
                deleteVerified: deleteResult.deleteVerified,
                noteRetainedOnStaging: deleteResult.noteRetainedOnStaging,
            });
            latestHandwrittenResult = {
                ...latestHandwrittenResult,
                updateVerified: updateResult.updateVerified,
                deleteVerified: deleteResult.deleteVerified,
                noteRetainedOnStaging: deleteResult.noteRetainedOnStaging,
            };
            await attachHandwrittenEvidence(testInfo, latestHandwrittenResult);
        } catch (error) {
            const partialHandwritten = latestHandwrittenEvidence;
            if (partialHandwritten) {
                try {
                    await testInfo.attach('cirs-handwritten-notes', {
                        body: handwrittenNotesEvidenceAttachmentBody(partialHandwritten),
                        contentType: 'application/json',
                    });
                } catch {
                    /* Do not mask the original failure. */
                }
            }
            throw error;
        }

        report.stepStarted('cirs takeover handover CRUD');
        try {
            latestTakeoverResult = await test.step('cirs takeover handover CRUD', async () => {
                return runCirsTakeoverCrudFlow(
                    page,
                    {
                        customerId: cirsRecordContext!.customerId,
                        recordId: cirsRecordContext!.recordId,
                    },
                    {
                        accountEmail: account.email,
                        onEvidence: (evidence) => {
                            latestTakeoverEvidence = evidence;
                        },
                    }
                );
            });
            report.logCirsTakeoverCrudVerified({
                customerId: latestTakeoverResult.customerId,
                recordId: latestTakeoverResult.recordId,
                handoverId: latestTakeoverResult.handoverId,
                createVerified: latestTakeoverResult.createVerified,
                readVerified: latestTakeoverResult.readVerified,
                updateVerified: latestTakeoverResult.updateVerified,
                deleteVerified: latestTakeoverResult.deleteVerified,
                handoverRetainedOnStaging: latestTakeoverResult.handoverRetainedOnStaging,
            });
            await attachTakeoverEvidence(testInfo, latestTakeoverResult);
        } catch (error) {
            if (latestTakeoverEvidence) {
                await attachTakeoverEvidence(testInfo, latestTakeoverEvidence);
            } else if (latestTakeoverResult) {
                await attachTakeoverEvidence(testInfo, latestTakeoverResult);
            }
            throw error;
        }

        report.stepStarted('cirs posture analysis navigation');
        try {
            latestPostureAnalysisResult = await test.step('cirs posture analysis navigation', async () => {
                return runCirsPostureAnalysisNavigationFlow(
                    page,
                    {
                        customerId: cirsRecordContext!.customerId,
                        recordId: cirsRecordContext!.recordId,
                        customerName: cirsRecordContext!.customerName,
                        customerFurigana: cirsRecordContext!.customerFurigana,
                    },
                    {
                        accountEmail: account.email,
                        endState: 'analysis_report_list_handoff',
                        onEvidence: (evidence) => {
                            latestPostureAnalysisEvidence = evidence;
                        },
                    }
                );
            });
            report.logCirsPostureAnalysisVerified({
                customerId: latestPostureAnalysisResult.customerId,
                recordId: latestPostureAnalysisResult.recordId,
                analysisId: latestPostureAnalysisResult.analysisId,
                listLoadOutcome: latestPostureAnalysisResult.listLoadOutcome,
                reportOpening: latestPostureAnalysisResult.reportOpening,
                limitDialogVerified: latestPostureAnalysisResult.limitDialogVerified,
                navSummary: latestPostureAnalysisResult.navSummary,
            });
            await attachPostureAnalysisEvidence(testInfo, latestPostureAnalysisResult);
        } catch (error) {
            if (latestPostureAnalysisEvidence) {
                await attachPostureAnalysisEvidence(testInfo, latestPostureAnalysisEvidence);
            } else if (latestPostureAnalysisResult) {
                await attachPostureAnalysisEvidence(testInfo, latestPostureAnalysisResult);
            }
            throw error;
        }

        if (!latestPostureAnalysisResult || !cirsRecordContext) {
            throw new Error('CIRS context missing before Analysis Report handoff.');
        }

        report.stepStarted('analysis report combined smoke');
        try {
            const analysisRun = await test.step('analysis report combined smoke', async () => {
                return runPart2AnalysisReportPhase({
                    page,
                    browser,
                    testInfo,
                    account,
                    identity: {
                        customerId: cirsRecordContext!.customerId,
                        customerName: cirsRecordContext!.customerName ?? null,
                        customerFurigana: cirsRecordContext!.customerFurigana ?? null,
                    },
                    cirsHandoffCatalog: latestPostureAnalysisResult?.customerHistoryCatalog ?? null,
                });
            });
            latestAnalysisReportEvidence = analysisRun.evidence;
            if (analysisRun.primaryError) {
                throw analysisRun.primaryError;
            }
            report.logAnalysisReportVerified({
                sourceCustomerId: analysisRun.evidence.sourceCustomerId,
                sourceAnalysisId: analysisRun.evidence.sourceAnalysisId,
                deletionMode: analysisRun.evidence.deletionMode,
                reportDeletionStage: analysisRun.evidence.featureStages.reportDeletion,
                combinedPassed: analysisRun.evidence.combinedPassed,
                runOutputRoot: analysisRun.evidence.runOutputRoot,
                featureStages: analysisRun.evidence.featureStages,
            });
            await attachAnalysisReportEvidence(testInfo, latestAnalysisReportEvidence);
        } catch (error) {
            if (latestAnalysisReportEvidence) {
                await attachAnalysisReportEvidence(testInfo, latestAnalysisReportEvidence);
            }
            throw error;
        }

        report.stepStarted('comparison report combined smoke');
        try {
            const comparisonRun = await test.step('comparison report combined smoke', async () => {
                return runPart2ComparisonReportPhase({
                    page,
                    browser,
                    testInfo,
                    identity: {
                        customerId: cirsRecordContext!.customerId,
                        customerName: cirsRecordContext!.customerName ?? null,
                    },
                });
            });
            latestComparisonReportEvidence = comparisonRun.evidence;
            await attachPart2ComparisonReportEvidence(testInfo, comparisonRun.evidence);
            if (comparisonRun.primaryError) {
                throw comparisonRun.primaryError;
            }
            report.logComparisonReportVerified({
                customerId: comparisonRun.evidence.customerId,
                returnedSingleReportAnalysisId: comparisonRun.evidence.returnedSingleReportAnalysisId,
                combinedPassed: comparisonRun.evidence.combinedPassed,
                runOutputRoot: comparisonRun.evidence.runOutputRoot,
                featureStages: comparisonRun.evidence.featureStages,
            });
        } catch (error) {
            if (latestComparisonReportEvidence) {
                await attachPart2ComparisonReportEvidence(testInfo, latestComparisonReportEvidence);
            }
            throw error;
        }

        report.stepStarted('logout');
        try {
            await test.step('logout', async () => {
                await runLogoutAndVerify(page, {
                    onEvidence: (evidence) => {
                        latestLogoutEvidence = evidence;
                    },
                });
            });
            if (!latestLogoutEvidence) {
                throw new Error('Logout completed without captured evidence.');
            }
            report.logLogoutVerified(latestLogoutEvidence);
            report.stepCompleted('logout');
        } catch (error) {
            if (latestLogoutEvidence) {
                await attachLogoutEvidence(testInfo, latestLogoutEvidence);
            }
            const png = await page.screenshot({ fullPage: true }).catch(() => null);
            if (png) {
                await testInfo.attach('logout-failure-screenshot', {
                    body: png,
                    contentType: 'image/png',
                }).catch(() => {});
            }
            throw error;
        }

        logPart2TestmoCoverage({
            featureOutcomes: { ...report.outcomes },
            caseDurationsMs: report.getCaseDurationsMs(),
            analysisReport: latestAnalysisReportEvidence,
            comparisonReport: latestComparisonReportEvidence,
            playwrightAttachments: testInfo.attachments.map((a) => a.name),
        });
        report.logRunCompleted(page.url());
    } catch (error) {
        logPart2TestmoCoverage({
            featureOutcomes: { ...report.outcomes },
            caseDurationsMs: report.getCaseDurationsMs(),
            failureReason: sanitizeFailureReason(error),
            analysisReport: latestAnalysisReportEvidence,
            comparisonReport: latestComparisonReportEvidence,
            playwrightAttachments: testInfo.attachments.map((a) => a.name),
        });
        report.logRunFailed(error, page.url());
        throw error;
    } finally {
        pageDiagnostics.logSnapshot('part2-finally');
        pageDiagnostics.detach();
        persistSmokeEvidenceJson('part2-smoke-run-summary.json', {
            smokePart: 2,
            smokeRunId: process.env.EPOSE_SMOKE_RUN_ID ?? null,
            accountEmail: account.email,
            featureOutcomes: { ...report.outcomes },
            analysisReport: latestAnalysisReportEvidence,
            comparisonReport: latestComparisonReportEvidence,
            pageDiagnostics: pageDiagnostics.snapshot(),
            finalUrl: page.url(),
        });
        if (latestAnalysisReportEvidence) {
            persistSmokeEvidenceJson('part2-analysis-report-full-run.json', latestAnalysisReportEvidence);
        }
        if (latestComparisonReportEvidence) {
            persistSmokeEvidenceJson('part2-comparison-report-run.json', latestComparisonReportEvidence);
        }
    }
});
