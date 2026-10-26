import { expect, type Page } from '@playwright/test';

export class ChangeEmailOtpInstructionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChangeEmailOtpInstructionError';
    }
}

const ACTION_TIMEOUT_MS = 15000;

/** Verified staging OTP confirmation UI (single instructions div + line break). */
export const CHANGE_EMAIL_OTP_INSTRUCTION_INFIX =
    'に送信された確認コードを、下記のフォームに入力してください。';

/**
 * Staging OTP confirmation UI copy (Playwright error-context snapshot).
 * UI-stated validity only — not proof of backend TTL or cross-session resumability.
 */
export const CHANGE_EMAIL_OTP_UI_VALIDITY_COPY = '確認コードの有効時間は24時間です。';

export function normalizeOtpInstructionBlockText(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
}

export function expectedChangeEmailOtpInstructionText(targetEmail: string): string {
    return normalizeOtpInstructionBlockText(
        `${targetEmail}${CHANGE_EMAIL_OTP_INSTRUCTION_INFIX}\n${CHANGE_EMAIL_OTP_UI_VALIDITY_COPY}`
    );
}

export type InnermostOtpInstructionSnapshot = {
    count: number;
    normalizedText: string | null;
    visible: boolean;
};

function instructionMatchPayload() {
    return {
        infix: CHANGE_EMAIL_OTP_INSTRUCTION_INFIX,
        validity: CHANGE_EMAIL_OTP_UI_VALIDITY_COPY,
    };
}

/**
 * Innermost div whose text includes both instruction phrases — excludes ancestor wrappers
 * that also match because they contain a nested instructions div.
 */
export async function queryInnermostOtpInstructionContainer(
    page: Page
): Promise<InnermostOtpInstructionSnapshot> {
    return page.evaluate(({ infix, validity }) => {
        const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
        const matchesBoth = (el: Element) => {
            const text = norm((el as HTMLElement).innerText || '');
            return text.includes(infix) && text.includes(validity);
        };
        const matchingDivs = Array.from(document.querySelectorAll('div')).filter(matchesBoth);
        const innermost = matchingDivs.filter(
            (div) => !matchingDivs.some((other) => other !== div && div.contains(other))
        );
        const isVisible = (el: HTMLElement) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };
        if (innermost.length !== 1) {
            return {
                count: innermost.length,
                normalizedText: innermost[0] ? norm(innermost[0].innerText) : null,
                visible: innermost[0] ? isVisible(innermost[0] as HTMLElement) : false,
            };
        }
        const el = innermost[0] as HTMLElement;
        return {
            count: 1,
            normalizedText: norm(el.innerText),
            visible: isVisible(el),
        };
    }, instructionMatchPayload());
}

export async function assertChangeEmailOtpInstructionsContainer(
    page: Page,
    pendingTargetEmail: string
): Promise<void> {
    const expected = expectedChangeEmailOtpInstructionText(pendingTargetEmail);
    await expect
        .poll(async () => {
            const snapshot = await queryInnermostOtpInstructionContainer(page);
            return snapshot.count === 1 && snapshot.visible;
        }, {
            timeout: ACTION_TIMEOUT_MS,
            message: 'Waiting for exactly one visible innermost OTP instruction container',
        })
        .toBe(true);

    const snapshot = await queryInnermostOtpInstructionContainer(page);
    if (snapshot.count !== 1) {
        throw new ChangeEmailOtpInstructionError(
            `Expected exactly one innermost OTP instruction container, found ${snapshot.count}.`
        );
    }
    if (!snapshot.visible) {
        throw new ChangeEmailOtpInstructionError('OTP instruction container is not visible.');
    }
    if (snapshot.normalizedText !== expected) {
        throw new ChangeEmailOtpInstructionError(
            'OTP instruction block text does not match the pending target email and verified copy.'
        );
    }
}
