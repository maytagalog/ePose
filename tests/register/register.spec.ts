import { test, expect } from '@playwright/test';
import { waitForEmail } from '../../utils/gmail';

test('check default page on load', async ({ page }) => {
    // goes to the specified page
    await page.goto('https://app-stg.epose.com/application/start');

    // gets all favicon related elements
    const iconUrls = await page.evaluate(() => {
        const selectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="apple-touch-icon"]'
        ];

        // return values as array
        return Array.from(
            document.querySelectorAll<HTMLLinkElement>(selectors.join(',')),
            link => link.href
        );
    });

    // checks if the length of the returned array is not empty
    await expect(iconUrls.length).toBeGreaterThan(0);

    // checks page title
    await expect(page).toHaveTitle('ePose');

    // checks the current language. JA(Japanese) should be the only active text
    await expect(page.getByText('JA')).toHaveClass('active')
    await expect(page.getByText('EN')).toHaveClass('')

    //await expect(page.getByRole('checkbox').isChecked()).toBe(false);
});

test('register', async ({ page }) => {
    test.setTimeout(650000);

    let EMAIL_CODE = 0;
    let EMAIL_VERIFICATION_URL = '';

    //move the dot since register only accepts a unique email
    //new email every test;must not be a registered email
    const EMAIL = `l.l.a.nfairpwllgwyngyll.goger111@gmail.com`

    const passwordFields = page.locator('input[type="password"]');

    await page.goto('https://app-stg.epose.com/application/start')

    // fills the email field and checks if the error message appears
    await page.fill('input[type="email"]', EMAIL);
    await page.keyboard.press('Tab');
    // checks if the error message is not visible
    await expect(page.locator('div[data-cy="error-label"]')).toBeHidden();
    // fill the password fields
    await passwordFields.first().fill('qwert6y7u');
    await passwordFields.nth(1).fill('qwert6y7u');

    await page.getByRole('checkbox').click();

    await page.getByRole('button', { name: '入力内容を確認' }).click();

    // Application Confirmation Page
    // checks URL since we are auto navigating this section
    const startConfirmation = await page.url();
    await expect(startConfirmation).toContain('https://app-stg.epose.com/application/start/confirmation');

    await expect(page.getByText('JA')).toHaveClass('active')
    await expect(page.getByText('EN')).toHaveClass('')

    //checks if the current email and password length matches
    //only length is checked since the value is hidden
    await expect(page.getByText(EMAIL)).toBeVisible();
    await expect(page.getByText('●●●●●●●●●')).toBeVisible();

    await expect(page.getByText('送 信')).toBeEnabled();
    await expect(page.getByText('修正する')).toBeEnabled();

    await page.getByText('送 信').click();

    //wait for the page to load
    const applicationSuccess = await page.url();
    await expect(applicationSuccess).toContain('https://app-stg.epose.com/application/start/');

    await page.getByText('メール認証へすすむ').click();

    /****************************************** Email Handling **************************************/

    const emailCheck = await waitForEmail(EMAIL, '認証コードをお送りします');
    //expect email to not be null to confirm existence
    await expect(emailCheck).not.toBeNull();
    //expect email for the following strings to confirm correct email
    await expect(emailCheck?.subject).toContain('認証コードをお送りします');
    await expect(emailCheck?.body).toContain('認証コード');

    //set the fetched emails body OR set it to empty
    await page.setContent(emailCheck?.body || '');

    //checks all divs inside table cells
    const divs = await page.locator('table tr td div');
    const counter = await divs.count();

    //set value as the href(link) value OR set it to empthy
    EMAIL_VERIFICATION_URL = await page.getByText('メール認証ページはこちら').getAttribute('href') || '';

    for (let i = 0; i < counter; i++) {
        const div = divs.nth(i);
        // Evaluate computed styles
        const { color, fontSize, text, fontWeight } = await div.evaluate(el => {
            const style = getComputedStyle(el);
            return {
                color: style.color, // e.g., "rgb(255, 255, 255)"
                fontSize: style.fontSize,       // e.g., "36px"
                fontWeight: style.fontWeight,
                text: el.textContent
            };
        });

        // Filter by color,font size,font weight
        // Not future proof but works for now
        if (
            color === 'rgb(0, 0, 0)' &&
            fontSize === '36px' &&
            fontWeight === '500' &&
            text
        ) {
            EMAIL_CODE = parseFloat(text.replace(/[^\d.]/g, '')); // extract number
        }
    }
    //console.log('EMAIL_CODE:', EMAIL_CODE);

    /************************** Email Verification Page **************************/

    //if the EMAIL_VERIFICATION_URL exists, use the URL else use the specified link
    await page.goto(
        EMAIL_VERIFICATION_URL ?
            EMAIL_VERIFICATION_URL :
            'https://app-stg.epose.com/application/verification'
    );

    // fetch all fields
    const fields = page.locator('input[type="text"]');

    // check if the page is still in Japanese(JA)
    await expect(page.getByText('JA')).toHaveClass('active')
    await expect(page.getByText('EN')).toHaveClass('')

    // check if the email field is visible & disabled
    await expect(fields.first()).toBeVisible();
    await expect(fields.first()).toBeDisabled();
    // check if the code field is visible
    await expect(fields.nth(1)).toBeVisible();
    // check if the submit button is disabled
    await expect(page.getByText('送 信')).toBeDisabled();
    // if the EMAIL_CODE exists, use the value else '00000000'
    await fields.nth(1).fill(`${EMAIL_CODE}` || '00000000');

    //timeout for 100000 before checking the value of the submit button
    await expect(page.getByText('送 信')).toBeEnabled({ timeout: 10000 });

    await page.getByText('送 信').click();

    //fail the test if the error message exists
    if (await page.getByText('認証に失敗しました。ご入力情報をご確認の上、再度ご入力ください。').isVisible()) {
        test.fail();
    }

    //with the URL provided, wait until all dom contents have been loaded
    await page.waitForURL('https://app-stg.epose.com/application/verification*', { waitUntil: "domcontentloaded", timeout: 60000 });

    /************************** Official Registration *********************************************/
    await page.waitForTimeout(60000);
    await page.waitForURL('https://app-stg.epose.com/application/complete*', { waitUntil: "domcontentloaded", timeout: 120000 });

    await expect(page.getByText('JA', { exact: true })).toHaveClass('active')
    await expect(page.getByText('EN', { exact: true })).toHaveClass('')

    await expect(page.getByRole('button', { name: '入力内容を確認' })).toBeDisabled();

    const fieldList = page.getByRole(('textbox'));

    await (fieldList.first().fill('Business'));
    await (fieldList.nth(1).fill('Person'));
    await page.locator('input[name="telephoneNumber"]').fill('09012345678');
    await page.locator('#rc_select_0').click();
    await page.getByRole('option', { name: 'Australia' }).click();
    await (fieldList.nth(4).fill(`New Queensland`));
    await (fieldList.nth(5).fill(`Abbot Street`));

    await expect(page.getByRole('button', { name: '入力内容を確認' })).toBeEnabled()
    await page.getByRole('button', { name: '入力内容を確認' }).click();

    await page.waitForURL('https://app-stg.epose.com/application/complete/confirmation*', { waitUntil: "domcontentloaded", timeout: 50000 });

    await expect(page.getByText('Business')).toBeVisible();
    await expect(page.getByText('Person')).toBeVisible();
    await expect(page.getByText('09012345678')).toBeVisible();
    await expect(page.getByText('Australia')).toBeVisible();
    await expect(page.getByText(`New Queensland`)).toBeVisible();
    await expect(page.getByText(`Abbot Street`)).toBeVisible();

    await page.getByRole('button', { name: '送 信' }).click();

    await page.waitForURL('https://app-stg.epose.com/application/complete/success*', { waitUntil: "domcontentloaded", timeout: 50000 });

    await expect(page.getByText('本登録の申請を受け付けました')).toBeVisible();
});
