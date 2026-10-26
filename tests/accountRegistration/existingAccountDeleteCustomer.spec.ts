import { test, expect, type TestInfo } from '@playwright/test';
import { login } from '../../utils/login';
import {
    assertCustomerFlowNotBlocked,
    assertCustomersListInitReady,
    CustomerDeletePreconditionError,
    CustomerDeleteVerificationError,
    CustomerFlowBlockedError,
    deleteCustomerAndVerifyRemoval,
    EDIT_CUSTOMER_UPDATES,
    openCustomerProfileAndVerify,
    type CreatedCustomerRef,
    type CustomerFlowEvidence,
} from './customerFlow';

/**
 * Continuation: login → delete one existing customer (no registration / booking / email state).
 *
 * Permanently removes the validation customer on staging. Run once:
 *   npx playwright test tests/accountRegistration/existingAccountDeleteCustomer.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const CONTINUATION_EMAIL = process.env.EPOSE_CUSTOMER_EMAIL ?? '';
const CONTINUATION_PASSWORD = process.env.EPOSE_CUSTOMER_PASSWORD ?? '';

const VALIDATION_CUSTOMER: CreatedCustomerRef = {
    name: 'E2E Add Customer 1792753817963 Edited',
    furigana: 'テストクウイミソソササ',
    customerId: '8e71de1a-7550-4bf8-8bca-91a90834507d',
};

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

test('Existing account: delete customer and verify removal', async ({
    page,
}, testInfo) => {
    test.setTimeout(600000);

    if (!CONTINUATION_EMAIL.trim() || !CONTINUATION_PASSWORD) {
        throw new Error(
            'Set EPOSE_CUSTOMER_EMAIL and EPOSE_CUSTOMER_PASSWORD before running this test.'
        );
    }

    const evidence = createEvidence(page, testInfo);

    try {
        await test.step('login with default navigation', async () => {
            await login(page, {
                email: CONTINUATION_EMAIL,
                password: CONTINUATION_PASSWORD,
            });
            await expect(page).toHaveURL(/\/customers/, { timeout: 30000 });
        });

        await test.step('reach customer list without blocking overlay', async () => {
            try {
                await assertCustomerFlowNotBlocked(page);
                await assertCustomersListInitReady(page);
            } catch (err) {
                if (err instanceof CustomerFlowBlockedError) {
                    throw new Error(
                        `[delete-customer precondition] ${err.message}`
                    );
                }
                throw err;
            }
        });

        await test.step('verify edited customer profile before delete', async () => {
            await page.goto(
                `https://app-stg.epose.com/customers/${VALIDATION_CUSTOMER.customerId}`,
                { waitUntil: 'domcontentloaded' }
            );
            await openCustomerProfileAndVerify(
                page,
                VALIDATION_CUSTOMER.name,
                VALIDATION_CUSTOMER.furigana,
                evidence,
                { heightDisplay: EDIT_CUSTOMER_UPDATES.heightDisplay }
            );
        });

        await test.step('delete customer via shared helper', async () => {
            try {
                await deleteCustomerAndVerifyRemoval(
                    page,
                    VALIDATION_CUSTOMER,
                    evidence
                );
            } catch (err) {
                if (err instanceof CustomerDeletePreconditionError) {
                    throw new Error(
                        `[delete-customer precondition] ${err.message}`
                    );
                }
                if (err instanceof CustomerDeleteVerificationError) {
                    throw new Error(
                        `[delete-customer verification] ${err.message}`
                    );
                }
                throw err;
            }
        });
    } catch (err) {
        await evidence.attachScreenshot('failure-state');
        await evidence.attachPageHtml('failure-state-dom');
        throw err;
    }
});
