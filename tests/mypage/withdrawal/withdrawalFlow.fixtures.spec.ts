import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runWithdrawalAndVerify } from './withdrawalFlow';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';
import {
    FIXTURE_ORIGIN,
    installWithdrawalFixtureOnContext,
    type WithdrawalFixtureRouteState,
} from './withdrawalFixtureRoutes';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
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

test('fixture: stop renewal, single final withdrawal, rejected login', async ({ page, browser }) => {
    test.setTimeout(120000);
    const html = fs.readFileSync(path.join(e2eFixturesDir, 'withdrawalFlow.html'), 'utf8');
    const subscriptionBody = structuredClone(activePaidSubscription);
    const counts = { patch: 0, delete: 0, subscriptionGet: 0 };
    const state: WithdrawalFixtureRouteState = {
        html,
        subscriptionBody,
        counts,
        options: {},
    };

    await installWithdrawalFixtureOnContext(page.context(), state);

    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    const account: SmokeAccountRef = {
        email: 'fixture@example.com',
        password: 'FixturePass1',
    };

    await runWithdrawalAndVerify(page, account, undefined, {
        pageOrigin: FIXTURE_ORIGIN,
        browser,
        prepareRejectedLoginContext: (ctx) => installWithdrawalFixtureOnContext(ctx, state),
    });

    expect(subscriptionBody.current.cancelAtPeriodEnd).toBe(true);
});