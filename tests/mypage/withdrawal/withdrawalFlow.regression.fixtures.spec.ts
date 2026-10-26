import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PATCH_CANCEL_AUTO_RENEWAL_URL,
    POST_AUTH_DELETE_ACCOUNT_URL,
    POST_AUTH_LOGIN_URL,
    assertInvalidCredentialsLoginResponse,
    assertRejectedLoginAfterWithdrawal,
    runWithdrawalAndVerify,
} from './withdrawalFlow';
import { GET_CONTRACT_SUBSCRIPTION_URL } from '../../accountPayment/creditCard/planPurchaseFlow';
import { AUTH_PROFILE_URL } from '../profile/myPageProfileFlow';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_MY_PAGE = `${FIXTURE_ORIGIN}/my-page`;
const FIXTURE_CONTRACT = `${FIXTURE_ORIGIN}/contract`;

const rejectedLoginBody = {
    errors: [
        {
            message: '',
            extensions: { errorCode: 'InvalidParameter', statusCode: 401, attempts: 2, durationLockout: 0 },
        },
    ],
};

type FixtureRouteOptions = {
    renewalAlreadyDisabled?: boolean;
    patchFails?: boolean;
    deleteFails?: boolean;
    skipLoginRedirect?: boolean;
    loginStatus?: number;
};

function activePaidSubscription(cancelAtPeriodEnd: boolean) {
    return {
        current: {
            subscriptionId: 'sub_fixture',
            productId: 'prod_fixture',
            status: 'active',
            interval: 'month',
            intervalCount: 3,
            paid: true,
            invoiceStatus: 'paid',
            periodStart: 1_700_000_000,
            periodEnd: 1_700_900_000,
            cancelAtPeriodEnd,
        },
        upcoming: null,
    };
}

async function installWithdrawalFixture(
    page: import('@playwright/test').Page,
    options: FixtureRouteOptions = {}
) {
    let html = fs.readFileSync(path.join(e2eFixturesDir, 'withdrawalFlow.html'), 'utf8');
    if (options.skipLoginRedirect) {
        html = html.replace("route('/login');", '// login redirect omitted for regression');
    }
    let subscriptionBody = structuredClone(
        activePaidSubscription(options.renewalAlreadyDisabled ?? false)
    );
    const counts = { patch: 0, delete: 0, subscriptionGet: 0 };

    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (
            pathname === '/my-page' ||
            pathname === '/contract' ||
            pathname.startsWith('/my-page/unsubscribe') ||
            pathname === '/login'
        ) {
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
        }
        return route.fulfill({ status: 404, body: 'missing' });
    });

    await page.route(AUTH_PROFILE_URL, async (route) => {
        if (route.request().method() !== 'POST') {
            return route.fulfill({ status: 405, body: 'method not allowed' });
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                email: 'fixture@example.com',
                directorFullName: 'Fixture Director',
                furiganaFullName: 'フィクスチャ',
                showingName: 'Fixture User',
            }),
        });
    });

    await page.route(GET_CONTRACT_SUBSCRIPTION_URL, async (route) => {
        counts.subscriptionGet += 1;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(subscriptionBody),
        });
    });

    await page.route(PATCH_CANCEL_AUTO_RENEWAL_URL, async (route) => {
        counts.patch += 1;
        if (options.patchFails) {
            await route.fulfill({ status: 500, body: 'patch failed' });
            return;
        }
        subscriptionBody = {
            ...subscriptionBody,
            current: { ...subscriptionBody.current, cancelAtPeriodEnd: true },
        };
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.route(POST_AUTH_DELETE_ACCOUNT_URL, async (route) => {
        counts.delete += 1;
        if (options.deleteFails) {
            await route.fulfill({ status: 500, body: 'delete failed' });
            return;
        }
        const body = route.request().postDataJSON() as { email?: string };
        expect(body.email).toBe('fixture@example.com');
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.route(POST_AUTH_LOGIN_URL, async (route) => {
        const status = options.loginStatus ?? 401;
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(status === 401 ? rejectedLoginBody : { errors: [] }),
        });
    });

    return { counts, subscriptionBodyRef: () => subscriptionBody };
}

const account: SmokeAccountRef = {
    email: 'fixture@example.com',
    password: 'FixturePass1',
};

test('fixture regression: one PATCH cancel and one DELETE; rejected login body', async ({ page }) => {
    test.setTimeout(120000);
    const { counts } = await installWithdrawalFixture(page);
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await runWithdrawalAndVerify(page, account, undefined, { pageOrigin: FIXTURE_ORIGIN });

    expect(counts.patch).toBe(1);
    expect(counts.delete).toBe(1);
});

test('fixture regression: PATCH failure prevents DELETE', async ({ page }) => {
    test.setTimeout(120000);
    const { counts } = await installWithdrawalFixture(page, { patchFails: true });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, { pageOrigin: FIXTURE_ORIGIN })
    ).rejects.toThrow(/cancel_auto_renewal|stop-renewal|PATCH/i);

    expect(counts.patch).toBe(1);
    expect(counts.delete).toBe(0);
});

