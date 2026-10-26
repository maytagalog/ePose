import { test, type TestInfo } from '@playwright/test';
import { login } from '../../../utils/login';
import { type CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import { runUpdateCompanyInformationAndVerify } from './companyInformationFlow';
import type { SmokeAccountRef } from '../../mypage/changeEmail/myPageChangeEmailFlow';

/**
 * Continuation: login → Settings company information update only.
 *
 * Permanently changes company name / telephone / address fields on staging when successful.
 *
 * Required env (not hardcoded):
 *   EPOSE_COMPANY_INFO_EMAIL
 *   EPOSE_COMPANY_INFO_PASSWORD
 *
 * Example after latest password change (do not commit secrets):
 *   a.ardvar.komonstrosesquip1230000@gmail.com / Password123
 *
 * Run:
 *   EPOSE_COMPANY_INFO_EMAIL='...' \\
 *   EPOSE_COMPANY_INFO_PASSWORD='...' \\
 *     npx playwright test tests/settings/companyInformation/existingAccountCompanyInformation.spec.ts --workers=1
 */
test.describe.configure({ retries: 0 });

test.use({
    trace: 'on',
    actionTimeout: 15000,
    navigationTimeout: 30000,
});

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing ${name} for company information continuation.`);
    }
    return value;
}

function createEvidence(
    page: import('@playwright/test').Page,
    testInfo: TestInfo
): CustomerFlowEvidence {
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
            if (html) {
                await testInfo.attach(name, {
                    body: html,
                    contentType: 'text/html',
                });
            }
        },
    };
}

test('Existing account: Settings Update Company Information', async ({ page }, testInfo) => {
    test.setTimeout(600000);

    const email = requireEnv('EPOSE_COMPANY_INFO_EMAIL');
    const password = requireEnv('EPOSE_COMPANY_INFO_PASSWORD');
    const account: SmokeAccountRef = { email, password };
    const evidence = createEvidence(page, testInfo);

    await test.step('login', async () => {
        await login(page, { email: account.email, password: account.password });
        await page.waitForURL(/\/customers/, { timeout: 30000 });
    });

    await runUpdateCompanyInformationAndVerify(page, account, evidence);
});
