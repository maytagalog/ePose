import { test, expect } from '@playwright/test';
import {
    buildTwoDotEmailFromIndex,
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    changeEmailStateFilePath,
    readChangeEmailState,
} from './changeEmailState';
import { runRetireAbandonedChangeEmailTargetSession } from './changeEmailReconciliation';

/**
 * Manual reconciliation: retire an abandoned otp_request_submitted pending target.
 * Does not submit OTP or run Change Email UI.
 */
test('reconcile abandoned Change Email target (manual)', () => {
    test.setTimeout(60000);
    const expected = {
        targetIndex: 0,
        currentEmail: 'aa.rdvarkomonstrosesquip1230000@gmail.com',
        targetEmail: 'a.ar.dvarkomonstrosesquip1230000@gmail.com',
    };
    const result = runRetireAbandonedChangeEmailTargetSession({
        repoRoot: process.cwd(),
        localBase: CHANGE_EMAIL_LOCAL_BASE,
        domain: CHANGE_EMAIL_DOMAIN,
        expected,
    });
    expect(result.retiredTargetIndex).toBe(0);
    expect(result.newNext).toBe(1);
    const statePath = changeEmailStateFilePath(process.cwd());
    const after = readChangeEmailState(statePath, CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN, {
        allowUnresolvedPending: true,
    });
    expect(after.pendingChange).toBeNull();
    expect(after.nextTargetIndex).toBe(1);
    expect(after.highWaterMark).toBe(1);
    const nextTarget = buildTwoDotEmailFromIndex(
        CHANGE_EMAIL_LOCAL_BASE,
        CHANGE_EMAIL_DOMAIN,
        after.nextTargetIndex
    );
    console.log(
        JSON.stringify(
            {
                retiredTargetIndex: result.retiredTargetIndex,
                nextTargetIndex: after.nextTargetIndex,
                nextTargetEmail: nextTarget,
            },
            null,
            2
        )
    );
});
