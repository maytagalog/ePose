import { expect, type Page } from '@playwright/test';
import { waitForEmail } from '../../utils/gmail';

export class OnlineBookingPreconditionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OnlineBookingPreconditionError';
    }
}

/**
 * Requires first-login Online Booking onboarding UI. Does not skip onboarding or
 * cancel existing bookings.
 */
export async function assertOnlineBookingOnboardingReady(
    page: Page
): Promise<void> {
    await expect(page).toHaveURL(/customers/, { timeout: 15000 });

    const onboardingHeading = page.getByText(
        'オンラインで使い方の説明を受ける'
    );
    const postBookingHeading = page.getByText('姿勢分析の始めかた');

    type CustomersBookingUi = 'onboarding' | 'post-booking' | 'none';
    const result: { uiState: CustomersBookingUi } = {
        uiState: 'none',
    };

    await expect
        .poll(
            async () => {
                if (await postBookingHeading.isVisible()) {
                    result.uiState = 'post-booking';
                } else if (await onboardingHeading.isVisible()) {
                    result.uiState = 'onboarding';
                } else {
                    result.uiState = 'none';
                }

                return result.uiState;
            },
            {
                timeout: 15000,
                intervals: [100, 250, 500],
                message:
                    'Expected Online Booking onboarding or post-booking UI on /customers',
            }
        )
        .not.toBe('none');

    if (result.uiState === 'post-booking') {
        throw new OnlineBookingPreconditionError(
            'This account already shows post-booking UI (姿勢分析の始めかた). ' +
                'The continuation test will not cancel bookings or reset onboarding.'
        );
    }

    await expect(page.getByTestId('booking-slot').first()).toBeVisible({
        timeout: 15000,
    });
}

export type RunOnlineBookingOptions = {
    maxBookingAttempts?: number;
    /** Only accept Gmail messages at or after this time (ms since epoch). */
    emailNotBeforeEpochMs: number;
    emailWaitTimeoutMs?: number;
    emailPollIntervalMs?: number;
};

/**
 * Assumes onboarding is visible. Books a slot (with slot-unavailability retries),
 * asserts UI success, then waits for a fresh booking confirmation email.
 */
