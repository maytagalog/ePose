import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    GET_CONTRACT_SUBSCRIPTION_URL,
    GET_CONTRACT_PAYMENT_HISTORY_URL,
    PaymentSubmissionGuard,
    PLAN_ENTER_PAYMENT_INFO_BUTTON,
    PLAN_SELECT_BUTTON_LABEL,
    POST_CONTRACT_PLAN_URL,
    amountsEqualYen,
    extractLabeledYenTotal,
    assertPaymentHistoryMatchedRowUi,
    findNewPaymentHistoryEntry,
    assertPaymentInformationMatchesSelection,
    assertPlanSelectionPageReady,
    openContractFromSettings,
    parsePaymentHistoryEntries,
    paymentHistoryTableRow,
    planSelectionCardSectionTitle,
    selectThreeMonthPlanAndCaptureTotals,
    threeMonthPlanCard,
    yenAmountRegex,
    planSelectionOrderSummaryFooter,
} from './planPurchaseFlow';
import { waitForSettingsCompanyReadOnlyReady } from '../../settings/companyInformation/companyInformationFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_SETTINGS_URL = `${FIXTURE_ORIGIN}/settings`;
const FIXTURE_CONTRACT_URL = `${FIXTURE_ORIGIN}/contract`;
const FIXTURE_PLANS_URL = `${FIXTURE_ORIGIN}/contract/plans`;
const FIXTURE_PAYMENT_URL = `${FIXTURE_ORIGIN}/contract/payment-information`;

function loadFixture(name: string): string {
    return fs.readFileSync(path.join(e2eFixturesDir, name), 'utf8');
}

function htmlResponse(body: string) {
    return {
        contentType: 'text/html; charset=utf-8',
        body,
    };
}

