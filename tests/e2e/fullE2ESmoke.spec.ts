/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import { login } from '../../utils/login';
import { waitForEmail } from '../../utils/gmail';
import {
    createProductionVerificationActions,
    executeVerificationBoundaries,
    runSmokeEmailStateSession,
} from '../register/emailSmokeOrchestration';
import {
    assertOnlineBookingOnboardingReady,
    runOnlineBookingAndConfirmEmail,
} from '../onlineBooking/onlineBookingFlow';
import {
    addCustomerAndVerifyDetails,
    deleteCustomerAndVerifyRemoval,
    editCustomerAndVerifyDetails,
    generateUniqueCustomerName,
    generateUniqueFurigana,
} from '../accountRegistration/customerFlow';
import { runMyPageProfileFuriganaUpdateAndVerify } from '../mypage/profile/myPageProfileFlow';
import { runChangeEmailStateSession } from '../mypage/changeEmail/changeEmailOrchestration';
import {
    CHANGE_EMAIL_DOMAIN,
    CHANGE_EMAIL_LOCAL_BASE,
    preflightChangeEmailAllocation,
} from '../mypage/changeEmail/changeEmailState';
import {
    runMyPageChangeEmailAndVerify,
    type SmokeAccountRef,
} from '../mypage/changeEmail/myPageChangeEmailFlow';
import { runMyPageChangePasswordAndVerify } from '../mypage/changePassword/myPageChangePasswordFlow';
import { resolveSmokeChangePasswordTarget } from './shared/smokePasswordConfig';
import { runUpdateCompanyInformationAndVerify } from '../settings/companyInformation/companyInformationFlow';
import { runDisplayItemSettingsUpdateAndVerify } from '../settings/displayItemSettings/displayItemSettingsFlow';
import { beginStripeTestModeObservation, runPlanPurchaseAndVerify } from '../accountPayment/creditCard/planPurchaseFlow';
import { runReferralCouponEmailAndVerify } from '../referralCoupon/referralCouponFlow';
import { runWithdrawalAndVerify } from '../mypage/withdrawal/withdrawalFlow';
import { logPart1RunCompleted, logPart1RunStarted } from './shared/smokePart1Reporting';

