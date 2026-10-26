import { test, expect, type TestInfo } from '@playwright/test';
import { login } from '../../utils/login';
import {
    assertCustomerFlowNotBlocked,
    assertCustomersListInitReady,
    assertSelectedCustomerReady,
    CustomerFlowBlockedError,
    openCustomerProfileAndVerify,
    type CustomerFlowEvidence,
} from './customerFlow';

/**
 * Read-only verification of an existing customer (no create / save / email state).
 *
 *   npx playwright test tests/accountRegistration/existingAccountVerifyCustomer.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const EMAIL = process.env.EPOSE_CUSTOMER_EMAIL ?? '';
const PASSWORD = process.env.EPOSE_CUSTOMER_PASSWORD ?? '';
const EXISTING_CUSTOMER = {
    name: 'E2E Add Customer 1792751111468',
    furigana: 'テストソンコエソソササ',
    customerId: 'ef38959b-c155-455f-a1fc-e8027b874af8',
} as const;

function createEvidence(page: import('@playwright/test').Page, testInfo: TestInfo): CustomerFlowEvidence {
    return {
        attachJson: async (name, data) => {
            await testInfo.attach(name, {
                body: JSON.stringify(data, null, 2),
                contentType: 'application/json',
            });
        },
        attachScreenshot: async (name) => {
            const png = await page.screenshot({ fullPage: true }).catch(() => null);
            if (png) {
                await testInfo.attach(name, { body: png, contentType: 'image/png' });
            }
        },
        attachPageHtml: async (name) => {
            const html = await page.content().catch(() => '');
            await testInfo.attach(name, {
                body: html,
                contentType: 'text/html',
            });
        },
    };
}

test('Existing account: verify saved customer profile (read-only)', async ({
    page,
}, testInfo) => {
    test.setTimeout(120000);

    if (!EMAIL.trim() || !PASSWORD) {
        throw new Error(
            'Set EPOSE_CUSTOMER_EMAIL and EPOSE_CUSTOMER_PASSWORD before running this test.'
        );
    }

    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: EMAIL, password: PASSWORD });
        await expect(page).toHaveURL(/\/customers/, { timeout: 30000 });
    });

    await test.step('wait for customer app initialization', async () => {
        await assertCustomerFlowNotBlocked(page);
        await assertCustomersListInitReady(page);
    });

    await test.step('open existing customer selection', async () => {
        if (!page.url().includes(EXISTING_CUSTOMER.customerId)) {
            const phonebook = page
                .locator('div')
                .filter({ has: page.getByRole('tablist') });
            const nameEntry = phonebook.getByText(EXISTING_CUSTOMER.name, {
                exact: true,
            });
            await expect(nameEntry).toHaveCount(1, { timeout: 15000 });
            await nameEntry.click({ timeout: 15000 });
        }
        await assertSelectedCustomerReady(
            page,
            EXISTING_CUSTOMER.name,
            EXISTING_CUSTOMER.furigana
        );
        await evidence.attachScreenshot('selected-customer-main');
        await evidence.attachPageHtml('selected-customer-main-dom');
    });

    await test.step('open profile and verify saved fields', async () => {
        const ref = await openCustomerProfileAndVerify(
            page,
            EXISTING_CUSTOMER.name,
            EXISTING_CUSTOMER.furigana,
            evidence
        );
        expect(ref.customerId).toBe(EXISTING_CUSTOMER.customerId);
        expect(ref.name).toBe(EXISTING_CUSTOMER.name);
        expect(ref.furigana).toBe(EXISTING_CUSTOMER.furigana);
    });
});
