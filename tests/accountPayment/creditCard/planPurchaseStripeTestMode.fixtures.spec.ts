import { test, expect } from '@playwright/test';
import {
    STRIPE_ELEMENTS_SESSIONS_PATH,
    beginStripeTestModeObservation,
    buildStripeElementsSessionsRequestUrl,
    endStripeTestModeObservation,
    isStripeTestModeVerifiedForPage,
    requireStripeTestModeVerified,
    resetStripeTestModeObservationForTests,
} from './planPurchaseFlow';

test.beforeEach(() => {
    resetStripeTestModeObservationForTests();
});

async function fulfillElementsSession(
    page: import('@playwright/test').Page,
    publishableKey: string
): Promise<void> {
    const sessionUrl = buildStripeElementsSessionsRequestUrl(publishableKey);
    await page.route(`${sessionUrl.split('?')[0]}*`, (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{}',
        });
    });
    await page.goto('about:blank');
    await page.evaluate(async (url) => {
        await fetch(url);
    }, sessionUrl);
}

test('fixture: successful Elements session with pk_test_ verifies test mode', async ({ page }) => {
    beginStripeTestModeObservation(page);
    await fulfillElementsSession(page, 'pk_test_elements_session');
    await requireStripeTestModeVerified(page);
    expect(isStripeTestModeVerifiedForPage(page)).toBe(true);
    endStripeTestModeObservation(page);
});

test('fixture: pk_live_ Elements session is rejected', async ({ page }) => {
    beginStripeTestModeObservation(page);
    await fulfillElementsSession(page, 'pk_live_elements_session');
    await expect(requireStripeTestModeVerified(page)).rejects.toThrow(/pk_live_/);
    endStripeTestModeObservation(page);
});

test('fixture: missing key on Elements session does not verify', async ({ page }) => {
    beginStripeTestModeObservation(page);
    const sessionUrl = `https://api.stripe.com${STRIPE_ELEMENTS_SESSIONS_PATH}?type=setup_intent`;
    await page.route(`https://api.stripe.com${STRIPE_ELEMENTS_SESSIONS_PATH}*`, (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('about:blank');
    await page.evaluate(async (url) => {
        await fetch(url);
    }, sessionUrl);

    expect(isStripeTestModeVerifiedForPage(page)).toBe(false);
    endStripeTestModeObservation(page);
});

test('fixture: delayed Elements session resolves requireStripeTestModeVerified', async ({ page }) => {
    test.setTimeout(60000);
    beginStripeTestModeObservation(page);
    const sessionUrl = buildStripeElementsSessionsRequestUrl('pk_test_delayed_session');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });

    await page.route(`https://api.stripe.com${STRIPE_ELEMENTS_SESSIONS_PATH}*`, async (route) => {
        await gate;
        route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('about:blank');
    const verifyPromise = requireStripeTestModeVerified(page);
    const fetchPromise = page.evaluate(async (url) => {
        await fetch(url);
    }, sessionUrl);

    await page.waitForTimeout(400);
    release();
    await fetchPromise;
    await verifyPromise;
    expect(isStripeTestModeVerifiedForPage(page)).toBe(true);
    endStripeTestModeObservation(page);
});

test('fixture: Stripe test-mode evidence does not leak between pages', async ({ browser }) => {
    const context = await browser.newContext();
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    beginStripeTestModeObservation(pageA);
    beginStripeTestModeObservation(pageB);

    await fulfillElementsSession(pageA, 'pk_test_page_a_only');

    await requireStripeTestModeVerified(pageA);
    expect(isStripeTestModeVerifiedForPage(pageA)).toBe(true);
    expect(isStripeTestModeVerifiedForPage(pageB)).toBe(false);

    await expect(requireStripeTestModeVerified(pageB)).rejects.toThrow(
        /Stripe test mode was not verified/
    );

    endStripeTestModeObservation(pageA);
    endStripeTestModeObservation(pageB);
    await context.close();
});
