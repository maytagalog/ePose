import { expect, type Locator, type Page } from '@playwright/test';

export class ChangeEmailSuccessContentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChangeEmailSuccessContentError';
    }
}

const ACTION_TIMEOUT_MS = 15000;
const SUCCESS_REGION_ATTR = 'data-e2e-change-email-success-region';

export const CHANGE_EMAIL_SUCCESS_HEADLINE = '新しいメールアドレスを設定しました。';
export const CHANGE_EMAIL_SUCCESS_LOGIN_PREFIX = '次回ログインより、';
export const CHANGE_EMAIL_SUCCESS_LOGIN_SUFFIX = ' をお使いください。';
export const CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL = 'マイページへもどる';

export function normalizeChangeEmailSuccessBlockText(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
}

export function expectedChangeEmailSuccessLoginInstructionText(targetEmail: string): string {
    return normalizeChangeEmailSuccessBlockText(
        `${CHANGE_EMAIL_SUCCESS_LOGIN_PREFIX}${targetEmail}${CHANGE_EMAIL_SUCCESS_LOGIN_SUFFIX}`
    );
}

/** @deprecated Combined block included button text in container innerText; use scoped assertions. */
export function expectedChangeEmailSuccessContentText(targetEmail: string): string {
    return normalizeChangeEmailSuccessBlockText(
        `${CHANGE_EMAIL_SUCCESS_HEADLINE}\n${CHANGE_EMAIL_SUCCESS_LOGIN_PREFIX}${targetEmail}${CHANGE_EMAIL_SUCCESS_LOGIN_SUFFIX}`
    );
}

function successRegionMarkerPayload() {
    return {
        headline: CHANGE_EMAIL_SUCCESS_HEADLINE,
        loginPrefix: CHANGE_EMAIL_SUCCESS_LOGIN_PREFIX,
        loginSuffix: CHANGE_EMAIL_SUCCESS_LOGIN_SUFFIX,
        returnButtonLabel: CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL,
        regionAttr: SUCCESS_REGION_ATTR,
    };
}

/**
 * Marks the innermost success region (headline + login instruction + return button).
 * Does not assert message-only innerText (region includes the button label).
 */
export async function locateChangeEmailSuccessRegion(page: Page): Promise<Locator> {
    await expect
        .poll(async () => {
            return page.evaluate(({ headline, loginPrefix, loginSuffix, returnButtonLabel, regionAttr }) => {
                document
                    .querySelectorAll(`[${regionAttr}]`)
                    .forEach((el) => el.removeAttribute(regionAttr));
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
                const matching = Array.from(document.querySelectorAll('div')).filter(matchesRegion);
                const innermost = matching.filter(
                    (div) => !matching.some((other) => other !== div && div.contains(other))
                );
                if (innermost.length !== 1) {
                    return innermost.length;
                }
                innermost[0]!.setAttribute(regionAttr, '');
                return 1;
            }, successRegionMarkerPayload());
        }, {
            timeout: ACTION_TIMEOUT_MS,
            message: 'Waiting for exactly one innermost Change Email success region',
        })
        .toBe(1);

    return page.locator(`[${SUCCESS_REGION_ATTR}]`);
}

export async function assertChangeEmailSuccessContent(
    page: Page,
    targetEmail: string
): Promise<void> {
    const region = await locateChangeEmailSuccessRegion(page);
    await expect(region).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const headline = region.getByText(CHANGE_EMAIL_SUCCESS_HEADLINE, { exact: true });
    await expect(headline, 'Success headline must appear exactly once in the region').toHaveCount(1);
    await expect(headline).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const loginInstruction = expectedChangeEmailSuccessLoginInstructionText(targetEmail);
    const loginLine = region.getByText(loginInstruction, { exact: true });
    const loginLineCount = await loginLine.count();
    if (loginLineCount !== 1) {
        throw new ChangeEmailSuccessContentError(
            'Next-login instruction must match the expected target email exactly.'
        );
    }
    await expect(loginLine).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const returnButton = region.getByRole('button', { name: CHANGE_EMAIL_SUCCESS_RETURN_BUTTON_LABEL });
    await expect(returnButton).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(returnButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
}
