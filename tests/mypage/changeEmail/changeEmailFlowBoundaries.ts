import type { SmokeAccountRef } from './myPageChangeEmailFlow';

export async function performChangeEmailOtpRequestBoundary(params: {
    persistOtpRequestSubmitted: () => void;
    submitNewEmail: () => Promise<void>;
}): Promise<void> {
    params.persistOtpRequestSubmitted();
    await params.submitNewEmail();
}

export async function performChangeEmailConfirmationBoundary(params: {
    persistConfirmationSubmitted: () => void;
    submitConfirmation: () => Promise<void>;
}): Promise<void> {
    params.persistConfirmationSubmitted();
    await params.submitConfirmation();
}

export async function finalizeChangeEmailAccountAfterSuccess(params: {
    verifyFreshLoad: () => Promise<void>;
    commitChangeEmailSuccess: () => void;
    account: SmokeAccountRef;
    targetEmail: string;
}): Promise<SmokeAccountRef> {
    await params.verifyFreshLoad();
    params.commitChangeEmailSuccess();
    return { email: params.targetEmail, password: params.account.password };
}
