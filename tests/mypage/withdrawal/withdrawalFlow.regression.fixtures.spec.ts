import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    POST_AUTH_LOGIN_URL,
    assertInvalidCredentialsLoginResponse,
    assertRejectedLoginAfterWithdrawal,
    runWithdrawalAndVerify,
    type WithdrawalFlowOptions,
} from './withdrawalFlow';
import type { SmokeAccountRef } from '../changeEmail/myPageChangeEmailFlow';
import {
    FIXTURE_ORIGIN,
    installWithdrawalFixtureOnContext,
    type FixtureRouteOptions,
    type WithdrawalFixtureRouteState,
} from './withdrawalFixtureRoutes';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_MY_PAGE = `${FIXTURE_ORIGIN}/my-page`;

const rejectedLoginBody = {
    errors: [
        {
            message: '',
            extensions: { errorCode: 'InvalidParameter', statusCode: 401, attempts: 2, durationLockout: 0 },
        },
    ],
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
    const subscriptionBody = structuredClone(
        activePaidSubscription(options.renewalAlreadyDisabled ?? false)
    );
    const counts = { patch: 0, delete: 0, subscriptionGet: 0 };
    const state: WithdrawalFixtureRouteState = { html, subscriptionBody, counts, options };

    await installWithdrawalFixtureOnContext(page.context(), state);

    return {
        counts,
        subscriptionBodyRef: () => subscriptionBody,
        prepareRejectedLoginContext: (ctx: import('@playwright/test').BrowserContext) =>
            installWithdrawalFixtureOnContext(ctx, state),
    };
}

function fixtureRunOptions(
    browser: import('@playwright/test').Browser,
    fixture: {
        prepareRejectedLoginContext: (ctx: import('@playwright/test').BrowserContext) => Promise<void>;
    },
    extra: Omit<WithdrawalFlowOptions, 'browser' | 'prepareRejectedLoginContext'> = {}
): WithdrawalFlowOptions {
    return {
        pageOrigin: FIXTURE_ORIGIN,
        browser,
        prepareRejectedLoginContext: fixture.prepareRejectedLoginContext,
        ...extra,
    };
}

const account: SmokeAccountRef = {
    email: 'fixture@example.com',
    password: 'FixturePass1',
};

test('fixture regression: one PATCH cancel and one DELETE; rejected login body', async ({
    page,
    browser,
}) => {
    test.setTimeout(120000);
    const fixture = await installWithdrawalFixture(page);
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await runWithdrawalAndVerify(page, account, undefined, fixtureRunOptions(browser, fixture));

    expect(fixture.counts.patch).toBe(1);
    expect(fixture.counts.delete).toBe(1);
});

test('fixture regression: PATCH failure prevents DELETE', async ({ page, browser }) => {
    test.setTimeout(120000);
    const fixture = await installWithdrawalFixture(page, { patchFails: true });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, fixtureRunOptions(browser, fixture))
    ).rejects.toThrow(/cancel_auto_renewal|stop-renewal|PATCH/i);

    expect(fixture.counts.patch).toBe(1);
    expect(fixture.counts.delete).toBe(0);
});

test('fixture regression: DELETE failure fails flow', async ({ page, browser }) => {
    test.setTimeout(120000);
    const fixture = await installWithdrawalFixture(page, { deleteFails: true });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, fixtureRunOptions(browser, fixture))
    ).rejects.toThrow(/auth\/delete|final-delete|DELETE/i);

    expect(fixture.counts.delete).toBe(1);
});

test('fixture regression: missing login redirect fails without manual goto', async ({
    page,
    browser,
}) => {
    test.setTimeout(120000);
    const fixture = await installWithdrawalFixture(page, { skipLoginRedirect: true });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, fixtureRunOptions(browser, fixture))
    ).rejects.toThrow(/login|final-delete|waitForURL/i);

    expect(page.url()).not.toMatch(/\/login$/);
});

test('fixture regression: renewalAlreadyDisabled captures fresh subscription GET', async ({
    page,
    browser,
}) => {
    test.setTimeout(120000);
    const fixture = await installWithdrawalFixture(page, {
        renewalAlreadyDisabled: true,
    });
    const beforeGets = fixture.counts.subscriptionGet;

    await runWithdrawalAndVerify(
        page,
        account,
        undefined,
        fixtureRunOptions(browser, fixture, { renewalAlreadyDisabled: true })
    );

    expect(fixture.subscriptionBodyRef().current.cancelAtPeriodEnd).toBe(true);
    expect(fixture.counts.patch).toBe(0);
    expect(fixture.counts.subscriptionGet).toBeGreaterThan(beforeGets);
});

test('fixture regression: login HTTP 503 is not rejected credentials', async ({ page, browser }) => {
    test.setTimeout(120000);
    const fixture = await installWithdrawalFixture(page, { loginStatus: 503 });
    await page.goto(FIXTURE_MY_PAGE, { waitUntil: 'domcontentloaded' });

    await expect(
        runWithdrawalAndVerify(page, account, undefined, fixtureRunOptions(browser, fixture))
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
