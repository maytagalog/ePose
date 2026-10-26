import { test, expect, type TestInfo } from '@playwright/test';
import { login } from '../../utils/login';
import {
    assertCustomerFlowNotBlocked,
    assertCustomersListInitReady,
    CustomerEditPreconditionError,
    CustomerFlowBlockedError,
    editCustomerAndVerifyDetails,
    type CreatedCustomerRef,
    type CustomerFlowEvidence,
} from './customerFlow';

/**
 * Continuation: login → edit one existing customer (no registration / booking / email state).
 *
 * Run once (mutates the customer name and height on staging):
 *   npx playwright test tests/accountRegistration/existingAccountEditCustomer.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

const CONTINUATION_EMAIL = process.env.EPOSE_CUSTOMER_EMAIL ?? '';
const CONTINUATION_PASSWORD = process.env.EPOSE_CUSTOMER_PASSWORD ?? '';

/** Furigana verified from staging profile inspection (2026-10-23). */
const VALIDATION_CUSTOMER: CreatedCustomerRef = {
    name: 'E2E Add Customer 1792753817963',
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

test('Existing account: edit customer and verify profile', async ({
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
                        `[edit-customer precondition] ${err.message}`
                    );
                }
                throw err;
            }
        });

        await test.step('edit customer via shared helper', async () => {
            try {
                const updated = await editCustomerAndVerifyDetails(
                    page,
                    VALIDATION_CUSTOMER,
                    evidence
                );
                expect(updated.customerId).toBe(VALIDATION_CUSTOMER.customerId);
                expect(updated.name).toBe(
                    `${VALIDATION_CUSTOMER.name} Edited`
                );
            } catch (err) {
                if (err instanceof CustomerEditPreconditionError) {
                    throw new Error(
                        `[edit-customer precondition] ${err.message} ` +
                            '(Customer may be missing or already edited.)'
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
