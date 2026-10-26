import { test, expect } from '@playwright/test';
import {
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    changeEmailStateFilePath,
    readChangeEmailState,
} from './changeEmailState';
import { runCommitVerifiedChangeEmailSuccessSession } from './changeEmailReconciliation';

/**
 * Manual: commit a verified successful Change Email (confirmation_submitted pending).
 */
test('reconcile successful Change Email commit (manual)', () => {
    const expected = {
        targetIndex: 2,
        currentEmail: 'aard.varkomonstrosesquip1230000@gmail.com',
        targetEmail: 'a.ardv.arkomonstrosesquip1230000@gmail.com',
    };
    const result = runCommitVerifiedChangeEmailSuccessSession({
        repoRoot: process.cwd(),
        localBase: CHANGE_EMAIL_LOCAL_BASE,
        domain: CHANGE_EMAIL_DOMAIN,
        expected,
    });
    expect(result.committedTargetIndex).toBe(2);
    expect(result.newNext).toBe(3);
    const after = readChangeEmailState(
        changeEmailStateFilePath(process.cwd()),
        CHANGE_EMAIL_LOCAL_BASE,
        CHANGE_EMAIL_DOMAIN,
        { allowUnresolvedPending: true }
    );
    expect(after.pendingChange).toBeNull();
    expect(after.nextTargetIndex).toBe(3);
    expect(after.highWaterMark).toBe(3);
    console.log(JSON.stringify({ ...result, finalState: after }, null, 2));
});
