import { test, expect } from '@playwright/test';
import { login } from '../../utils/login';
import { waitForEmail } from '../../utils/gmail';

test('Online Booking - complete happy path', async ({ page }) => {
    test.setTimeout(240000);

    const email = process.env.EPOSE_NEW_USER_EMAIL;
    const password = process.env.EPOSE_NEW_USER_PASSWORD;

    if (!email || !password) {
        test.skip(
            true,
            'Set EPOSE_NEW_USER_EMAIL and EPOSE_NEW_USER_PASSWORD for Online Booking happy path'
        );
        return;
    }

    await login(page, { email, password });

    await expect(page).toHaveURL(/customers/);

    await expect(
        page.getByText('オンラインで使い方の説明を受ける')
    ).toBeVisible({ timeout: 15000 });

    await expect(
        page.getByTestId('booking-slot').first()
    ).toBeVisible({ timeout: 15000 });

    await expect(
        page.locator(
            '[data-testid="booking-slot"][data-available="true"]'
        ).first()
    ).toBeVisible({ timeout: 15000 });

    const availableSlots = page.locator(
        '[data-testid="booking-slot"][data-available="true"]'
    );

    const maxBookingAttempts = 3;
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

        await expect(
            page.getByTestId('booking-slot').first()
        ).toBeVisible({ timeout: 15000 });

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

        // v1: first untried available slot in DOM order, not chronologically earliest.

        await selectedSlot.scrollIntoViewIfNeeded();

        console.log('Selected slot text:', await selectedSlot.innerText());
        console.log('Selected slot available:', await selectedSlot.getAttribute('data-available'));
        console.log('Selected slot status:', await selectedSlot.getAttribute('data-status'));

        await selectedSlot.click();

        console.log('Selected time:', selectedTime);

        console.log(
            'Available slot state after click:',
            await selectedSlot.getAttribute('data-status')
        );

        const decideButton = page.getByRole('button', {
            name: /^決\s*定$/
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

        confirmedDateTime = datetimeMatch![0]
            .replace(/\s+/g, ' ')
            .trim();

        const confirmedTimeMatch = confirmedDateTime.match(
                /(\d{1,2}):(\d{2})$/
        );

        expect(
            confirmedTimeMatch,
            'confirmation modal should show booking time'
        ).not.toBeNull();

        const confirmedTime =
            `${confirmedTimeMatch![1].padStart(2, '0')}:${confirmedTimeMatch![2]}`;

        expect(confirmedTime).toBe(selectedTime);

        const confirmBookingButton = confirmDialog.getByRole('button', {
            name: '予約を確定する',
        });

        await expect(confirmBookingButton).toBeVisible();

        await expect(confirmBookingButton).toBeEnabled();

        await expect(unavailableToast).toBeHidden({ timeout: 15000 });

        await confirmBookingButton.click();

        let outcome = '';

        await expect.poll(
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
        ).not.toBe('');

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
    ).toBeVisible();

    await expect(
        page.getByText('姿勢分析の始めかた')
    ).toBeVisible({ timeout: 10000 });

    const okButton = page.getByRole('button', {
        name: 'OK'
    });

    await expect(okButton).toBeVisible();

    await okButton.click();

    console.log('✅ Booking completed and OK button clicked');
    console.log('📧 Starting waitForEmail...');

    const emailCheck = await waitForEmail(
        email,
        '予約スケジュール',
        120000,
        10000
    );

    console.log('✅ Email found by waitForEmail');
    console.log('📧 Email subject:', emailCheck?.subject);

    expect(emailCheck!.subject).toContain('予約スケジュール');

    console.log('✅ Email subject assertion passed');

    const normalizedBody = emailCheck!.body.replace(/\s+/g, ' ');

    const confirmedDateMatch = confirmedDateTime.match(
        /\d{4}年\d{1,2}月\d{1,2}日/
    );

    expect(confirmedDateMatch).not.toBeNull();

    const confirmedDate = confirmedDateMatch![0];

    expect(normalizedBody).toContain(confirmedDate);
    expect(normalizedBody).toContain(selectedTime);

    expect(emailCheck!.body).toMatch(
        /https:\/\/meet\.google\.com\/[^\s"'<]+/
    );

});