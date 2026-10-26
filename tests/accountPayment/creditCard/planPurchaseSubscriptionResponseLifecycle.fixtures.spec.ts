import { test, expect } from '@playwright/test';
import {
    CONTRACT_INFORMATION_TITLE,
    GET_CONTRACT_SUBSCRIPTION_URL,
    loadContractInformationAndCaptureSubscription,
} from './planPurchaseFlow';

const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_WARMUP_URL = `${FIXTURE_ORIGIN}/warmup`;
const FIXTURE_CONTRACT_URL = `${FIXTURE_ORIGIN}/contract`;

function htmlResponse(body: string) {
    return { contentType: 'text/html; charset=utf-8', body };
}

test('fixture: contract reload ignores prior-page subscription GET (background then goto)', async ({
    page,
}) => {
    test.setTimeout(60000);
    const context = page.context();

    await context.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/warmup') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>warmup</div>
                  <script>
                    fetch('${GET_CONTRACT_SUBSCRIPTION_URL}?accountId=fixture&source=warmup');
                  </script>
                </body></html>`)
            );
        }
        if (path === '/contract') {
            return route.fulfill(
                htmlResponse(`<!DOCTYPE html><html lang="ja"><body>
                  <div>${CONTRACT_INFORMATION_TITLE}</div>
                  <button type="button">プランを変更する</button>
                  <script>
                    fetch('${GET_CONTRACT_SUBSCRIPTION_URL}?accountId=fixture&source=contract');
                  </script>
                </body></html>`)
            );
        }
        return route.fulfill({ status: 404, body: 'missing' });
    });

    await context.route(
        (url) => url.href.startsWith(GET_CONTRACT_SUBSCRIPTION_URL),
        (route) => {
            const source = new URL(route.request().url()).searchParams.get('source') ?? 'unknown';
            route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ current: { source, status: 'active' }, upcoming: null }),
            });
        }
    );

    const warmupSubscriptionDone = page.waitForResponse(
        (res) =>
            res.url().startsWith(GET_CONTRACT_SUBSCRIPTION_URL) &&
            res.url().includes('source=warmup')
    );
    await Promise.all([
        warmupSubscriptionDone,
        page.goto(FIXTURE_WARMUP_URL, { waitUntil: 'domcontentloaded' }),
    ]);

    const subscriptionBody = await loadContractInformationAndCaptureSubscription(
        page,
        FIXTURE_CONTRACT_URL
    );
    expect(subscriptionBody).toMatchObject({
        current: { source: 'contract', status: 'active' },
    });
    await expect(page).toHaveURL(FIXTURE_CONTRACT_URL);
});
