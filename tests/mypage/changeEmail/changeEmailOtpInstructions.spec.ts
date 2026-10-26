import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import {
    assertChangeEmailOtpInstructionsContainer,
    CHANGE_EMAIL_OTP_INSTRUCTION_INFIX,
    CHANGE_EMAIL_OTP_UI_VALIDITY_COPY,
    expectedChangeEmailOtpInstructionText,
    queryInnermostOtpInstructionContainer,
    ChangeEmailOtpInstructionError,
} from './changeEmailOtpInstructions';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const INSTRUCTIONS_HTML = fs.readFileSync(
    path.join(e2eFixturesDir, 'changeEmailOtpInstructions.html'),
    'utf8'
);

test('OTP instructions container: matching target passes', async ({ page }) => {
    await page.setContent(INSTRUCTIONS_HTML);
    const ancestorMatchCount = await page.evaluate(
        ({ infix, validity }) => {
            const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
            const matchesBoth = (el: Element) => {
                const text = norm((el as HTMLElement).innerText || '');
                return text.includes(infix) && text.includes(validity);
            };
            return Array.from(document.querySelectorAll('div')).filter(matchesBoth).length;
        },
        {
            infix: CHANGE_EMAIL_OTP_INSTRUCTION_INFIX,
            validity: CHANGE_EMAIL_OTP_UI_VALIDITY_COPY,
        }
    );
    expect(ancestorMatchCount).toBe(6);
    const innermost = await queryInnermostOtpInstructionContainer(page);
    expect(innermost.count).toBe(1);
    expect(innermost.visible).toBe(true);
    await assertChangeEmailOtpInstructionsContainer(page, 'user.two.dot@example.com');
});

test('OTP instructions container: different target fails', async ({ page }) => {
    await page.setContent(INSTRUCTIONS_HTML);
    await expect(
        assertChangeEmailOtpInstructionsContainer(page, 'other.two.dot@example.com')
    ).rejects.toThrow(ChangeEmailOtpInstructionError);
});

test('expectedChangeEmailOtpInstructionText normalizes combined copy', () => {
    expect(expectedChangeEmailOtpInstructionText('a@b.com')).toBe(
        'a@b.comに送信された確認コードを、下記のフォームに入力してください。 確認コードの有効時間は24時間です。'
    );
});
