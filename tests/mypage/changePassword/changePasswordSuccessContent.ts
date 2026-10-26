import { expect, type Locator, type Page } from '@playwright/test';
import { ChangePasswordSuccessContentError } from './changePasswordErrors';
import {
    assertMyPageSignedInEmail,
    waitForMyPageReadOnlyReady,
} from '../profile/myPageProfileFlow';

export { ChangePasswordSuccessContentError };

const ACTION_TIMEOUT_MS = 15000;
export const CHANGE_PASSWORD_RETURN_BUTTON_WAIT_MS = 15000;
const SUCCESS_REGION_ATTR = 'data-e2e-change-password-success-region';

export const CHANGE_PASSWORD_SUCCESS_HEADLINE = '新しいパスワードを設定しました。';
export const CHANGE_PASSWORD_SUCCESS_RETURN_BUTTON_LABEL = 'マイページへもどる';

function successRegionMarkerPayload() {
    return {
        headline: CHANGE_PASSWORD_SUCCESS_HEADLINE,
        returnButtonLabel: CHANGE_PASSWORD_SUCCESS_RETURN_BUTTON_LABEL,
        regionAttr: SUCCESS_REGION_ATTR,
    };
}

export async function locateChangePasswordSuccessRegion(page: Page): Promise<Locator> {
    await expect
        .poll(async () => {
            return page.evaluate(({ headline, returnButtonLabel, regionAttr }) => {
                document
                    .querySelectorAll(`[${regionAttr}]`)
                    .forEach((el) => el.removeAttribute(regionAttr));
                const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
                const returnButtons = Array.from(document.querySelectorAll('button')).filter(
                    (b) => norm((b as HTMLElement).innerText || '') === returnButtonLabel
                );
                const hasReturnButton = returnButtons.length > 0;
                const matchesRegion = (el: Element) => {
                    const text = norm((el as HTMLElement).innerText || '');
                    if (!text.includes(headline)) {
                        return false;
                    }
                    if (hasReturnButton && !text.includes(returnButtonLabel)) {
                        return false;
                    }
                    return true;
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
            message: 'Waiting for exactly one innermost Change Password success region',
        })
        .toBe(1);

    return page.locator(`[${SUCCESS_REGION_ATTR}]`);
}

export async function assertChangePasswordSuccessContent(page: Page): Promise<void> {
    const region = await locateChangePasswordSuccessRegion(page);
    await expect(region).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const headline = region.getByText(CHANGE_PASSWORD_SUCCESS_HEADLINE, { exact: true });
    await expect(headline, 'Success headline must appear exactly once in the region').toHaveCount(1);
    await expect(headline).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}

function myPageReadOnlyPathnameFromUrl(url: string): boolean {
    const normalized = new URL(url).pathname.replace(/\/$/, '') || '/';
    return normalized === '/my-page';
}

function pageLevelReturnButton(page: Page) {
    return page.getByRole('button', {
        name: CHANGE_PASSWORD_SUCCESS_RETURN_BUTTON_LABEL,
    });
}

async function clickVerifiedReturnButtonOnce(page: Page): Promise<void> {
    const globalButton = pageLevelReturnButton(page);
    const globalCount = await globalButton.count();
    if (globalCount !== 1) {
        throw new ChangePasswordSuccessContentError(
            `Expected exactly one マイページへもどる on the page before click, got ${globalCount}.`
        );
    }
    await locateChangePasswordSuccessRegion(page);
    const region = page.locator(`[${SUCCESS_REGION_ATTR}]`);
    const regionButton = region.getByRole('button', {
        name: CHANGE_PASSWORD_SUCCESS_RETURN_BUTTON_LABEL,
    });
    const backButton = (await regionButton.count()) === 1 ? regionButton : globalButton;
    await expect(backButton).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(backButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
    await backButton.click();
    await expect(
        page,
        'マイページへもどる must navigate to read-only /my-page (no goto fallback)'
    ).toHaveURL((url) => myPageReadOnlyPathnameFromUrl(url.toString()), {
        timeout: ACTION_TIMEOUT_MS,
    });
}

/**
 * Required success path: headline, visible/enabled マイページへもどる, single click,
 * authenticated My Page readiness, and exact account email. No goto/session bypass.
 */
export async function returnToMyPageAfterPasswordChangeSuccess(
    page: Page,
    expectedEmail: string
): Promise<void> {
    await assertChangePasswordSuccessContent(page);

    const globalButton = pageLevelReturnButton(page);
    try {
        await expect
            .poll(async () => globalButton.count(), {
                timeout: CHANGE_PASSWORD_RETURN_BUTTON_WAIT_MS,
                message: 'マイページへもどる is required on the Change Password success screen',
            })
            .toBe(1);
    } catch (cause) {
        throw new ChangePasswordSuccessContentError(
            'マイページへもどる is required on the Change Password success screen.',
            { cause }
        );
    }

    const count = await globalButton.count();
    if (count !== 1) {
        throw new ChangePasswordSuccessContentError(
            `Expected exactly one マイページへもどる, got ${count}.`
        );
    }

    await clickVerifiedReturnButtonOnce(page);
    await waitForMyPageReadOnlyReady(page);
    await assertMyPageSignedInEmail(page, expectedEmail);
}
