import { test, expect } from '@playwright/test';
import { login } from "../../utils/login";
// initial
test('Login - existing user', async ({ page }) => {
   test.setTimeout(60000);

   await login(page)

   await expect(page).toHaveURL(/customers/);

   await expect(
      page.getByText('オンラインで使い方の説明を受ける')
  ).not.toBeVisible();

  await expect(page.getByRole('img', { name: 'Menu' })
  ).toBeVisible({ timeout: 15000 });
});

test('Login - new user Online Booking onboarding', async ({ page }) => {
   test.setTimeout(60000);

   const email = process.env.EPOSE_NEW_USER_EMAIL;
   const password = process.env.EPOSE_NEW_USER_PASSWORD;

   if (!email || !password) {
       test.skip(
           true,
           'Set EPOSE_NEW_USER_EMAIL and EPOSE_NEW_USER_PASSWORD for first-login Online Booking smoke'
       );
       return;
   }

   await login(page, { email, password });

   await expect(page).toHaveURL(/customers/);

   const onlineBookingHeading = page.getByText(
       'オンラインで使い方の説明を受ける'
   );

   const skipButton = page.getByRole('button', {
       name: 'スキップする'
   });

   await expect(onlineBookingHeading).toBeVisible({
       timeout: 15000
   });

   await expect(skipButton).toBeVisible();

   await expect(
    page.getByText('緑色の枠が予約可能な時間です。')
    ).toBeVisible({ timeout: 15000 });

   const calendarTimeSlots = page.getByText(/^\d{2}:\d{2}$/);

   await expect(
    calendarTimeSlots.first()
    ).toBeVisible({ timeout: 15000 });

   await skipButton.click();

   await expect(onlineBookingHeading).toBeHidden();

   await expect(
       page.getByText('姿勢分析の始めかた')
   ).toBeVisible({
       timeout: 10000
   });

   const okButton = page.getByRole('button', {
       name: 'OK'
   });

   await expect(okButton).toBeVisible();

   await okButton.click();

   await expect(
       page.getByRole('img', { name: 'Menu' })
   ).toBeVisible({
       timeout: 15000
   });
});