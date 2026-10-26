import { expect, test, type Locator, type Page, type Response } from '@playwright/test';
import type { CustomerFlowEvidence } from '../accountRegistration/customerFlow';
import {
    REFERRAL_COUPON_EMAIL_SUBJECT_MARKER,
    waitForReferralCouponEmailMatch,
} from '../../utils/gmail';
import { appNavigationMenuDialog } from '../mypage/profile/myPageProfileFlow';
import {
    STG_CONTRACT_URL,
    assertContractInformationReady,
} from '../accountPayment/creditCard/planPurchaseFlow';
import type { SmokeAccountRef } from '../mypage/changeEmail/myPageChangeEmailFlow';

const ACTION_TIMEOUT_MS = 15000;
const REFERRAL_HYDRATION_TIMEOUT_MS = 30000;
const REFERRAL_EMAIL_WAIT_TIMEOUT_MS = 120000;
const REFERRAL_EMAIL_POLL_INTERVAL_MS = 10000;

/** Bundle: ContractRepository.sendReferralCouponCodeEmail (staging). */
export const POST_SEND_REFERRAL_COUPON_CODE_EMAIL_URL =
    'https://api-stg.epose.com/contract/send_referral_coupon_code_email';

/** Verified staging route (bundle PATHS.COUPON.BASE_PATH → /coupon). */
export const STG_REFERRAL_COUPON_URL = 'https://app-stg.epose.com/coupon';
export const STG_APP_ORIGIN = 'https://app-stg.epose.com';

export const REFERRAL_COUPON_PAGE_TITLE = '紹介クーポン';
export const REFERRAL_MENU_ITEM_LABEL = '紹介クーポン';
export const REFERRAL_EMAIL_SHARE_BUTTON = 'メールで紹介する';
export const REFERRAL_EMAIL_SEND_BUTTON = '送信する';
export const REFERRAL_EMAIL_SHARE_DIALOG_TITLE = '紹介クーポンコードをメールで共有する';
export const REFERRAL_EMAIL_INPUT_PLACEHOLDER = 'example@epose.com';
export const REFERRAL_COUPON_CODE_SELECTOR = '.coupon-code-text';
export const REFERRAL_COUPON_LIMIT_MESSAGE = 'ご紹介数が上限に達しました';

export class ReferralCouponFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReferralCouponFlowError';
    }
}

export class ReferralCouponIneligibleError extends ReferralCouponFlowError {
    constructor(message: string) {
        super(message);
        this.name = 'ReferralCouponIneligibleError';
    }
}

export class ReferralEmailSendGuard {
    private sent = false;

    markSent(): void {
        if (this.sent) {
            throw new ReferralCouponFlowError(
                'Referral coupon email send was already attempted; refusing a second 送信する click.'
            );
        }
        this.sent = true;
    }
}

export function referralCouponCodeLocator(page: Page): Locator {
    return page.locator(REFERRAL_COUPON_CODE_SELECTOR);
}

export function referralEmailShareDialog(page: Page): Locator {
    return page.getByRole('dialog').filter({
        has: page.getByText(REFERRAL_EMAIL_SHARE_DIALOG_TITLE, { exact: true }),
    });
}

export type ReferralCouponFlowOptions = {
    /** Fixture seam: expected page origin (default {@link STG_APP_ORIGIN}). */
    pageOrigin?: string;
};

/**
 * Live trace (2026-10-24): Referral page title is a plain div (MainLayout showTitle),
 * not a heading — same pattern as Settings (`settingsPageTitle`).
 */
export function referralCouponPageTitle(page: Page): Locator {
    return page.locator(
        `xpath=//div[normalize-space(.)='${REFERRAL_COUPON_PAGE_TITLE}' and not(ancestor-or-self::*[@role='dialog']) and not(.//div[normalize-space(.)='${REFERRAL_COUPON_PAGE_TITLE}'])]`
    );
}

