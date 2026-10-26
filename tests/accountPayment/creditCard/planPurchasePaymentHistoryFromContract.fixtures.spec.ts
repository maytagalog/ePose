import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    CONTRACT_PAYMENT_HISTORY_FULL_LIMIT,
    CONTRACT_PAYMENT_HISTORY_NAV_LABEL,
    GET_CONTRACT_PAYMENT_HISTORY_URL,
    contractPaymentHistoryNavControl,
    contractPaymentHistoryRequestKind,
    findPaymentHistoryEntryById,
    parsePaymentHistoryEntries,
} from './planPurchaseFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_CONTRACT_URL = `${FIXTURE_ORIGIN}/contract`;
function loadFixture(name: string): string {
    return fs.readFileSync(path.join(e2eFixturesDir, name), 'utf8');
}

function htmlResponse(body: string) {
    return { contentType: 'text/html; charset=utf-8', body };
}

test('fixture: contract probe already done; history nav triggers only full GET', async ({ page }) => {
    test.setTimeout(60000);

    let probeCount = 0;
    let fullCount = 0;

    const targetEntry = {
        id: 'pay_verification_target',
        amount: 29400,
        status: 'succeeded',
        created: 1792846747,
        receipt_url: 'https://pay.stripe.com/receipts/payment/rcpt_verification_target',
    };

    await page.route(/\/contract\/get_payment_history/, async (route) => {
        const kind = contractPaymentHistoryRequestKind(route.request().url());
        if (kind === 'probe') {
            probeCount += 1;
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ data: [targetEntry] }),
            });
        }
        if (kind === 'full') {
            fullCount += 1;
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ data: [targetEntry] }),
            });
        }
        return route.fulfill({ status: 404, body: 'unexpected history request' });
    });

    const fullHistoryUrl = `${GET_CONTRACT_PAYMENT_HISTORY_URL}?accountId=fixture&limit=${CONTRACT_PAYMENT_HISTORY_FULL_LIMIT}`;
    const contractHtml = loadFixture('planPurchaseContractInformation.html').replace(
        '</body>',
        `<button type="button" id="history-nav">${CONTRACT_PAYMENT_HISTORY_NAV_LABEL}</button>
        <script>
          document.getElementById('history-nav').addEventListener('click', () => {
            fetch('${fullHistoryUrl}');
          });
        </script></body>`
    );

    await page.route(`${FIXTURE_ORIGIN}/contract`, (route) => {
        route.fulfill(htmlResponse(contractHtml));
    });
    await page.goto(FIXTURE_CONTRACT_URL, { waitUntil: 'domcontentloaded' });
    const probeUrl = `${GET_CONTRACT_PAYMENT_HISTORY_URL}?accountId=fixture&limit=1`;
    const probeDone = page.waitForResponse(
        (res) => contractPaymentHistoryRequestKind(res.url()) === 'probe' && res.status() === 200
    );
    await page.evaluate(async (url) => {
        await fetch(url);
    }, probeUrl);
    await probeDone;
    expect(probeCount).toBe(1);

    const historyNav = contractPaymentHistoryNavControl(page);
    await expect(historyNav).toHaveCount(1);
    await expect(historyNav).toBeVisible();

    const fullBodyPromise = page
        .waitForResponse(
            (res) =>
                contractPaymentHistoryRequestKind(res.url()) === 'full' && res.status() === 200
        )
        .then((res) => res.json());
    await Promise.all([fullBodyPromise, historyNav.click()]);
    const historyBody = await fullBodyPromise;
    expect(probeCount).toBe(1);
    expect(fullCount).toBe(1);

    const matched = findPaymentHistoryEntryById(
        parsePaymentHistoryEntries(historyBody),
        'pay_verification_target'
    );
    expect(matched?.id).toBe('pay_verification_target');
});
