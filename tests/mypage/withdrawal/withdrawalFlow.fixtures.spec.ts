import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PATCH_CANCEL_AUTO_RENEWAL_URL,
    POST_AUTH_DELETE_ACCOUNT_URL,
    POST_AUTH_LOGIN_URL,
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

const activePaidSubscription = {
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
        cancelAtPeriodEnd: false,
    },
    upcoming: null,
};

test('fixture: stop renewal, single final withdrawal, rejected login', async ({ page }) => {
    test.setTimeout(120000);
    const html = fs.readFileSync(path.join(e2eFixturesDir, 'withdrawalFlow.html'), 'utf8');
    let subscriptionBody = structuredClone(activePaidSubscription);

    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/my-page' || pathname === '/contract' || pathname.startsWith('/my-page/unsubscribe') || pathname === '/login') {
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
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(subscriptionBody),
        });
    });

    await page.route(PATCH_CANCEL_AUTO_RENEWAL_URL, async (route) => {
        subscriptionBody = {
            ...subscriptionBody,
            current: { ...subscriptionBody.current, cancelAtPeriodEnd: true },
        };
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.route(POST_AUTH_DELETE_ACCOUNT_URL, async (route) => {
        const body = route.request().postDataJSON() as { email?: string };
        expect(body.email).toBe('fixture@example.com');
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.route(POST_AUTH_LOGIN_URL, async (route) => {
        await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
                errors: [
                    {
                        message: '',
                        extensions: {
                            errorCode: 'InvalidParameter',
                            statusCode: 401,
                        },
                    },
                ],
            }),
        });
    });

    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    const account: SmokeAccountRef = {
        email: 'fixture@example.com',
        password: 'FixturePass1',
    };

    await runWithdrawalAndVerify(page, account, undefined, { pageOrigin: FIXTURE_ORIGIN });

    expect(subscriptionBody.current.cancelAtPeriodEnd).toBe(true);
});