function isSendReferralCouponEmailResponse(res: Response): boolean {
    return (
        res.url().startsWith(POST_SEND_REFERRAL_COUPON_CODE_EMAIL_URL) &&
        res.request().method() === 'POST'
    );
}

function parseSendReferralEmailRequestEmail(response: Response): string | null {
    try {
        const body = response.request().postDataJSON() as { email?: unknown };
        if (typeof body?.email === 'string' && body.email.trim()) {
            return body.email.trim();
        }
    } catch {
        // postData may be unavailable on some transports
    }
    return null;
}

async function assertReferralCouponPageReady(
    page: Page,
    options?: ReferralCouponFlowOptions
): Promise<void> {
    const expectedOrigin = options?.pageOrigin ?? STG_APP_ORIGIN;

    await expect(page).toHaveURL(
        (url) => {
            const parsed = new URL(url);
            const path = parsed.pathname.replace(/\/$/, '') || '/';
            return parsed.origin === expectedOrigin && path === '/coupon';
        },
        { timeout: REFERRAL_HYDRATION_TIMEOUT_MS }
    );

    await expect(page.getByText(REFERRAL_COUPON_LIMIT_MESSAGE)).toHaveCount(0, {
        timeout: ACTION_TIMEOUT_MS,
    });

    const title = referralCouponPageTitle(page);
    await expect(title, 'Expected exactly one Referral Coupon page title element').toHaveCount(1, {
        timeout: REFERRAL_HYDRATION_TIMEOUT_MS,
    });
    await expect(title).toBeVisible({ timeout: REFERRAL_HYDRATION_TIMEOUT_MS });

    const codeEl = referralCouponCodeLocator(page);
    await expect(codeEl, 'Expected exactly one referral coupon code element').toHaveCount(1, {
        timeout: REFERRAL_HYDRATION_TIMEOUT_MS,
    });
    await expect(codeEl).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(codeEl).toHaveText(/[^\s]+/, {
        timeout: REFERRAL_HYDRATION_TIMEOUT_MS,
    });

    await expect(
        page.getByRole('button', { name: REFERRAL_EMAIL_SHARE_BUTTON, exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}

export async function readReferralCouponCodeFromPage(
    page: Page,
    options?: ReferralCouponFlowOptions
): Promise<string> {
    await assertReferralCouponPageReady(page, options);
    const codeEl = referralCouponCodeLocator(page);
    const raw = (await codeEl.innerText()).trim();
    if (!raw) {
        throw new ReferralCouponFlowError('Referral coupon code element was empty.');
    }
    return raw;
}

export async function openReferralCouponFromContractMenu(
    page: Page,
    options?: ReferralCouponFlowOptions
): Promise<void> {
    await assertContractInformationReady(page);

    await page.getByRole('img', { name: 'Menu' }).click();
    const menuDialog = appNavigationMenuDialog(page);
    await expect(menuDialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const referralNav = menuDialog.getByText(REFERRAL_MENU_ITEM_LABEL, { exact: true });
    await expect(referralNav).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await referralNav.click();

    await expect(menuDialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    await assertReferralCouponPageReady(page, options);
}

export async function navigateToContractInformationReadOnly(page: Page): Promise<void> {
    await page.goto(STG_CONTRACT_URL, { waitUntil: 'domcontentloaded' });
    await assertContractInformationReady(page);
}

export type ReferralCouponEmailRunResult = {
    recipient: string;
    referralCode: string;
    gmailMessageId: string;
    sendRequestEmail: string | null;
    finalPathname: string;
};

export async function runReferralCouponEmailAndVerify(
    page: Page,
    account: SmokeAccountRef,
    evidence?: CustomerFlowEvidence
): Promise<ReferralCouponEmailRunResult> {
    const recipient = account.email.trim();
    if (!recipient) {
        throw new ReferralCouponFlowError('Account email is required for referral coupon send.');
    }

    const sendGuard = new ReferralEmailSendGuard();
    let referralCode = '';
    let gmailMessageId = '';
    let sendRequestEmail: string | null = null;

    await test.step('referral coupon: open from Contract Information menu', async () => {
        await openReferralCouponFromContractMenu(page);
        referralCode = await readReferralCouponCodeFromPage(page);
        if (evidence) {
            await evidence.attachScreenshot('referral-coupon-page');
        }
    });

    const sendStartedAtMs = await test.step('referral coupon: email share modal send once', async () => {
        const startedAt = Date.now();
        const shareButton = page.getByRole('button', {
            name: REFERRAL_EMAIL_SHARE_BUTTON,
            exact: true,
        });
        await shareButton.click();

        const dialog = referralEmailShareDialog(page);
        await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
        await expect(dialog.getByText(REFERRAL_EMAIL_SHARE_DIALOG_TITLE, { exact: true })).toBeVisible();

        const emailField = dialog.getByPlaceholder(REFERRAL_EMAIL_INPUT_PLACEHOLDER);
        await expect(emailField).toHaveCount(1);
        await emailField.fill(recipient);
        await expect(emailField).toHaveValue(recipient);

        const sendResponseBodyPromise = page
            .waitForResponse(isSendReferralCouponEmailResponse, {
                timeout: REFERRAL_HYDRATION_TIMEOUT_MS,
            })
            .then(async (res) => {
                sendRequestEmail = parseSendReferralEmailRequestEmail(res);
                if (sendRequestEmail !== recipient) {
                    throw new ReferralCouponFlowError(
                        `Referral send API email ${JSON.stringify(sendRequestEmail)} did not match account.email ${JSON.stringify(recipient)}.`
                    );
                }
                if (res.status() < 200 || res.status() >= 300) {
                    const bodySnippet = (await res.text().catch(() => '')).slice(0, 500);
                    throw new ReferralCouponFlowError(
                        `Referral send API POST ${POST_SEND_REFERRAL_COUPON_CODE_EMAIL_URL} returned HTTP ${res.status()}${bodySnippet ? `: ${bodySnippet}` : ''}`
                    );
                }
                return res.json().catch(() => null);
            });

        const submitButton = dialog.getByRole('button', { name: REFERRAL_EMAIL_SEND_BUTTON, exact: true });
        await expect(submitButton).toHaveCount(1);
        sendGuard.markSent();
        await Promise.all([sendResponseBodyPromise, submitButton.click()]);

        await expect(dialog).toBeHidden({ timeout: REFERRAL_HYDRATION_TIMEOUT_MS });
        await assertReferralCouponPageReady(page);
        await expect(referralCouponCodeLocator(page)).toHaveText(referralCode);
        if (evidence) {
            await evidence.attachScreenshot('referral-coupon-after-send');
        }
        return startedAt;
    });

    await test.step('referral coupon: Gmail receipt verification', async () => {
        const match = await waitForReferralCouponEmailMatch(
            recipient,
            referralCode,
            sendStartedAtMs,
            REFERRAL_EMAIL_WAIT_TIMEOUT_MS,
            REFERRAL_EMAIL_POLL_INTERVAL_MS
        );
        gmailMessageId = match.messageId;
        expect(match.candidate.subject).toContain(REFERRAL_COUPON_EMAIL_SUBJECT_MARKER);
    });

    const finalPathname = new URL(page.url()).pathname.replace(/\/$/, '') || '/';

    const summary = {
        recipient,
        referralCode,
        gmailMessageId,
        sendRequestEmail,
        modalClosed: true,
        codeMatchVerified: true,
        finalPathname,
    };

    console.log('REFERRAL_COUPON_EMAIL_VERIFIED', JSON.stringify(summary));
    if (evidence) {
        await evidence.attachJson('REFERRAL_COUPON_EMAIL_VERIFIED', summary);
    }

    return {
        recipient,
        referralCode,
        gmailMessageId,
        sendRequestEmail,
        finalPathname,
    };
}