async function installFixtureRoutes(page: import('@playwright/test').Page): Promise<void> {
    const context = page.context();
    await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/settings') {
            return route.fulfill(htmlResponse(loadFixture('planPurchaseSettings.html')));
        }
        if (url.pathname === '/contract') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/></head><body>
                  <div>ご契約情報</div>
                  <button type="button">プランを変更する</button>
                  <script>
                    fetch('${GET_CONTRACT_SUBSCRIPTION_URL}').catch(function () {});
                    fetch('${GET_CONTRACT_PAYMENT_HISTORY_URL}?accountId=fixture&limit=1').catch(function () {});
                  </script>
                </body></html>`)
            );
        }
        if (url.pathname === '/contract/plans') {
            return route.fulfill(htmlResponse(loadFixture('planPurchasePlanSelection.html')));
        }
        if (url.pathname === '/contract/payment-information') {
            return route.fulfill(htmlResponse(loadFixture('planPurchasePaymentInformation.html')));
        }
        return route.fulfill({ status: 404, body: 'not found' });
    });

    await context.route(GET_CONTRACT_SUBSCRIPTION_URL, (route) => {
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                current: { status: 'active', planName: 'フリープラン' },
                upcoming: null,
            }),
        });
    });
}

test('fixture: contract navigation reuses subscription response (wait before click)', async ({
    page,
}) => {
    test.setTimeout(60000);
    await installFixtureRoutes(page);
    let subscriptionGets = 0;
    await page.context().route(GET_CONTRACT_SUBSCRIPTION_URL, (route) => {
        subscriptionGets += 1;
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ current: null, upcoming: null }),
        });
    });

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });

    let historyProbeGets = 0;
    await page.context().route(
        (url) => url.href.startsWith(GET_CONTRACT_PAYMENT_HISTORY_URL),
        (route) => {
            if (new URL(route.request().url()).searchParams.get('limit') === '1') {
                historyProbeGets += 1;
                route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [] }) });
                return;
            }
            route.continue();
        }
    );

    const opened = await openContractFromSettings(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    expect(subscriptionGets).toBe(1);
    expect(historyProbeGets).toBe(1);
    expect(opened.subscriptionBody).toMatchObject({ current: null });
    expect(opened.paymentHistoryProbeBody).toEqual({ data: [] });
    await expect(page).toHaveURL(FIXTURE_CONTRACT_URL);
});

test('fixture: scoped card-selection-title resolves single プラン選択 under duplicate page text', async ({
    page,
}) => {
    await installFixtureRoutes(page);
    await page.goto(FIXTURE_PLANS_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('プラン選択', { exact: true })).toHaveCount(2);
    await expect(planSelectionCardSectionTitle(page)).toHaveCount(1);
});

test('fixture: three-month card scopes one select button and totals match footer', async ({
    page,
}) => {
    test.setTimeout(60000);
    await installFixtureRoutes(page);
    await page.goto(FIXTURE_PLANS_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('プラン選択', { exact: true })).toHaveCount(2);
    await assertPlanSelectionPageReady(page);

    const card = threeMonthPlanCard(page);
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('button', { name: PLAN_SELECT_BUTTON_LABEL, exact: true })).toHaveCount(
        1
    );

    const cardTotal = extractLabeledYenTotal(await card.innerText(), ['合計金額', '合計']);
    expect(cardTotal).toBe(29400);

    await card.getByRole('button', { name: PLAN_SELECT_BUTTON_LABEL, exact: true }).click();
    await expect(page.getByText('選択中', { exact: true })).toBeVisible();

    const footerTotal = extractLabeledYenTotal(
        await planSelectionOrderSummaryFooter(page).innerText(),
        ['合計金額', '合計']
    );
    expect(footerTotal).toBe(cardTotal);
});

test('fixture: selectThreeMonthPlanAndCaptureTotals navigates to payment', async ({ page }) => {
    test.setTimeout(60000);
    await installFixtureRoutes(page);
    await page.goto(FIXTURE_PLANS_URL, { waitUntil: 'domcontentloaded' });
    await assertPlanSelectionPageReady(page);

    const selection = await selectThreeMonthPlanAndCaptureTotals(page);
    expect(selection.totalAmountYen).toBe(29400);
    expect(selection.planDisplayName).toMatch(/3.*ヶ月プラン/);
    await expect(page).toHaveURL(FIXTURE_PAYMENT_URL);
    await assertPaymentInformationMatchesSelection(page, selection);
});

test('fixture: assertPaymentInformationMatchesSelection targets footer final total', async ({
    page,
}) => {
    await page.setContent(loadFixture('planPurchasePaymentInformation.html'), {
        waitUntil: 'domcontentloaded',
    });
    await assertPaymentInformationMatchesSelection(page, {
        planDisplayName: '3ヶ月プラン',
        totalAmountYen: 29400,
        monthDuration: 3,
    });
});

test('fixture: yen formatting regex matches comma and plain amounts', () => {
    expect('¥29,400'.match(yenAmountRegex(29400))).toBeTruthy();
    expect('¥29400'.match(yenAmountRegex(29400))).toBeTruthy();
    expect(amountsEqualYen(29400, 29400)).toBe(true);
});

test('fixture: duplicate amount history verifies matched row status and amount (no receipt)', async ({
    page,
}) => {
    await installFixtureRoutes(page);
    const html = loadFixture('planPurchasePaymentHistoryDuplicateAmount.html');
    await page.context().route(`${FIXTURE_ORIGIN}/contract/history`, (route) => {
        route.fulfill(htmlResponse(html));
    });

    const entries = parsePaymentHistoryEntries([
        {
            id: 'pay_old_same_amount',
            amount: 29400,
            status: 'succeeded',
            created: 1,
        },
        {
            id: 'pay_new_run',
            amount: 29400,
            status: 'succeeded',
            created: 9999999999,
        },
    ]);
    const matched = findNewPaymentHistoryEntry(entries, {
        expectedAmountYen: 29400,
        runStartedAtMs: Date.now() - 5000,
        idsBefore: new Set(['pay_old_same_amount']),
    });
    expect(matched?.id).toBe('pay_new_run');

    await page.goto(`${FIXTURE_ORIGIN}/contract/history`, { waitUntil: 'domcontentloaded' });

    const selection = {
        planDisplayName: '3ヶ月プラン',
        totalAmountYen: 29400,
        monthDuration: 3 as const,
    };
    await assertPaymentHistoryMatchedRowUi(page, matched!, selection);

    const oldRow = paymentHistoryTableRow(page, entries[0]!);
    await expect(oldRow).toHaveCount(1);
    await expect(oldRow).toContainText('支払済み');
});

test('fixture: failed payment submit does not allow second submit', async ({ page }) => {
    const guard = new PaymentSubmissionGuard();
    let postCount = 0;

    await page.route('https://fixture.test/payment', (route) => {
        postCount += 1;
        route.fulfill({ status: 402, contentType: 'application/json', body: '{"message":"card declined"}' });
    });

    await page.setContent(`
      <button id="pay">決済を実行する</button>
      <script>
        document.getElementById('pay').addEventListener('click', () => {
          fetch('https://fixture.test/payment', { method: 'POST' });
        });
      </script>
    `);

    const submit = page.getByRole('button', { name: '決済を実行する', exact: true });
    guard.assertCanSubmit();
    const responsePromise = page.waitForResponse('https://fixture.test/payment');
    guard.markSubmitted();
    await submit.click();
    await responsePromise;

    expect(postCount).toBe(1);
    expect(() => guard.assertCanSubmit()).toThrow(/already attempted once/);
});

test('fixture: plan POST must be 200 before treating navigation alone as success', async ({
    page,
}) => {
    await page.route(POST_CONTRACT_PLAN_URL, (route) => {
        route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"invalid"}' });
    });
    await page.route('https://fixture.test/complete', (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: '<html><body>クレジットカード決済が完了しました</body></html>',
        });
    });

    await page.setContent(`
      <button id="pay">決済を実行する</button>
      <script>
        document.getElementById('pay').addEventListener('click', async () => {
          await fetch('${POST_CONTRACT_PLAN_URL}', { method: 'POST' });
          location.href = 'https://fixture.test/complete';
        });
      </script>
    `);

    const guard = new PaymentSubmissionGuard();
    guard.assertCanSubmit();
    const planPost = page.waitForResponse(POST_CONTRACT_PLAN_URL);
    guard.markSubmitted();
    await page.getByRole('button', { name: '決済を実行する', exact: true }).click();
    const res = await planPost;
    expect(res.status()).toBe(400);
    expect(guard.hasSubmitted).toBe(true);
    expect(() => guard.assertCanSubmit()).toThrow();
});
