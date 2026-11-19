import type { HandoverIdentitySource } from './takeoverCreateIdentity';

export type TakeoverStepName =
    | 'identity verification'
    | 'handover create'
    | 'handover read'
    | 'handover update'
    | 'handover delete';

export type TakeoverListVerificationStatus = 'verified' | 'unverified' | 'skipped_no_handover_id';

export type TakeoverEventPayload = Record<string, unknown>;

export function sanitizeTakeoverFailureReason(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
}

export function logTakeoverEvent(event: string, payload: TakeoverEventPayload): void {
    console.log(event, JSON.stringify(payload));
}

export type TakeoverRunEvidence = {
    customerId: string;
    recordId: string;
    handoverId: string | null;
    createAttempted: boolean;
    createServerConfirmed: boolean;
    createIdentityVerified: boolean;
    handoverIdentitySource: HandoverIdentitySource | null;
    listVerificationStatus: TakeoverListVerificationStatus;
    readVerified: boolean;
    updateAttempted: boolean;
    updateVerified: boolean;
    deleteAttempted: boolean;
    deleteServerConfirmed: boolean;
    deleteVerified: boolean;
    handoverRetainedOnStaging: boolean;
};

export class TakeoverRunTracker {
    readonly accountEmail: string | null;
    customerId: string | null = null;
    recordId: string | null = null;
    handoverId: string | null = null;
    createAttempted = false;
    createServerConfirmed = false;
    createIdentityVerified = false;
    handoverIdentitySource: HandoverIdentitySource | null = null;
    listVerificationStatus: TakeoverListVerificationStatus = 'skipped_no_handover_id';
    readVerified = false;
    updateAttempted = false;
    updateVerified = false;
    deleteAttempted = false;
    deleteServerConfirmed = false;
    deleteVerified = false;
    handoverRetainedOnStaging = true;
    coverage: 'Takeover handover CRUD' = 'Takeover handover CRUD';
    lastStartedStep: TakeoverStepName | null = null;
    lastCompletedStep: TakeoverStepName | null = null;

    constructor(options?: { accountEmail?: string | null }) {
        this.accountEmail = options?.accountEmail?.trim() ?? null;
    }

    stepStarted(step: TakeoverStepName): void {
        this.lastStartedStep = step;
    }

    stepCompleted(step: TakeoverStepName): void {
        this.lastCompletedStep = step;
    }

    toEvidence(): TakeoverRunEvidence {
        return {
            customerId: this.customerId ?? '',
            recordId: this.recordId ?? '',
            handoverId: this.handoverId,
            createAttempted: this.createAttempted,
            createServerConfirmed: this.createServerConfirmed,
            createIdentityVerified: this.createIdentityVerified,
            handoverIdentitySource: this.handoverIdentitySource,
            listVerificationStatus: this.listVerificationStatus,
            readVerified: this.readVerified,
            updateAttempted: this.updateAttempted,
            updateVerified: this.updateVerified,
            deleteAttempted: this.deleteAttempted,
            deleteServerConfirmed: this.deleteServerConfirmed,
            deleteVerified: this.deleteVerified,
            handoverRetainedOnStaging: this.handoverRetainedOnStaging,
        };
    }