/**
 * Full E2E smoke: registration → login → online booking → add → edit → delete customer → profile (Furigana) → Change Email → Change Password → Settings (Company Information)
 * → Settings (Display Item Settings) → Plan purchase (3-month credit card, contract + payment history;
 *   feature ends on Contract Information /contract) → Referral coupon email + Gmail verify (/coupon)
 *   → Withdrawal (stop renewal, delete account, rejected login; ends on /login).
 *
 * Email counter: repo-root e2e-email-state.json (schemaVersion 2). Not created
 * automatically. Initialize manually after reviewing historical usage, e.g.:
 * {
 *   "schemaVersion": 2,
 *   "localBase": "aardvarkomonstrosesquip1230000",
 *   "domain": "gmail.com",
 *   "nextDotPosition": <YOUR_FIRST_UNUSED_INDEX>,
 *   "highWaterMark": <SAME_AS_nextDotPosition>,
 *   "pendingVerification": null
 * }
 *
 * Optional override: EPOSE_DOT_POSITION (must be >= saved nextDotPosition).
 * Change Password target defaults to Password123 (registration Passw0rd); override via
 * EPOSE_SMOKE_NEW_PASSWORD (validated before registration starts).
 * Authorize token.json for aardvarkomonstrosesquip1230000@gmail.com.
 *
 * Structured console lines (PART1_*) are captured in JUnit <system-out> via the junit reporter.
 *
 * Run: npx playwright test tests/e2e/fullE2ESmoke.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test('fullE2ESmokePart1', async ({
    page,
}) => {
    test.setTimeout(1200000);

    const PASSWORD = 'Passw0rd';
    const SMOKE_NEW_PASSWORD = resolveSmokeChangePasswordTarget(PASSWORD);

    const localBase = 'aardvarkomonstrosesquip1230000';
    const domain = 'gmail.com';

    await runSmokeEmailStateSession({
        repoRoot: process.cwd(),
        localBase,
        domain,
        manualDotPositionRaw: process.env.EPOSE_DOT_POSITION,
        runBody: async (session) => {
            await runRegisterOnlineBookingFlow(page, {
                ...session,
                PASSWORD,
                SMOKE_NEW_PASSWORD,
            });
        },
    });
});

async function runRegisterOnlineBookingFlow(
    page: import('@playwright/test').Page,
    ctx: {
        email: string;
        dotPosition: number;
        runId: string;
        statePath: string;
        localBase: string;
        domain: string;
        PASSWORD: string;
        SMOKE_NEW_PASSWORD: string;
        markApplicationSubmitPendingCrossed: () => void;
    }
) {
    const {
        email,
        dotPosition,
        runId,
        statePath,
        localBase,
        domain,
        PASSWORD,
        SMOKE_NEW_PASSWORD,
        markApplicationSubmitPendingCrossed,
    } = ctx;

    beginStripeTestModeObservation(page);

    preflightChangeEmailAllocation(process.cwd(), CHANGE_EMAIL_LOCAL_BASE, CHANGE_EMAIL_DOMAIN);

    logPart1RunStarted(email);

    let emailCode = '';
    let emailVerificationUrl = '';

    const passwordFields = page.locator('input[type="password"]');

    await page.goto('https://app-stg.epose.com/application/start');

    await page.fill('input[type="email"]', email);
    await page.keyboard.press('Tab');
    await expect(page.locator('div[data-cy="error-label"]')).toBeHidden();
    await passwordFields.first().fill(PASSWORD);
    await passwordFields.nth(1).fill(PASSWORD);

    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: '入力内容を確認' }).click();

    await expect(page).toHaveURL(/application\/start\/confirmation/);
    await expect(page.getByText(email)).toBeVisible();

    await executeVerificationBoundaries(
        createProductionVerificationActions({
            statePath,
            localBase,
            domain,
            runId,
            dotPosition,
            markApplicationSubmitPendingCrossed,
            clickInitialApplicationSend: async () => {
                await page.getByText('送 信').click();
                await expect(page).toHaveURL(/application\/start\//);
                await page.getByText('メール認証へすすむ').click();
            },
            prepareOtpVerification: async () => {
                const verificationEmailCheck = await waitForEmail(
                    email,
                    '認証コードをお送りします'
                );
                await expect(verificationEmailCheck).not.toBeNull();
                await expect(verificationEmailCheck?.subject).toContain(
                    '認証コードをお送りします'
                );

                await page.setContent(verificationEmailCheck?.body || '');

                const divs = page.locator('table tr td div');
                const counter = await divs.count();
                emailVerificationUrl =
                    (await page
                        .getByText('メール認証ページはこちら')
                        .getAttribute('href')) || '';

                for (let i = 0; i < counter; i++) {
                    const div = divs.nth(i);
                    const { color, fontSize, text, fontWeight } =
                        await div.evaluate((el) => {
                            const style = getComputedStyle(el);
                            return {
                                color: style.color,
                                fontSize: style.fontSize,
                                fontWeight: style.fontWeight,
                                text: el.textContent,
                            };
                        });

                    if (
                        color === 'rgb(0, 0, 0)' &&
                        fontSize === '36px' &&
                        fontWeight === '500' &&
                        text
                    ) {
                        emailCode = text.replace(/\D/g, '');
                    }
                }

                await page.goto(
                    emailVerificationUrl
                        ? emailVerificationUrl
                        : 'https://app-stg.epose.com/application/verification'
                );

                const fields = page.locator('input[type="text"]');
                await expect(fields.first()).toBeVisible();
                await expect(fields.first()).toBeDisabled();
                await expect(fields.nth(1)).toBeVisible();
                expect(
                    emailCode,
                    'Verification code should be extracted from the email'
                ).not.toBe('');

                await fields.nth(1).fill(emailCode);
                await expect(page.getByText('送 信')).toBeEnabled({
                    timeout: 10000,
                });
            },
            clickOtpSend: async () => {
                await page.getByText('送 信').click();
            },
            isAuthVerificationRejected: async () =>
                page
                    .getByText(
                        '認証に失敗しました。ご入力情報をご確認の上、再度ご入力ください。'
                    )
                    .isVisible(),
            waitForVerificationOutcome: async () => {
                await page.waitForURL(
                    'https://app-stg.epose.com/application/verification*',
                    {
                        waitUntil: 'domcontentloaded',
                        timeout: 60000,
                    }
                );
                await page.waitForTimeout(60000);
                await page.waitForURL(
                    'https://app-stg.epose.com/application/complete*',
                    {
                        waitUntil: 'domcontentloaded',
                        timeout: 120000,
                    }
                );
            },
            runAfterEmailConsumed: async () => {
                await runPostConsumptionSteps(page, email, PASSWORD, SMOKE_NEW_PASSWORD);
            },
        })
    );
}

function businessRegistrationForm(page: import('@playwright/test').Page) {
    return page.locator('form').filter({
        has: page.locator('input[name="telephoneNumber"]'),
    });
}

async function runPostConsumptionSteps(
    page: import('@playwright/test').Page,
    email: string,
    PASSWORD: string,
    SMOKE_NEW_PASSWORD: string
) {
    const registrationEmail = email;
    const form = businessRegistrationForm(page);
    const confirmButton = page.getByRole('button', {
        name: '入力内容を確認',
    });

    await test.step('本登録: wait for business form', async () => {
        await expect(page).toHaveURL(/\/application\/complete/);
        await expect(form).toBeVisible({ timeout: 15000 });
        await expect(confirmButton).toBeVisible({ timeout: 15000 });
        await expect(confirmButton).toBeDisabled({ timeout: 15000 });
    });

    const companyName = form.getByRole('textbox').nth(0);
    const contactName = form.getByRole('textbox').nth(1);
    const telephone = form.locator('input[name="telephoneNumber"]');
    const countrySelectTrigger = form.locator('.ant-select-selection-item');
    const prefectureOrCity = form.getByRole('textbox').nth(4);
    const streetAddress = form.getByRole('textbox').nth(5);

    await test.step('本登録: fill company and contact name', async () => {
        await expect(companyName).toBeVisible({ timeout: 15000 });
        await expect(companyName).toBeEditable({ timeout: 15000 });
        await companyName.fill('Business');
        await expect(companyName).toHaveValue('Business');

        await expect(contactName).toBeEditable({ timeout: 15000 });
        await contactName.fill('Person');
        await expect(contactName).toHaveValue('Person');
    });

    await test.step('本登録: fill telephone', async () => {
        await expect(telephone).toBeEditable({ timeout: 15000 });
        await telephone.fill('09012345678');
        await expect(telephone).toHaveValue('09012345678');
    });

    await test.step('本登録: select country', async () => {
        await expect(countrySelectTrigger).toBeVisible({ timeout: 15000 });
        await countrySelectTrigger.click();
        await page.getByRole('option', { name: 'Australia' }).click();
        await expect(
            form.locator('.ant-select-selection-item[title="Australia"]')
        ).toBeVisible({ timeout: 15000 });
        await page.keyboard.press('Escape');
    });

    await test.step('本登録: fill address fields', async () => {
        await expect(prefectureOrCity).toBeEditable({ timeout: 15000 });
        await prefectureOrCity.fill('New Queensland');
        await expect(prefectureOrCity).toHaveValue('New Queensland');

        await expect(streetAddress).toBeEditable({ timeout: 15000 });
        await streetAddress.fill('Abbot Street');
        await expect(streetAddress).toHaveValue('Abbot Street');
    });

    await test.step('本登録: confirm business information', async () => {
        await expect(confirmButton).toBeEnabled({ timeout: 15000 });
        await confirmButton.click();
    });

    await page.waitForURL(
        'https://app-stg.epose.com/application/complete/confirmation*',
        { waitUntil: 'domcontentloaded', timeout: 50000 }
    );

    await page.getByRole('button', { name: '送 信' }).click();

    await page.waitForURL(
        'https://app-stg.epose.com/application/complete/success*',
        { waitUntil: 'domcontentloaded', timeout: 50000 }
    );

    await expect(
        page.getByText('アカウント登録完了', { exact: true })
    ).toBeVisible({ timeout: 15000 });

    await test.step('registration success: open login via ログイン画面へ', async () => {
        const loginScreenLink = page.locator('a').filter({
            hasText: 'ログイン画面へ',
        });
        await expect(loginScreenLink).toBeVisible({ timeout: 15000 });
        await loginScreenLink.click({ timeout: 15000 });
        await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
        await expect(
            page.getByRole('textbox', { name: 'メールアドレス' })
        ).toBeVisible({ timeout: 15000 });
        await expect(
            page.getByRole('textbox', { name: 'パスワード' })
        ).toBeVisible({ timeout: 15000 });
    });

    // --- First login (triggers Online Booking onboarding) ---
    await login(page, {
        email,
        password: PASSWORD,
        skipNavigation: true,
    });

    await assertOnlineBookingOnboardingReady(page);

    const bookingFlowStartedAt = Date.now();
    await runOnlineBookingAndConfirmEmail(page, email, {
        emailNotBeforeEpochMs: bookingFlowStartedAt,
    });

    const customerName = generateUniqueCustomerName('E2E Register Customer');
    const createdCustomer = await addCustomerAndVerifyDetails(
        page,
        customerName,
        generateUniqueFurigana('テストトウロク')
    );
    const editedCustomer = await editCustomerAndVerifyDetails(
        page,
        createdCustomer
    );
    await deleteCustomerAndVerifyRemoval(page, editedCustomer);

    let account: SmokeAccountRef = { email, password: PASSWORD };
    await runMyPageProfileFuriganaUpdateAndVerify(page, account.email);

    await runChangeEmailStateSession({
        repoRoot: process.cwd(),
        localBase: CHANGE_EMAIL_LOCAL_BASE,
        domain: CHANGE_EMAIL_DOMAIN,
        currentEmail: account.email,
        runBody: async (changeEmailCtx) => {
            account = await runMyPageChangeEmailAndVerify(
                page,
                account,
                changeEmailCtx
            );
        },
    });

    account = await runMyPageChangePasswordAndVerify(page, account, SMOKE_NEW_PASSWORD);

    await runUpdateCompanyInformationAndVerify(page, account);

    await runDisplayItemSettingsUpdateAndVerify(page, account);

    await runPlanPurchaseAndVerify(page, account);

    await runReferralCouponEmailAndVerify(page, account);

    await runWithdrawalAndVerify(page, account);

    logPart1RunCompleted({
        registrationEmail,
        finalAccountEmail: account.email,
        accountWithdrawn: true,
        finalPageUrl: page.url(),
    });
}
