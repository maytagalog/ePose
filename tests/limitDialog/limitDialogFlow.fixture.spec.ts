import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    GET_CONTRACT_PAYMENT_HISTORY_URL,
    GET_CONTRACT_SUBSCRIPTION_URL,
} from '../accountPayment/creditCard/planPurchaseFlow';
import {
    LIMIT_DIALOG_IDENTIFYING_TEXT,
    type LimitDialogEnvironment,
    limitDialogRoot,
    runLimitDialogFlowAfterLogin,
} from './limitDialogFlow';
import type { ExistingUserCustomersReadiness } from '../login/existingUserLoginFlow';

const fixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';

const FIXTURE_ENV: LimitDialogEnvironment = {
    appOrigin: FIXTURE_ORIGIN,
    automaticObservationMs: 800,
    identifyingText: LIMIT_DIALOG_IDENTIFYING_TEXT,
};

const LOGIN_READINESS: ExistingUserCustomersReadiness = {
    profileEmailVerified: true,
    identityEvidence: { status: 'verified', authProfile: { email: 'fixture@test' } },
    takeoverDetected: false,
    takeoverConfirmed: false,
};

function loadShell(auto = false): string {
    const html = fs.readFileSync(
        path.join(fixturesDir, 'limitDialogCustomersShell.html'),
        'utf8'
    );
    return auto ? html : html;
}

async function installShell(
    page: import('@playwright/test').Page,
    options?: { auto?: boolean; subscription?: unknown; paymentHistory?: unknown }
): Promise<void> {
    const auto = options?.auto ?? false;
    await page.route(`${FIXTURE_ORIGIN}/customers**`, (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/customers') {
            route.fulfill({
                contentType: 'text/html',
                body: loadShell(auto).replace(
                    '<body>',
                    auto ? '<body>' : '<body>'
                ),
            });
            return;
        }
        route.fulfill({
            contentType: 'text/html',
            body: loadShell(auto),
        });
    });
    await page.route(GET_CONTRACT_SUBSCRIPTION_URL, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                options?.subscription ?? {
                    data: { current: { status: 'active', planName: 'フリープラン' }, upcoming: null },
                }
            ),
        });
    });
    await page.route(/\/contract\/get_payment_history/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(options?.paymentHistory ?? { data: [] }),
        });
    });
}

test('automatic Limit Dialog: dismissed when present', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page, { auto: true });
    await page.goto(`${FIXTURE_ORIGIN}/customers?auto=1`);
    const result = await runLimitDialogFlowAfterLogin(
        page,
        { email: 'fixture@test', password: 'x' },
        LOGIN_READINESS,
        { env: FIXTURE_ENV, enforcePrerequisites: false }
    );
    expect(result.automaticOutcome).toBe('dismissed');
});

test('automatic Limit Dialog: not_shown within short observation window', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    const result = await runLimitDialogFlowAfterLogin(
        page,
        { email: 'fixture@test', password: 'x' },
        LOGIN_READINESS,
        { env: { ...FIXTURE_ENV, automaticObservationMs: 400 }, enforcePrerequisites: false }
    );
    expect(result.automaticOutcome).toBe('not_shown');
});

test('sequential triggers open and dismiss Limit Dialog; unrelated dialog untouched', async ({
    page,
}) => {
    test.setTimeout(120000);
    await installShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    const result = await runLimitDialogFlowAfterLogin(
        page,
        { email: 'fixture@test', password: 'x' },
        LOGIN_READINESS,
        { env: FIXTURE_ENV, enforcePrerequisites: false }
    );
    expect(result.triggers.plan_change).toBe('verified_dismissed');
    expect(result.triggers.quick_analysis).toBe('verified_dismissed');
    expect(result.triggers.new_analysis).toBe('verified_dismissed');
    expect(result.selectedCustomer?.name).toBe('Fixture Customer First');
    expect(result.finalPathname).toBe('/customers');
    expect(
        await page.evaluate(() => (window as unknown as { __unrelatedDialogCloseCount?: number }).__unrelatedDialogCloseCount ?? 0)
    ).toBe(0);
    await expect(page.getByRole('dialog', { name: 'Unrelated dialog' })).toBeVisible();
});

