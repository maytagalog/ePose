import { expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { GET_CONTRACT_SUBSCRIPTION_URL } from '../../accountPayment/creditCard/planPurchaseFlow';
import { AUTH_PROFILE_URL } from '../profile/myPageProfileFlow';
import {
    PATCH_CANCEL_AUTO_RENEWAL_URL,
    POST_AUTH_DELETE_ACCOUNT_URL,
    POST_AUTH_LOGIN_URL,
} from './withdrawalFlow';

export const FIXTURE_ORIGIN = 'https://fixture.test';

export type FixtureRouteOptions = {
    renewalAlreadyDisabled?: boolean;
    patchFails?: boolean;
    deleteFails?: boolean;
    skipLoginRedirect?: boolean;
    loginStatus?: number;
};

const rejectedLoginBody = {
    errors: [
        {
            message: '',
            extensions: { errorCode: 'InvalidParameter', statusCode: 401, attempts: 2, durationLockout: 0 },
        },
    ],
};

export type WithdrawalFixtureRouteState = {
    html: string;
    subscriptionBody: {
        current: {
            cancelAtPeriodEnd: boolean;
            [key: string]: unknown;
        };
        upcoming: null;
    };
    counts: { patch: number; delete: number; subscriptionGet: number };
    options: FixtureRouteOptions;
};

export async function installWithdrawalFixtureOnContext(
    context: BrowserContext,
    state: WithdrawalFixtureRouteState
): Promise<void> {
    const { html, subscriptionBody, counts, options } = state;

    await context.route(`${FIXTURE_ORIGIN}/**`, (route) => {
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

    await context.route(AUTH_PROFILE_URL, async (route) => {
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

    await context.route(GET_CONTRACT_SUBSCRIPTION_URL, async (route) => {
        counts.subscriptionGet += 1;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(subscriptionBody),
        });
    });

    await context.route(PATCH_CANCEL_AUTO_RENEWAL_URL, async (route) => {
        counts.patch += 1;
        if (options.patchFails) {
            await route.fulfill({ status: 500, body: 'patch failed' });
            return;
        }
        subscriptionBody.current = { ...subscriptionBody.current, cancelAtPeriodEnd: true };
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await context.route(POST_AUTH_DELETE_ACCOUNT_URL, async (route) => {
        counts.delete += 1;
        if (options.deleteFails) {
            await route.fulfill({ status: 500, body: 'delete failed' });
            return;
        }
        const body = route.request().postDataJSON() as { email?: string };
        expect(body.email).toBe('fixture@example.com');
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await context.route(POST_AUTH_LOGIN_URL, async (route) => {
        const status = options.loginStatus ?? 401;
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(status === 401 ? rejectedLoginBody : { errors: [] }),
        });
    });
}