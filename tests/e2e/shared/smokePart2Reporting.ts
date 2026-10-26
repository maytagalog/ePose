import type { LimitDialogFlowResult } from '../../limitDialog/limitDialogFlow';
import type { ExistingUserCustomersReadiness } from '../../login/existingUserLoginFlow';
import type { LogoutRunEvidence } from '../../logout/logoutFlow';

export type Part2FeatureOutcome = 'passed' | 'failed' | 'not_reached';

export type Part2FeatureOutcomes = {
    login: Part2FeatureOutcome;
    limitDialog: Part2FeatureOutcome;
    logout: Part2FeatureOutcome;
};

export type Part2StepName = 'login existing account' | 'limit dialog checks' | 'logout';

const ACTIVE_COVERAGE = ['Login', 'Limit Dialog', 'Logout'] as const;
const DEFERRED_COVERAGE = ['CIRS', 'Analysis Report'] as const;
const DEFERRED_REASON = 'awaiting developer automation attributes';

export function logPart2SmokeEvent(event: string, payload: Record<string, unknown>): void {
    console.log(event, JSON.stringify(payload));
}

export function sanitizePageLocation(pageUrl: string): { origin: string; pathname: string } {
    try {
        const parsed = new URL(pageUrl);
        return { origin: parsed.origin, pathname: parsed.pathname };
    } catch {
        return { origin: 'invalid', pathname: String(pageUrl).slice(0, 200) };
    }
}

export function sanitizeFailureReason(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
}

export function buildPart2LoginVerifiedPayload(
    accountEmail: string,
    loginReadiness: ExistingUserCustomersReadiness
): Record<string, unknown> {
    return {
        accountEmail,
        identityEvidenceStatus: loginReadiness.identityEvidence.status,
        profileEmailVerified: loginReadiness.profileEmailVerified,
        sessionTakeoverDetected: loginReadiness.takeoverDetected,
        sessionTakeoverConfirmed: loginReadiness.takeoverConfirmed,
    };
}

export function buildPart2LimitDialogVerifiedPayload(
    accountEmail: string,
    result: LimitDialogFlowResult
): Record<string, unknown> {
    const { prerequisites, triggers } = result;
    return {
        accountEmail,
        automaticDialogOutcome: result.automaticOutcome,
        triggerPlanChange: triggers.plan_change,
        triggerQuickAnalysis: triggers.quick_analysis,
        triggerNewAnalysis: triggers.new_analysis,
        freePlanVerified: prerequisites.freePlanVerified,
        neverPurchasedVerified: prerequisites.neverPurchasedVerified,
        accountAgeStatus: prerequisites.accountAge.status,
        paymentHistoryStatus: prerequisites.paymentHistory.status,
        subscriptionObserved: prerequisites.subscriptionObserved,
        finalPathname: result.finalPathname,
    };
}

export function buildPart2LogoutVerifiedPayload(
    accountEmail: string,
    evidence: LogoutRunEvidence
): Record<string, unknown> {
    return {
        accountEmail,
        logoutAttempted: evidence.logoutAttempted,
        appRedirectVerified: evidence.appRedirectVerified,
        loginFormVerified: evidence.loginFormVerified,
        protectedRouteRejected: evidence.protectedRouteRejected,
        finalPathname: evidence.finalPathname,
    };
}

export class SmokePart2RunTracker {
    readonly accountEmail: string;
    lastStartedStep: Part2StepName | null = null;
    lastCompletedStep: Part2StepName | null = null;
    readonly outcomes: Part2FeatureOutcomes = {
        login: 'not_reached',
        limitDialog: 'not_reached',
        logout: 'not_reached',
    };

    constructor(accountEmail: string) {
        this.accountEmail = accountEmail.trim();
    }

    logRunStarted(): void {
        logPart2SmokeEvent('PART2_RUN_STARTED', {
            smokePart: 2,
            environment: 'staging',
            accountEmail: this.accountEmail,
            accountSource: 'existing_account',
            activeCoverage: [...ACTIVE_COVERAGE],
            deferredCoverage: [...DEFERRED_COVERAGE],
            deferredReason: DEFERRED_REASON,
        });
    }

    stepStarted(step: Part2StepName): void {
        this.lastStartedStep = step;
    }

    stepCompleted(step: Part2StepName): void {
        this.lastCompletedStep = step;
    }

    logLoginVerified(loginReadiness: ExistingUserCustomersReadiness): void {
        this.outcomes.login = 'passed';
        logPart2SmokeEvent(
            'PART2_LOGIN_VERIFIED',
            buildPart2LoginVerifiedPayload(this.accountEmail, loginReadiness)
        );
        this.stepCompleted('login existing account');
    }

    logLimitDialogVerified(result: LimitDialogFlowResult): void {
        this.outcomes.limitDialog = 'passed';
        logPart2SmokeEvent(
            'PART2_LIMIT_DIALOG_VERIFIED',
            buildPart2LimitDialogVerifiedPayload(this.accountEmail, result)
        );
        this.stepCompleted('limit dialog checks');
    }

    logLogoutVerified(evidence: LogoutRunEvidence): void {
        this.outcomes.logout = 'passed';
        logPart2SmokeEvent(
            'PART2_LOGOUT_VERIFIED',
            buildPart2LogoutVerifiedPayload(this.accountEmail, evidence)
        );
        this.stepCompleted('logout');
    }

    markFeatureFailed(step: Part2StepName): void {
        if (step === 'login existing account') {
            this.outcomes.login = 'failed';
        } else if (step === 'limit dialog checks') {
            this.outcomes.limitDialog = 'failed';
        } else {
            this.outcomes.logout = 'failed';
        }
    }

    private markFirstIncompleteFeatureFailed(): void {
        if (this.outcomes.login !== 'passed') {
            this.outcomes.login = 'failed';
            return;
        }
        if (this.outcomes.limitDialog !== 'passed') {
            this.outcomes.limitDialog = 'failed';
            return;
        }
        this.outcomes.logout = 'failed';
    }

    logRunCompleted(pageUrl: string): void {
        const location = sanitizePageLocation(pageUrl);
        logPart2SmokeEvent('PART2_RUN_COMPLETED', {
            accountEmail: this.accountEmail,
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            featureOutcomes: { ...this.outcomes },
            finalOrigin: location.origin,
            finalPathname: location.pathname,
        });
    }

    logRunFailed(error: unknown, pageUrl: string): void {
        this.markFirstIncompleteFeatureFailed();
        const location = sanitizePageLocation(pageUrl);
        logPart2SmokeEvent('PART2_RUN_FAILED', {
            accountEmail: this.accountEmail,
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            featureOutcomes: { ...this.outcomes },
            finalOrigin: location.origin,
            finalPathname: location.pathname,
            failureReason: sanitizeFailureReason(error),
        });
    }
}
