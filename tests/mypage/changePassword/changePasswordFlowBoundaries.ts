import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';

export async function performChangePasswordOtpRequestBoundary(params: {
    submitOtpRequest: () => Promise<void>;
}): Promise<void> {
    await params.submitOtpRequest();
}

export async function performChangePasswordConfirmationBoundary(params: {
    submitConfirmation: () => Promise<void>;
}): Promise<void> {
    await params.submitConfirmation();
}

export async function finalizeChangePasswordAccountAfterVerification(params: {
    verifyFreshLogin: () => Promise<void>;
    accountEmail: string;
    newPassword: string;
}): Promise<SmokeAccountRef> {
    await params.verifyFreshLogin();
    return { email: params.accountEmail, password: params.newPassword };
}

export function changePasswordAccountRefAfterSmokeSuccess(params: {
    accountEmail: string;
    newPassword: string;
}): SmokeAccountRef {
    return { email: params.accountEmail, password: params.newPassword };
}
