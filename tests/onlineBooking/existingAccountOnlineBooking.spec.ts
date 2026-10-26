import { test, expect } from '@playwright/test';
import { login } from '../../utils/login';
import {
    assertOnlineBookingOnboardingReady,
    OnlineBookingPreconditionError,
    runOnlineBookingAndConfirmEmail,
} from './onlineBookingFlow';

/**
 * Continuation smoke for an account that already completed registration but may
 * not have finished Online Booking. Does not use e2e-email-state.json.
 *
 * Run once (recommended):
 *   npx playwright test tests/onlineBooking/existingAccountOnlineBooking.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const CONTINUATION_EMAIL = process.env.EPOSE_NEW_USER_EMAIL ?? '';
const CONTINUATION_PASSWORD = process.env.EPOSE_NEW_USER_PASSWORD ?? '';

test('Existing account: login → online booking → confirmation email', async ({
    page,
}) => {
    test.setTimeout(600000);

    if (!CONTINUATION_EMAIL.trim() || !CONTINUATION_PASSWORD) {
        throw new Error(
            'Set EPOSE_NEW_USER_EMAIL and EPOSE_NEW_USER_PASSWORD before running this test.'
        );
    }

    await test.step('login with default navigation', async () => {
        await login(page, {
            email: CONTINUATION_EMAIL,
            password: CONTINUATION_PASSWORD,
        });
        await expect(page).toHaveURL(/customers/, { timeout: 30000 });
    });

    await test.step('verify online-booking onboarding is available', async () => {
        try {
            await assertOnlineBookingOnboardingReady(page);
        } catch (err) {
            if (err instanceof OnlineBookingPreconditionError) {
                throw new Error(
                    `[continuation precondition] ${err.message}`
                );
            }
            throw err;
        }
    });

    await test.step('book slot and verify fresh confirmation email', async () => {
        const bookingFlowStartedAt = Date.now();
        await runOnlineBookingAndConfirmEmail(page, CONTINUATION_EMAIL, {
            emailNotBeforeEpochMs: bookingFlowStartedAt,
        });
    });
});
