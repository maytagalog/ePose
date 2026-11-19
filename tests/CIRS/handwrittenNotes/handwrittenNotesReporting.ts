import type { HandwrittenNoteIdentitySource } from './handwrittenNotesCreateIdentity';

export type HandwrittenNotesStepName =
    | 'identity verification'
    | 'note create'
    | 'note update'
    | 'note delete';

export type HandwrittenNotesListVerificationStatus = 'verified' | 'unverified' | 'skipped_no_note_id';

export type HandwrittenNotesEventPayload = Record<string, unknown>;

export function sanitizeHandwrittenFailureReason(error: unknown): string {
    if (error instanceof Error) {
        return error.message.slice(0, 500);
    }
    return String(error).slice(0, 500);
}

export function logHandwrittenNotesEvent(event: string, payload: HandwrittenNotesEventPayload): void {
    console.log(event, JSON.stringify(payload));
}

export type HandwrittenNotesRunEvidence = {
    customerId: string;
    recordId: string;
    noteId: string | null;
    createAttempted: boolean;
    createServerConfirmed: boolean;
    createIdentityVerified: boolean;
    noteIdentitySource: HandwrittenNoteIdentitySource | null;
    listVerificationStatus: HandwrittenNotesListVerificationStatus;
    updateAttempted: boolean;
    updateVerified: boolean;
    deleteAttempted: boolean;
    deleteServerConfirmed: boolean;
    deleteVerified: boolean;
    noteRetainedOnStaging: boolean;
};

export class HandwrittenNotesRunTracker {
    readonly accountEmail: string | null;
    customerId: string | null = null;
    recordId: string | null = null;
    noteId: string | null = null;
    createAttempted = false;
    createServerConfirmed = false;
    createIdentityVerified = false;
    noteIdentitySource: HandwrittenNoteIdentitySource | null = null;
    listVerificationStatus: HandwrittenNotesListVerificationStatus = 'skipped_no_note_id';
    updateAttempted = false;
    updateVerified = false;
    deleteAttempted = false;
    deleteServerConfirmed = false;
    deleteVerified = false;
    noteRetainedOnStaging = true;
    coverage: 'Handwritten Note creation' | 'Handwritten Note update' | 'Handwritten Note delete' =
        'Handwritten Note creation';
    lastStartedStep: HandwrittenNotesStepName | null = null;
    lastCompletedStep: HandwrittenNotesStepName | null = null;

    constructor(options?: { accountEmail?: string | null }) {
        this.accountEmail = options?.accountEmail?.trim() ?? null;
    }

    stepStarted(step: HandwrittenNotesStepName): void {
        this.lastStartedStep = step;
    }

    stepCompleted(step: HandwrittenNotesStepName): void {
        this.lastCompletedStep = step;
    }

    toEvidence(): HandwrittenNotesRunEvidence {
        return {
            customerId: this.customerId ?? '',
            recordId: this.recordId ?? '',
            noteId: this.noteId,
            createAttempted: this.createAttempted,
            createServerConfirmed: this.createServerConfirmed,
            createIdentityVerified: this.createIdentityVerified,
            noteIdentitySource: this.noteIdentitySource,
            listVerificationStatus: this.listVerificationStatus,
            updateAttempted: this.updateAttempted,
            updateVerified: this.updateVerified,
            deleteAttempted: this.deleteAttempted,
            deleteServerConfirmed: this.deleteServerConfirmed,
            deleteVerified: this.deleteVerified,
            noteRetainedOnStaging: this.noteRetainedOnStaging,
        };
    }

