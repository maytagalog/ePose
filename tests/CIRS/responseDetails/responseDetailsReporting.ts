export type CirsResponseDetailsStepName =
    | 'identity verification'
    | 'response load'
    | 'autosave'
    | 'skip existing content';

export type CirsResponseSaveOutcome = 'saved_after_edit' | 'skipped_existing_content';

export type CirsResponseDetailsEventPayload = Record<string, unknown>;

export function sanitizeResponseDetailsFailureReason(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
}

export function logCirsResponseDetailsEvent(event: string, payload: CirsResponseDetailsEventPayload): void {
    console.log(event, JSON.stringify(payload));
}

export class CirsResponseDetailsRunTracker {
    readonly accountEmail: string | null;
    customerId: string | null = null;
    recordId: string | null = null;
    expectedText: string | null = null;
    saveOutcome: CirsResponseSaveOutcome | null = null;
    savedTimestamp: string | null = null;
    lastStartedStep: CirsResponseDetailsStepName | null = null;
    lastCompletedStep: CirsResponseDetailsStepName | null = null;

    constructor(options?: { accountEmail?: string | null }) {
        this.accountEmail = options?.accountEmail?.trim() ?? null;
    }

    stepStarted(step: CirsResponseDetailsStepName): void {
        this.lastStartedStep = step;
    }

    stepCompleted(step: CirsResponseDetailsStepName): void {
        this.lastCompletedStep = step;
    }

    private baseFields(finalPathname: string): CirsResponseDetailsEventPayload {
        return {
            ...(this.accountEmail ? { accountEmail: this.accountEmail } : {}),
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.recordId ? { recordId: this.recordId } : {}),
            ...(this.expectedText ? { expectedText: this.expectedText } : {}),
            ...(this.saveOutcome ? { saveOutcome: this.saveOutcome } : {}),
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            finalPathname,
        };
    }

    logStarted(finalPathname: string, customerId: string, recordId: string, expectedText: string): void {
        this.customerId = customerId;
        this.recordId = recordId;
        this.expectedText = expectedText;
        logCirsResponseDetailsEvent('CIRS_RESPONSE_DETAILS_STARTED', {
            ...this.baseFields(finalPathname),
            customerId,
            recordId,
            expectedText,
        });
    }

    logSaved(finalPathname: string, saveOutcome: 'saved_after_edit', savedTimestamp: string): void {
        this.saveOutcome = saveOutcome;
        this.savedTimestamp = savedTimestamp;
        this.stepCompleted('autosave');
        logCirsResponseDetailsEvent('CIRS_RESPONSE_DETAILS_SAVED', {
            ...this.baseFields(finalPathname),
            saveOutcome,
            savedTimestamp,
            autosaveVerified: true,
        });
    }

    logSkippedExistingContent(finalPathname: string, existingText: string): void {
        this.saveOutcome = 'skipped_existing_content';
        this.stepCompleted('skip existing content');
        logCirsResponseDetailsEvent('CIRS_RESPONSE_DETAILS_SKIPPED', {
            ...this.baseFields(finalPathname),
            saveOutcome: 'skipped_existing_content',
            existingTextLength: existingText.trim().length,
        });
    }

    logCompleted(finalPathname: string): void {
        logCirsResponseDetailsEvent('CIRS_RESPONSE_DETAILS_COMPLETED', this.baseFields(finalPathname));
    }

    logFailed(error: unknown, finalPathname: string): void {
        const payload: CirsResponseDetailsEventPayload = {
            ...this.baseFields(finalPathname),
            failureReason: sanitizeResponseDetailsFailureReason(error),
        };
        if (this.savedTimestamp) {
            payload.savedTimestamp = this.savedTimestamp;
        }
        logCirsResponseDetailsEvent('CIRS_RESPONSE_DETAILS_FAILED', payload);
    }
}