test('fixture regression: DELETE failure fails flow', async ({ page }) => {
    test.setTimeout(120000);
    const { counts } = await installWithdrawalFixture(page, { deleteFails: true });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, { pageOrigin: FIXTURE_ORIGIN })
    ).rejects.toThrow(/auth\/delete|final-delete|DELETE/i);

    expect(counts.delete).toBe(1);
});

test('fixture regression: missing login redirect fails without manual goto', async ({ page }) => {
    test.setTimeout(120000);
    await installWithdrawalFixture(page, { skipLoginRedirect: true });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, { pageOrigin: FIXTURE_ORIGIN })
    ).rejects.toThrow(/login|final-delete|waitForURL/i);

    expect(page.url()).not.toMatch(/\/login$/);
});

test('fixture regression: renewalAlreadyDisabled captures fresh subscription GET', async ({
    page,
}) => {
    test.setTimeout(120000);
    const { counts, subscriptionBodyRef } = await installWithdrawalFixture(page, {
        renewalAlreadyDisabled: true,
    });
    const beforeGets = counts.subscriptionGet;

    await runWithdrawalAndVerify(page, account, undefined, {
        pageOrigin: FIXTURE_ORIGIN,
        renewalAlreadyDisabled: true,
    });

    expect(subscriptionBodyRef().current.cancelAtPeriodEnd).toBe(true);
    expect(counts.patch).toBe(0);
    expect(counts.subscriptionGet).toBeGreaterThan(beforeGets);
});

test('fixture regression: login HTTP 503 is not rejected credentials', async ({ page }) => {
    test.setTimeout(120000);
    await installWithdrawalFixture(page, { loginStatus: 503 });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, { pageOrigin: FIXTURE_ORIGIN })
    ).rejects.toThrow(/server error|503/i);
});

test('unit: assertInvalidCredentialsLoginResponse rejects 503 and accepts staging 401 body', () => {
    expect(() => assertInvalidCredentialsLoginResponse(503, {})).toThrow(/server error/i);
    expect(() => assertInvalidCredentialsLoginResponse(429, {})).toThrow(/rate limit/i);
    assertInvalidCredentialsLoginResponse(401, rejectedLoginBody);
});

test('fixture regression: assertRejectedLoginAfterWithdrawal on /login without goto', async ({
    page,
}) => {
    test.setTimeout(60000);
    const html = fs.readFileSync(path.join(e2eFixturesDir, 'withdrawalFlow.html'), 'utf8');
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) =>
        route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
    );
    await page.route(POST_AUTH_LOGIN_URL, async (route) => {
        await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify(rejectedLoginBody),
        });
    });
    await page.goto(`${FIXTURE_ORIGIN}/login`, { waitUntil: 'domcontentloaded' });

    await assertRejectedLoginAfterWithdrawal(page, account);
    expect(page.url()).toMatch(/\/login/);
});