    private baseFields(finalPathname: string): HandwrittenNotesEventPayload {
        return {
            coverage: this.coverage,
            ...(this.accountEmail ? { accountEmail: this.accountEmail } : {}),
            ...(this.customerId ? { customerId: this.customerId } : {}),
            ...(this.recordId ? { recordId: this.recordId } : {}),
            ...(this.noteId ? { noteId: this.noteId } : {}),
            createAttempted: this.createAttempted,
            createServerConfirmed: this.createServerConfirmed,
            createIdentityVerified: this.createIdentityVerified,
            noteIdentitySource: this.noteIdentitySource,
            listVerificationStatus: this.listVerificationStatus,
            updateAttempted: this.updateAttempted,
            updateVerified: this.updateVerified,
            deleteAttempted: this.deleteAttempted,
            deleteServerConfirmed: this.deleteServerConfirmed,
            deleteVerified: this.deleteVerified,
            noteRetainedOnStaging: this.noteRetainedOnStaging,
            lastStartedStep: this.lastStartedStep,
            lastCompletedStep: this.lastCompletedStep,
            finalPathname,
        };
    }

    logStarted(finalPathname: string, customerId: string, recordId: string): void {
        this.customerId = customerId;
        this.recordId = recordId;
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_STARTED', this.baseFields(finalPathname));
    }

    logCreateOnlyCompleted(
        finalPathname: string,
        details: {
            noteId: string | null;
            noteIdentitySource: HandwrittenNoteIdentitySource | null;
            createServerConfirmed: boolean;
            createIdentityVerified: boolean;
            listVerificationStatus: HandwrittenNotesListVerificationStatus;
        }
    ): void {
        this.noteId = details.noteId;
        this.noteIdentitySource = details.noteIdentitySource;
        this.createServerConfirmed = details.createServerConfirmed;
        this.createIdentityVerified = details.createIdentityVerified;
        this.listVerificationStatus = details.listVerificationStatus;
        this.stepCompleted('note create');
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_CREATE_ONLY_COMPLETED', {
            ...this.baseFields(finalPathname),
            creationConfirmed: details.createServerConfirmed,
        });
    }

    logFailed(error: unknown, finalPathname: string): void {
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_FAILED', {
            ...this.baseFields(finalPathname),
            failureReason: sanitizeHandwrittenFailureReason(error),
        });
    }

    logUpdateStarted(finalPathname: string, customerId: string, recordId: string, noteId: string): void {
        this.coverage = 'Handwritten Note update';
        this.customerId = customerId;
        this.recordId = recordId;
        this.noteId = noteId;
        this.updateAttempted = true;
        this.stepStarted('note update');
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_UPDATE_STARTED', {
            ...this.baseFields(finalPathname),
            customerId,
            recordId,
            noteId,
        });
    }

    logUpdateVerified(finalPathname: string): void {
        this.updateVerified = true;
        this.stepCompleted('note update');
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_UPDATE_VERIFIED', {
            ...this.baseFields(finalPathname),
            updateServerConfirmed: true,
        });
    }

    logUpdateFailed(error: unknown, finalPathname: string): void {
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_UPDATE_FAILED', {
            ...this.baseFields(finalPathname),
            updateVerified: this.updateVerified,
            failureReason: sanitizeHandwrittenFailureReason(error),
        });
    }

    logDeleteStarted(finalPathname: string, customerId: string, recordId: string, noteId: string): void {
        this.coverage = 'Handwritten Note delete';
        this.customerId = customerId;
        this.recordId = recordId;
        this.noteId = noteId;
        this.stepStarted('note delete');
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_DELETE_STARTED', {
            ...this.baseFields(finalPathname),
            customerId,
            recordId,
            noteId,
        });
    }

    logDeleteVerified(finalPathname: string): void {
        this.deleteVerified = true;
        this.noteRetainedOnStaging = false;
        this.stepCompleted('note delete');
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_DELETE_VERIFIED', {
            ...this.baseFields(finalPathname),
            deleteServerConfirmed: this.deleteServerConfirmed,
            listAbsenceVerified: true,
            persistenceVerified: true,
        });
    }

    logDeleteFailed(error: unknown, finalPathname: string): void {
        logHandwrittenNotesEvent('CIRS_HANDWRITTEN_DELETE_FAILED', {
            ...this.baseFields(finalPathname),
            deleteVerified: this.deleteVerified,
            failureReason: sanitizeHandwrittenFailureReason(error),
        });
    }
}
