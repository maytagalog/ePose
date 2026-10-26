import { test, expect } from '@playwright/test';
import { login } from '../../../utils/login';
import {
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    changeEmailStateFilePath,
    readChangeEmailState,
    validateExpectedSuccessCommitPending,
} from './changeEmailState';
import {
    assertMyPageSignedInEmail,
    waitForAuthProfilePost,
    waitForMyPageReadOnlyReady,
} from '../profile/myPageProfileFlow';

const STG_MY_PAGE = 'https://app-stg.epose.com/my-page';

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing ${name} for Change Email success verification.`);
    }
    return value;
}

/**
 * Read-only: login with new target email after UI success (no OTP / no confirmation resubmit).
 */
test.describe.configure({ retries: 0 });

test('verify staging account uses committed target email on My Page', async ({ page }) => {
    test.setTimeout(180000);
    requireEnv('EPOSE_CHANGE_EMAIL_PASSWORD');

    const expected = {
        targetIndex: 2,
        currentEmail: 'aard.varkomonstrosesquip1230000@gmail.com',
        targetEmail: 'a.ardv.arkomonstrosesquip1230000@gmail.com',
    };
    const state = readChangeEmailState(
        changeEmailStateFilePath(process.cwd()),
        CHANGE_EMAIL_LOCAL_BASE,
        CHANGE_EMAIL_DOMAIN,
        { allowUnresolvedPending: true }
    );
    const pending = validateExpectedSuccessCommitPending(state, expected);
    const newEmail = pending.targetEmail;
    const password = process.env.EPOSE_CHANGE_EMAIL_PASSWORD!;

    await login(page, { email: newEmail, password });
    await page.waitForURL(/\/customers/, { timeout: 60000 });

    const profileResponsePromise = waitForAuthProfilePost(page);
    await page.goto(STG_MY_PAGE, { waitUntil: 'domcontentloaded' });
    await waitForMyPageReadOnlyReady(page);
    const profile = await profileResponsePromise;
    expect(profile.email).toBe(newEmail);
    await assertMyPageSignedInEmail(page, newEmail);

    console.log(
        JSON.stringify(
            {
                verifiedLoginEmail: newEmail,
                authProfileEmail: profile.email,
                pendingRunId: pending.runId,
                pendingPhase: pending.phase,
            },
            null,
            2
        )
    );
});
