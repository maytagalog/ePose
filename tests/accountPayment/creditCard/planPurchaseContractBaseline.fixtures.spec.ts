import { test, expect } from '@playwright/test';
import {
    CONTRACT_INFORMATION_TITLE,
    CONTRACT_PAYMENT_HISTORY_NAV_LABEL,
    GET_CONTRACT_PAYMENT_HISTORY_URL,
    GET_CONTRACT_SUBSCRIPTION_URL,
    POST_CONTRACT_PLAN_URL,
    capturePaymentHistoryIdBaseline,
    openContractFromSettings,
    waitForContractPaymentHistoryProbeGet,
} from './planPurchaseFlow';
import { waitForSettingsCompanyReadOnlyReady } from '../../settings/companyInformation/companyInformationFlow';

const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_SETTINGS_URL = `${FIXTURE_ORIGIN}/settings`;

function htmlResponse(body: string) {
    return { contentType: 'text/html; charset=utf-8', body };
}

test('fixture: delayed payment-history probe then nav appears (hydration)', async ({ page }) => {
    test.setTimeout(60000);
    const context = page.context();

    await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/settings') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>設定</div><div>会社情報</div>
                  <div><div class="company-information-telephone-number">09012345678</div><button>編集</button></div>
                  <div>表示項目の設定</div>
                  <button type="button" onclick="location.pathname='/contract'">プランの確認・変更はこちら</button>
                </body></html>`)
            );
        }
        if (path === '/contract') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>${CONTRACT_INFORMATION_TITLE}</div>
                  <button type="button">プランを変更する</button>
                  <div id="history-nav" hidden onclick="location.pathname='/contract/history'" style="cursor:pointer">${CONTRACT_PAYMENT_HISTORY_NAV_LABEL}</div>
                  <script>
                    fetch('${GET_CONTRACT_SUBSCRIPTION_URL}');
                    setTimeout(function () {
                      fetch('${GET_CONTRACT_PAYMENT_HISTORY_URL}?accountId=acct&limit=1')
                        .finally(function () {
                          document.getElementById('history-nav').hidden = false;
                        });
                    }, 400);
                  </script>
                </body></html>`)
            );
        }
        if (path === '/contract/history') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>決済履歴</div>
                  <button type="button" onclick="location.pathname='/contract'">ご契約情報へもどる</button>
                  <script>
                    fetch('${GET_CONTRACT_PAYMENT_HISTORY_URL}?accountId=acct&limit=999');
                  </script>
                </body></html>`)
            );
        }
        return route.fulfill({ status: 404, body: 'missing' });
    });

    await context.route(GET_CONTRACT_SUBSCRIPTION_URL, (route) => {
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ current: null, upcoming: null }),
        });
    });

    let probeCount = 0;
    await context.route(
        (url) => url.href.startsWith(GET_CONTRACT_PAYMENT_HISTORY_URL),
        async (route) => {
            const limit = new URL(route.request().url()).searchParams.get('limit');
            if (limit === '1') {
                probeCount += 1;
                await new Promise((r) => setTimeout(r, 300));
                route.fulfill({
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [{ id: 'pay_existing', amount: 29400, status: 'succeeded' }],
                    }),
                });
                return;
            }
            if (limit === '999') {
                route.fulfill({
                    contentType: 'application/json',
                    body: JSON.stringify({
                        data: [{ id: 'pay_existing', amount: 29400, status: 'succeeded' }],
                    }),
                });
                return;
            }
            route.fulfill({ status: 400, body: '{"message":"unexpected limit"}' });
        }
    );

    const opened = await (async () => {
        await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
        await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
        return openContractFromSettings(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    })();

    expect(probeCount).toBe(1);
    const baseline = await capturePaymentHistoryIdBaseline(page, opened.paymentHistoryProbeBody);
    expect(baseline.hadStoredPayments).toBe(true);
    expect(baseline.ids).toEqual(new Set(['pay_existing']));
});

test('fixture: empty-history probe succeeds and nav stays absent', async ({ page }) => {
    const context = page.context();
    await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/settings') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>設定</div><div>会社情報</div>
                  <div><div class="company-information-telephone-number">09012345678</div><button>編集</button></div>
                  <div>表示項目の設定</div>
                  <button type="button" onclick="location.pathname='/contract'">プランの確認・変更はこちら</button>
                </body></html>`)
            );
        }
        if (path === '/contract') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>${CONTRACT_INFORMATION_TITLE}</div>
                  <script>
                    fetch('${GET_CONTRACT_SUBSCRIPTION_URL}');
                    fetch('${GET_CONTRACT_PAYMENT_HISTORY_URL}?accountId=acct&limit=1');
                  </script>
                </body></html>`)
            );
        }
        return route.fulfill({ status: 404, body: 'missing' });
    });
    await context.route(GET_CONTRACT_SUBSCRIPTION_URL, (route) => {
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: null, upcoming: null }) });
    });
    await context.route(
        (url) =>
            url.href.startsWith(GET_CONTRACT_PAYMENT_HISTORY_URL) &&
            url.searchParams.get('limit') === '1',
        (route) => {
            route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [] }) });
        }
    );

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    const opened = await openContractFromSettings(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    const baseline = await capturePaymentHistoryIdBaseline(page, opened.paymentHistoryProbeBody);
    expect(baseline.ids.size).toBe(0);
    expect(baseline.hadStoredPayments).toBe(false);
    await expect(page.getByText(CONTRACT_PAYMENT_HISTORY_NAV_LABEL, { exact: true })).toHaveCount(0);
});

test('fixture: failed history probe fails baseline and never posts plan purchase', async ({ page }) => {
    let planPosts = 0;
    page.on('request', (request) => {
        if (request.url() === POST_CONTRACT_PLAN_URL && request.method() === 'POST') {
            planPosts += 1;
        }
    });

    const context = page.context();
    await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/settings') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>設定</div><div>会社情報</div>
                  <div><div class="company-information-telephone-number">09012345678</div><button>編集</button></div>
                  <div>表示項目の設定</div>
                  <button type="button" onclick="location.pathname='/contract'">プランの確認・変更はこちら</button>
                </body></html>`)
            );
        }
        if (path === '/contract') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>${CONTRACT_INFORMATION_TITLE}</div>
                  <script>
                    fetch('${GET_CONTRACT_SUBSCRIPTION_URL}');
                    fetch('${GET_CONTRACT_PAYMENT_HISTORY_URL}?accountId=acct&limit=1');
                  </script>
                </body></html>`)
            );
        }
        return route.fulfill({ status: 404, body: 'missing' });
    });
    await context.route(GET_CONTRACT_SUBSCRIPTION_URL, (route) => {
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: null, upcoming: null }) });
    });
    await context.route(
        (url) =>
            url.href.startsWith(GET_CONTRACT_PAYMENT_HISTORY_URL) &&
            url.searchParams.get('limit') === '1',
        (route) => {
            route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"history down"}' });
        }
    );

    const probeSettled = page
        .waitForResponse(
            (res) =>
                res.url().startsWith(GET_CONTRACT_PAYMENT_HISTORY_URL) &&
                new URL(res.url()).searchParams.get('limit') === '1'
        )
        .then(async (res) => {
            if (res.status() !== 200) {
                throw new Error(
                    `Payment history probe (limit=1) returned HTTP ${res.status()}; baseline cannot be established.`
                );
            }
            return { ok: true as const };
        })
        .catch((err: unknown) => ({ ok: false as const, err }));
    await Promise.all([
        probeSettled,
        page.goto(`${FIXTURE_ORIGIN}/contract`, { waitUntil: 'domcontentloaded' }),
    ]);
    const probeOutcome = await probeSettled;

    expect(probeOutcome.ok).toBe(false);
    expect(String(probeOutcome.ok ? '' : probeOutcome.err)).toMatch(
        /Payment history probe \(limit=1\) returned HTTP 500/
    );
    expect(planPosts).toBe(0);
});
