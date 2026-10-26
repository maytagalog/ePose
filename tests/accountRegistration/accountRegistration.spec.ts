import { test } from '@playwright/test';
import { login } from '../../utils/login';
import {
    addCustomerAndVerifyDetails,
    generateUniqueCustomerName,
    generateUniqueFurigana,
} from './customerFlow';

test('account register', async ({ page }) => {
    const name = generateUniqueCustomerName('Phaeton Test');
    const furigana = generateUniqueFurigana('フェトンテスト');

    test.setTimeout(1200000);

    const email = process.env.EPOSE_CUSTOMER_EMAIL ?? '';
    const password = process.env.EPOSE_CUSTOMER_PASSWORD ?? '';

    if (!email.trim() || !password) {
        throw new Error(
           'Set EPOSE_CUSTOMER_EMAIL and EPOSE_CUSTOMER_PASSWORD before running this test.'
        );
    }

await login(page, { email, password });

    await addCustomerAndVerifyDetails(page, name, furigana);
});