export async function runOnlineBookingAndConfirmEmail(
    page: Page,
    email: string,
    options: RunOnlineBookingOptions
): Promise<void> {
    const maxBookingAttempts = options.maxBookingAttempts ?? 3;
    const emailWaitTimeoutMs = options.emailWaitTimeoutMs ?? 120000;
    const emailPollIntervalMs = options.emailPollIntervalMs ?? 10000;

    await expect(
        page.getByText('オンラインで使い方の説明を受ける')
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByTestId('booking-slot').first()).toBeVisible({
        timeout: 15000,
    });

    await expect(
        page
            .locator('[data-testid="booking-slot"][data-available="true"]')
            .first()
    ).toBeVisible({ timeout: 15000 });

    const availableSlots = page.locator(
        '[data-testid="booking-slot"][data-available="true"]'
    );

    const triedTimes = new Set<string>();

    let selectedTime = '';
    let confirmedDateTime = '';
    let bookingSucceeded = false;

    const successToast = page.getByText('予約が完了しました');
    const unavailableToast = page.getByText(
        '選択された時間帯は利用できません',
        { exact: false }
    );

    for (let attempt = 1; attempt <= maxBookingAttempts; attempt++) {
        await expect(page).toHaveURL(/customers/);

        await expect(
            page.getByText('オンラインで使い方の説明を受ける')
        ).toBeVisible({ timeout: 15000 });

        await expect(page.getByTestId('booking-slot').first()).toBeVisible({
            timeout: 15000,
        });

        await expect(availableSlots.first()).toBeVisible({
            timeout: 15000,
        });

        let selectedSlot;

        const slotCount = await availableSlots.count();
        for (let i = 0; i < slotCount; i++) {
            const candidate = availableSlots.nth(i);
            const time = (await candidate.innerText()).trim();

            if (!triedTimes.has(time) && (await candidate.isVisible())) {
                selectedSlot = candidate;
                selectedTime = time;
                break;
            }
        }

        if (!selectedSlot) {
            throw new Error(
                `No untried available slots remain. Tried: ${[...triedTimes].join(', ')}`
            );
        }

        triedTimes.add(selectedTime);

        await selectedSlot.scrollIntoViewIfNeeded();
        await selectedSlot.click();

        const decideButton = page.getByRole('button', {
            name: /^決\s*定$/,
        });

        await expect(decideButton).toBeVisible({ timeout: 15000 });
        await expect(decideButton).toBeEnabled();
        await decideButton.click();

        const confirmDialog = page.getByRole('dialog').filter({
            hasText: '予約内容の確認',
        });

        await expect(confirmDialog).toBeVisible({ timeout: 15000 });

        const dialogText = (await confirmDialog.innerText())
            .replace(/\s+/g, ' ')
            .trim();

        const datetimeMatch = dialogText.match(
            /\d{4}年\d{1,2}月\d{1,2}日（[月火水木金土日]）\s*\d{1,2}:\d{2}/
        );

        expect(
            datetimeMatch,
            'confirmation modal should show full datetime'
        ).not.toBeNull();

        confirmedDateTime = datetimeMatch![0].replace(/\s+/g, ' ').trim();

        const confirmedTimeMatch = confirmedDateTime.match(
            /(\d{1,2}):(\d{2})$/
        );

        expect(
            confirmedTimeMatch,
            'confirmation modal should show booking time'
        ).not.toBeNull();

        const confirmedTime = `${confirmedTimeMatch![1].padStart(2, '0')}:${confirmedTimeMatch![2]}`;

        expect(confirmedTime).toBe(selectedTime);

        const confirmBookingButton = confirmDialog.getByRole('button', {
            name: '予約を確定する',
        });

        await expect(confirmBookingButton).toBeVisible();
        await expect(confirmBookingButton).toBeEnabled();
        await expect(unavailableToast).toBeHidden({ timeout: 15000 });

        await confirmBookingButton.click();

        let outcome = '';

        await expect
            .poll(
                async () => {
                    if (await successToast.isVisible()) {
                        outcome = 'success';
                    } else if (await unavailableToast.isVisible()) {
                        outcome = 'unavailable';
                    }

                    return outcome;
                },
                {
                    timeout: 15000,
                    intervals: [100, 250],
                    message: `Expected booking result for ${selectedTime}`,
                }
            )
            .not.toBe('');

        if (outcome === 'success') {
            bookingSucceeded = true;
            break;
        }

        console.warn(
            `Attempt ${attempt}/${maxBookingAttempts}: ${selectedTime} is unavailable.`
        );

        if (attempt < maxBookingAttempts) {
            await page.reload({ waitUntil: 'domcontentloaded' });
        }
    }

    expect(
        bookingSucceeded,
        `Booking failed after ${maxBookingAttempts} attempts. Tried: ${[...triedTimes].join(', ')}`
    ).toBe(true);

    await expect(
        page.getByText('詳細はメールをご確認ください')
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('姿勢分析の始めかた')).toBeVisible({
        timeout: 10000,
    });

    const okButton = page.getByRole('button', { name: 'OK' });
    await expect(okButton).toBeVisible({ timeout: 15000 });
    await okButton.click();

    const bookingEmailCheck = await waitForEmail(
        email,
        '予約スケジュール',
        emailWaitTimeoutMs,
        emailPollIntervalMs,
        {
            notBeforeEpochMs: options.emailNotBeforeEpochMs,
            recipient: email,
        }
    );

    expect(bookingEmailCheck!.subject).toContain('予約スケジュール');

    const normalizedBody = bookingEmailCheck!.body.replace(/\s+/g, ' ');

    const confirmedDateMatch = confirmedDateTime.match(
        /\d{4}年\d{1,2}月\d{1,2}日/
    );

    expect(confirmedDateMatch).not.toBeNull();

    const confirmedDate = confirmedDateMatch![0];

    expect(normalizedBody).toContain(confirmedDate);
    expect(normalizedBody).toContain(selectedTime);

    expect(bookingEmailCheck!.body).toMatch(
        /https:\/\/meet\.google\.com\/[^\s"'<]+/
    );
}
