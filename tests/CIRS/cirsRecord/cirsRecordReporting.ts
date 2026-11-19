export type CirsRecordStepName =
    | 'customer selection'
    | 'record create'
    | 'record detail'
    | 'preview verification'
    | 'full list verification'
    | 'record reopen';

export type CirsRecordEventPayload = Record<string, unknown>;

export function sanitizeCirsFailureReason(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
}

export function logCirsRecordEvent(event: string, payload: CirsRecordEventPayload): void {
    console.log(event, JSON.stringify(payload));
}

export class CirsRecordRunTracker {
    readonly accountEmail: string | null;
    customerId: string | null = null;
    customerName: string | null = null;
    recordId: string | null = null;
    createAttempted = false;
    createConfirmed = false;
    lastStartedStep: CirsRecordStepName | null = null;
    lastCompletedStep: CirsRecordStepName | null = null;

    constructor(options?: { accountEmail?: string | null }) {
        this.accountEmail = options?.accountEmail?.trim() ?? null;
    }

    stepStarted(step: CirsRecordStepName): void {
        this.lastStartedStep = step;
    }

    stepCompleted(step: CirsRecordStepName): void {
        this.lastCompletedStep = step;
    }

    private baseFields(finalPathname: string): CirsRecordEventPayload {
        return {
            ...(this.accountEmail ? { accountEmail: this.accountEmail } : {}),
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.customerName ? { customerName: this.customerName } : {}),
            ...(this.recordId ? { recordId: this.recordId } : {}),
            createAttempted: this.createAttempted,
            createConfirmed: this.createConfirmed,
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            finalPathname,
        };
    }

    logStarted(finalPathname: string): void {
        logCirsRecordEvent('CIRS_RECORD_STARTED', this.baseFields(finalPathname));
    }

    logCustomerSelected(customerId: string, customerName: string, finalPathname: string): void {
        this.customerId = customerId;
        this.customerName = customerName;
        this.stepCompleted('customer selection');
        logCirsRecordEvent('CIRS_RECORD_CUSTOMER_SELECTED', {
            ...this.baseFields(finalPathname),
            customerId,
            customerName,
        });
    }

    logCreated(recordId: string, finalPathname: string, extra?: CirsRecordEventPayload): void {
        this.recordId = recordId;
        this.createConfirmed = true;
        this.stepCompleted('record create');
        logCirsRecordEvent('CIRS_RECORD_CREATED', {
            ...this.baseFields(finalPathname),
            recordId,
            ...extra,
        });
    }

    logPreviewVerified(finalPathname: string): void {
        this.stepCompleted('preview verification');
        logCirsRecordEvent('CIRS_RECORD_PREVIEW_VERIFIED', this.baseFields(finalPathname));
    }

    logListVerified(finalPathname: string): void {
        this.stepCompleted('full list verification');
        logCirsRecordEvent('CIRS_RECORD_LIST_VERIFIED', this.baseFields(finalPathname));
    }

    logReopened(finalPathname: string): void {
        this.stepCompleted('record reopen');
        logCirsRecordEvent('CIRS_RECORD_REOPENED', this.baseFields(finalPathname));
    }

    logCompleted(finalPathname: string): void {
        logCirsRecordEvent('CIRS_RECORD_COMPLETED', this.baseFields(finalPathname));
    }

    logFailed(error: unknown, finalPathname: string): void {
        logCirsRecordEvent('CIRS_RECORD_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizeCirsFailureReason(error),
        });
    }
}