test('missing triggered dialog fails clearly', async ({ page }) => {
    await installShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.evaluate(() => {
        document.getElementById('plan-change-link')?.remove();
    });
    await expect(
        runLimitDialogFlowAfterLogin(
            page,
            { email: 'fixture@test', password: 'x' },
            LOGIN_READINESS,
            { env: FIXTURE_ENV, enforcePrerequisites: false }
        )
    ).rejects.toThrow(/プラン変更はこちら/);
});

test('staging-shaped null subscription passes when Limit Dialog UI verified Free Plan', async ({
    page,
}) => {
    test.setTimeout(120000);
    await installShell(page, {
        subscription: {
            current: null,
            upcoming: null,
            oneTimeInvoicePendingSubscription: null,
            couponInformation: null,
        },
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    const result = await runLimitDialogFlowAfterLogin(
        page,
        { email: 'fixture@test', password: 'x' },
        LOGIN_READINESS,
        { env: FIXTURE_ENV, enforcePrerequisites: true }
    );
    expect(result.prerequisites.freePlanVerified).toBe(true);
    expect(result.prerequisites.freePlanEvidence).toEqual(
        expect.arrayContaining([
            { source: 'contract_subscription_get', kind: 'explicit_null_current_upcoming' },
            {
                source: 'limit_dialog_ui',
                kind: 'trial_ended_dialog_current_plan_label',
                planName: 'フリープラン',
            },
        ])
    );
});

test('ineligible paid subscription fails prerequisite enforcement', async ({ page }) => {
    await installShell(page, {
        subscription: {
            data: {
                current: { status: 'active', planName: '3ヶ月プラン', paid: true, interval: 'month', intervalCount: 3 },
                upcoming: null,
            },
        },
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await expect(
        runLimitDialogFlowAfterLogin(
            page,
            { email: 'fixture@test', password: 'x' },
            LOGIN_READINESS,
            { env: FIXTURE_ENV, enforcePrerequisites: true }
        )
    ).rejects.toThrow(/Free Plan/);
});

test('empty customer list fails before 新規分析', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.evaluate(() => {
        document
            .querySelectorAll(
                '#phonebook-list-wrapper [id^="phonebook-set-"]:not(#phonebook-set-loading) > div > div > div'
            )
            .forEach((el) => el.remove());
    });
    await expect(
        runLimitDialogFlowAfterLogin(
            page,
            { email: 'fixture@test', password: 'x' },
            LOGIN_READINESS,
            { env: FIXTURE_ENV, enforcePrerequisites: false }
        )
    ).rejects.toThrow(/no records under #phonebook-list-wrapper|initialization did not reach/);
});

test('first customer selection opens list-wrapper record not alphabet tab', async ({ page }) => {
    test.setTimeout(120000);
    await installShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.evaluate(() => {
        (window as unknown as { __alphabetTabClickCount?: number }).__alphabetTabClickCount = 0;
    });
    const result = await runLimitDialogFlowAfterLogin(
        page,
        { email: 'fixture@test', password: 'x' },
        LOGIN_READINESS,
        { env: FIXTURE_ENV, enforcePrerequisites: false }
    );
    expect(result.selectedCustomer?.name).toBe('Fixture Customer First');
    expect(result.selectedCustomer?.customerId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.triggers.new_analysis).toBe('verified_dismissed');
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { __alphabetTabClickCount?: number }).__alphabetTabClickCount ??
                0
        )
    ).toBe(0);
});

test('limitDialogRoot scopes trial-ended copy; unrelated 閉じる dialog stays open', async ({ page }) => {
    await installShell(page);
    await page.goto(`${FIXTURE_ORIGIN}/customers`);
    await page.getByRole('link', { name: 'プラン変更はこちら', exact: true }).click();
    await expect(limitDialogRoot(page, FIXTURE_ENV)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Unrelated dialog' })).toBeVisible();
});
