export type ChangePasswordProgress = {
    otpRequested: boolean;
    confirmationAttempted: boolean;
    successUiObserved: boolean;
    /** Set when optional fresh-context new-password login check runs successfully. */
    freshLoginVerificationCompleted: boolean;
    /** Same browser tab still authenticated on /my-page after マイページへもどる (smoke default). */
    mainSessionAuthenticatedAfterReturn: boolean;
    /** True only when an explicit recovery helper re-authenticated (not default smoke). */
    mainSessionRecoveryPerformed: boolean;
};

export function createChangePasswordProgress(): ChangePasswordProgress {
    return {
        otpRequested: false,
        confirmationAttempted: false,
        successUiObserved: false,
        freshLoginVerificationCompleted: false,
        mainSessionAuthenticatedAfterReturn: false,
        mainSessionRecoveryPerformed: false,
    };
}

export function changePasswordProgressSnapshot(
    accountEmail: string,
    progress: ChangePasswordProgress
): Record<string, unknown> {
    return {
        accountEmail,
        otpRequested: progress.otpRequested,
        confirmationAttempted: progress.confirmationAttempted,
        successUiObserved: progress.successUiObserved,
        freshLoginVerificationCompleted: progress.freshLoginVerificationCompleted,
        mainSessionAuthenticatedAfterReturn: progress.mainSessionAuthenticatedAfterReturn,
        mainSessionRecoveryPerformed: progress.mainSessionRecoveryPerformed,
    };
}
