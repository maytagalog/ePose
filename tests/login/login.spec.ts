import { test } from '@playwright/test';
import { login } from "../../utils/login";
// initial
test('login', async ({ page }) => {
   await login(page)
});