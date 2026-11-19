import { AnalysisReportDeletionConfigError } from '../reportDeletion/analysisReportDeletionErrors';
import { resolveAnalysisReportDeletionMode } from '../reportDeletion/analysisReportDeletionConfig';
import { loadDeletionPlan, assertPlanAllowsDeleteOnce } from '../reportDeletion/analysisReportDeletionPlanLedger';
import { resolveAnalysisReportShareEmailSmokeTarget } from '../sharing/email/analysisReportShareEmailSmokeConfig';
import type { ShareEmailValidationMode } from '../sharing/email/shareEmailValidationMode';
import type { AnalysisReportViewInput } from '../reportView/analysisReportViewFlow';

/** Prior failed delete run — do not reuse plan or target; reconcile-only finalization. */
export const ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID = '2ed0b7a8-5bd0-4cd2-a486-9db191f71545';
export const ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_TARGET_ANALYSIS_ID =
    '25190ae1-f5e3-40a8-b284-5a84caefaf35';

export type AnalysisReportFullSmokeConfig = {
    appOrigin: string;
    source: AnalysisReportViewInput;
    /** When set, preflight must pin this analysisId as latest or reject. */
    explicitSourceAnalysisId: string | null;
    sourceLatestTieBreakAnalysisId: string | null;
    shareEmailRecipient: string;
    shareEmailValidationMode: ShareEmailValidationMode;
    deletionMode: 'off' | 'cancel' | 'delete-once';
    deletionCustomerId: string;
    deletionPlanId: string | null;
    deletionTieBreakAnalysisId: string | null;
    deletionApiUrl: string | null;
    embeddedDeletionPlan: boolean;
};

export class AnalysisReportFullSmokeConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnalysisReportFullSmokeConfigError';
    }
}

export function rejectDestructiveRepeatRun(): void {
    const repeatEach = Number(process.env.PLAYWRIGHT_REPEAT_EACH ?? '1');
    if (Number.isFinite(repeatEach) && repeatEach > 1) {
        throw new AnalysisReportFullSmokeConfigError(
            'Combined Analysis Report smoke rejects repeatEach>1 to avoid duplicate email sends and deletions.'
        );
    }
}

export function resolveCombinedSmokeCustomerFromEnv(): Pick<AnalysisReportViewInput, 'customerId' | 'customerName' | 'customerFurigana'> {
    const customerId = process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_ID?.trim();
    if (!customerId) {
        throw new AnalysisReportFullSmokeConfigError(
            'Set ANALYSIS_REPORT_VIEW_CUSTOMER_ID for combined Analysis Report smoke (history-order newest-first pin is selected automatically).'
        );
    }
    return {
        customerId,
        customerName: process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_NAME?.trim() || null,
        customerFurigana: process.env.ANALYSIS_REPORT_VIEW_CUSTOMER_FURIGANA?.trim() || null,
    };
}

export function resolveAnalysisReportFullSmokeConfig(appOrigin: string): AnalysisReportFullSmokeConfig {
    rejectDestructiveRepeatRun();
    const customer = resolveCombinedSmokeCustomerFromEnv();
    const explicitSourceAnalysisId = process.env.ANALYSIS_REPORT_VIEW_ANALYSIS_ID?.trim() || null;
    const sourceLatestTieBreakAnalysisId =
        process.env.ANALYSIS_REPORT_VIEW_TIE_BREAK_ANALYSIS_ID?.trim() ||
        process.env.ANALYSIS_REPORT_FULL_SOURCE_TIE_BREAK_ANALYSIS_ID?.trim() ||
        null;
    const source: AnalysisReportViewInput = {
        customerId: customer.customerId,
        analysisId: explicitSourceAnalysisId ?? '',
        customerName: customer.customerName,
        customerFurigana: customer.customerFurigana,
    };

    const emailTarget = resolveAnalysisReportShareEmailSmokeTarget();
    if (emailTarget.customerId !== customer.customerId) {
        throw new AnalysisReportFullSmokeConfigError(
            'Share-email smoke customer must match ANALYSIS_REPORT_VIEW_CUSTOMER_ID for the combined run.'
        );
    }

    const mode = resolveAnalysisReportDeletionMode();
    const deletionCustomerId =
        process.env.ANALYSIS_REPORT_DELETION_CUSTOMER_ID?.trim() || customer.customerId;
    const planId = process.env.ANALYSIS_REPORT_DELETION_PLAN_ID?.trim() || null;
    const tieBreakAnalysisId = process.env.ANALYSIS_REPORT_DELETION_TIE_BREAK_ANALYSIS_ID?.trim() || null;
    const deleteApiUrl = process.env.ANALYSIS_REPORT_DELETION_API_URL?.trim() || null;

    if (mode === 'off') {
        return {
            appOrigin,
            source,
            explicitSourceAnalysisId,
            sourceLatestTieBreakAnalysisId,
            shareEmailRecipient: emailTarget.recipientEmail,
            shareEmailValidationMode: 'full-inbox-guest',
            deletionMode: 'off',
            deletionCustomerId: customer.customerId,
            deletionPlanId: null,
            deletionTieBreakAnalysisId: null,
            deletionApiUrl: null,
            embeddedDeletionPlan: false,
        };
    }

    if (deletionCustomerId !== customer.customerId) {
        throw new AnalysisReportDeletionConfigError(
            'Combined smoke deletion customer must match ANALYSIS_REPORT_VIEW_CUSTOMER_ID.'
        );
    }

    if (planId === ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID) {
        throw new AnalysisReportFullSmokeConfigError(
            `Refusing legacy reconciled plan ${ANALYSIS_REPORT_FULL_LEGACY_RECONCILED_PLAN_ID}.`
        );
    }

    let embeddedDeletionPlan = false;
    if (mode === 'delete-once') {
        if (planId) {
            const plan = loadDeletionPlan(planId);
            assertPlanAllowsDeleteOnce(plan);
            if (['submitted', 'completed', 'uncertain', 'reconciled_absent', 'reserved'].includes(plan.lifecycle)) {
                throw new AnalysisReportFullSmokeConfigError(
                    `Plan ${planId} lifecycle=${plan.lifecycle} cannot be reused.`
                );
            }
        } else {
            embeddedDeletionPlan = true;
        }
    }

    if (mode === 'cancel') {
        embeddedDeletionPlan = true;
        if (planId) {
            throw new AnalysisReportFullSmokeConfigError(
                'Combined cancel mode uses preflight-persisted plan; do not set ANALYSIS_REPORT_DELETION_PLAN_ID.'
            );
        }
    }

    return {
        appOrigin,
        source,
        explicitSourceAnalysisId,
        sourceLatestTieBreakAnalysisId,
        shareEmailRecipient: emailTarget.recipientEmail,
        shareEmailValidationMode: 'full-inbox-guest',
        deletionMode: mode,
        deletionCustomerId,
        deletionPlanId: planId,
        deletionTieBreakAnalysisId: tieBreakAnalysisId,
        deletionApiUrl: deleteApiUrl,
        embeddedDeletionPlan,
    };
}

export function applyPreflightSourceToConfig(
    config: AnalysisReportFullSmokeConfig,
    sourceAnalysisId: string
): AnalysisReportFullSmokeConfig {
    return {
        ...config,
        source: {
            ...config.source,
            analysisId: sourceAnalysisId,
        },
    };
}
