import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
    assertChangeEmailSuccessContent,
    CHANGE_EMAIL_SUCCESS_HEADLINE,
    CHANGE_EMAIL_SUCCESS_LOGIN_PREFIX,
    CHANGE_EMAIL_SUCCESS_LOGIN_SUFFIX,
    CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL,
    ChangeEmailSuccessContentError,
    expectedChangeEmailSuccessLoginInstructionText,
    locateChangeEmailSuccessRegion,
} from './changeEmailSuccessContent';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const SUCCESS_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailSuccessContent.html'),
    'utf8'
);

test('success region: separate headline and login line with button in container', async ({ page }) => {
    await page.setContent(SUCCESS_HTML);
    const ancestorMatchCount = await page.evaluate(
        ({ headline, loginPrefix, loginSuffix, returnButtonLabel }) => {
            const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
            const matchesRegion = (el: Element) => {
                const text = norm((el as HTMLElement).innerText || '');
                return (
                    text.includes(headline) &&
                    text.includes(loginPrefix) &&
                    text.includes(loginSuffix) &&
                    text.includes(returnButtonLabel)
                );
            };
            return Array.from(document.querySelectorAll('div')).filter(matchesRegion).length;
        },
        {
            headline: CHANGE_EMAIL_SUCCESS_HEADLINE,
            loginPrefix: CHANGE_EMAIL_SUCCESS_LOGIN_PREFIX,
            loginSuffix: CHANGE_EMAIL_SUCCESS_LOGIN_SUFFIX,
            returnButtonLabel: CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL,
        }
    );
    expect(ancestorMatchCount).toBeGreaterThan(1);
    await assertChangeEmailSuccessContent(page, 'user.two.dot@example.com');
    const region = await locateChangeEmailSuccessRegion(page);
    const regionText = await region.innerText();
    expect(regionText).toContain(CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL);
    expect(normalize(regionText)).not.toBe(
        expectedCombinedWithoutButton('user.two.dot@example.com')
    );
});

function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

function expectedCombinedWithoutButton(email: string): string {
    return normalize(
        `${CHANGE_EMAIL_SUCCESS_HEADLINE} ${expectedChangeEmailSuccessLoginInstructionText(email)}`
    );
}

test('success region: different target fails', async ({ page }) => {
    await page.setContent(SUCCESS_HTML);
    await expect(
        assertChangeEmailSuccessContent(page, 'other.two.dot@example.com')
    ).rejects.toThrow(ChangeEmailSuccessContentError);
});

test('expectedChangeEmailSuccessLoginInstructionText is exact login line', () => {
    expect(expectedChangeEmailSuccessLoginInstructionText('a@b.com')).toBe(
        '次回ログインより、a@b.com をお使いください。'
    );
});