    private baseFields(finalPathname: string): TakeoverEventPayload {
        return {
            coverage: this.coverage,
            ...(this.accountEmail ? { accountEmail: this.accountEmail } : {}),
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.recordId ? { recordId: this.recordId } : {}),
            ...(this.handoverId ? { handoverId: this.handoverId } : {}),
            createAttempted: this.createAttempted,
            createServerConfirmed: this.createServerConfirmed,
            createIdentityVerified: this.createIdentityVerified,
            handoverIdentitySource: this.handoverIdentitySource,
            listVerificationStatus: this.listVerificationStatus,
            readVerified: this.readVerified,
            updateAttempted: this.updateAttempted,
            updateVerified: this.updateVerified,
            deleteAttempted: this.deleteAttempted,
            deleteServerConfirmed: this.deleteServerConfirmed,
            deleteVerified: this.deleteVerified,
            handoverRetainedOnStaging: this.handoverRetainedOnStaging,
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            finalPathname,
        };
    }

    logCrudStarted(finalPathname: string, customerId: string, recordId: string): void {
        this.customerId = customerId;
        this.recordId = recordId;
        logTakeoverEvent('CIRS_TAKEOVER_CRUD_STARTED', this.baseFields(finalPathname));
    }

    logCreateVerified(finalPathname: string): void {
        this.stepCompleted('handover create');
        logTakeoverEvent('CIRS_TAKEOVER_CREATE_VERIFIED', {
            ...this.baseFields(finalPathname),
            createServerConfirmed: this.createServerConfirmed,
        });
    }

    logCreateFailed(error: unknown, finalPathname: string): void {
        logTakeoverEvent('CIRS_TAKEOVER_CREATE_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizeTakeoverFailureReason(error),
        });
    }

    logReadVerified(finalPathname: string): void {
        this.readVerified = true;
        this.stepCompleted('handover read');
        logTakeoverEvent('CIRS_TAKEOVER_READ_VERIFIED', this.baseFields(finalPathname));
    }

    logReadFailed(error: unknown, finalPathname: string): void {
        logTakeoverEvent('CIRS_TAKEOVER_READ_FAILED', {
            ...this.baseFields(finalPathname),
            readVerified: this.readVerified,
            failureReason: sanitizeTakeoverFailureReason(error),
        });
    }

    logUpdateVerified(finalPathname: string): void {
        this.updateVerified = true;
        this.stepCompleted('handover update');
        logTakeoverEvent('CIRS_TAKEOVER_UPDATE_VERIFIED', {
            ...this.baseFields(finalPathname),
            updateServerConfirmed: true,
        });
    }

    logUpdateFailed(error: unknown, finalPathname: string): void {
        logTakeoverEvent('CIRS_TAKEOVER_UPDATE_FAILED', {
            ...this.baseFields(finalPathname),
            updateVerified: this.updateVerified,
            failureReason: sanitizeTakeoverFailureReason(error),
        });
    }

    logDeleteVerified(finalPathname: string, listAbsenceVerified: boolean): void {
        if (!listAbsenceVerified) {
            throw new Error('logDeleteVerified requires listAbsenceVerified=true after confirmed preview list ready.');
        }
        this.deleteVerified = true;
        this.handoverRetainedOnStaging = false;
        this.stepCompleted('handover delete');
        logTakeoverEvent('CIRS_TAKEOVER_DELETE_VERIFIED', {
            ...this.baseFields(finalPathname),
            deleteServerConfirmed: this.deleteServerConfirmed,
            listAbsenceVerified: true,
            persistenceVerified: false,
        });
    }

    logDeleteFailed(error: unknown, finalPathname: string): void {
        logTakeoverEvent('CIRS_TAKEOVER_DELETE_FAILED', {
            ...this.baseFields(finalPathname),
            deleteVerified: this.deleteVerified,
            failureReason: sanitizeTakeoverFailureReason(error),
        });
    }

    logCrudFailed(error: unknown, finalPathname: string): void {
        logTakeoverEvent('CIRS_TAKEOVER_CRUD_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizeTakeoverFailureReason(error),
        });
    }
}

export type TakeoverCrudSummary = {
    create: 'Passed' | 'Failed' | 'Not reached';
    read: 'Passed' | 'Failed' | 'Not reached';
    update: 'Passed' | 'Failed' | 'Not reached';
    delete: 'Passed' | 'Failed' | 'Not reached';
    handoverId: string | null;
    customerId: string;
    recordId: string;
};

export function logTakeoverCrudSummary(summary: TakeoverCrudSummary): void {
    console.log('CIRS_TAKEOVER_CRUD_SUMMARY', JSON.stringify(summary));
}
