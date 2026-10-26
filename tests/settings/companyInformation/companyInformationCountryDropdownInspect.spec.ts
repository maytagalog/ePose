import { test } from '@playwright/test';
import { login } from '../../../utils/login';
import {
    STG_SETTINGS_URL,
    companyInformationEditContent,
    settingsCompanyInformationEditButton,
    settingsCompanyInformationSection,
    waitForSettingsCompanyReadOnlyReady,
} from './companyInformationFlow';

/**
 * Read-only staging DOM inspection for country dropdown (no select, no save).
 * Run: npx playwright test tests/settings/companyInformation/companyInformationCountryDropdownInspect.spec.ts --workers=1
 */
test.describe.configure({ mode: 'serial', retries: 0 });

test('inspect staging country dropdown DOM (read-only)', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await login(page);
    await page.goto(STG_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page);

    const section = settingsCompanyInformationSection(page);
    await settingsCompanyInformationEditButton(section).click();
    await page.getByText('会社情報の編集', { exact: true }).waitFor({ timeout: 30000 });
    const editContent = companyInformationEditContent(page);
    await editContent.waitFor({ state: 'visible', timeout: 30000 });

    const wrapper = editContent.locator('#country-select-wrapper');
    await wrapper.locator('.ant-select-selector').click();
    await page.waitForTimeout(1500);

    const report: Record<string, unknown> = await page.evaluate(() => {
        const wrapperEl = document.getElementById('country-select-wrapper');
        const popups = Array.from(document.querySelectorAll('.country-select-popup'));
        const describe = (el: Element) => ({
            tag: el.tagName,
            id: el.id,
            className: el.className,
            hidden: (el as HTMLElement).hidden,
            ariaHidden: el.getAttribute('aria-hidden'),
            role: el.getAttribute('role'),
            display: getComputedStyle(el).display,
            visibility: getComputedStyle(el).visibility,
            parentId: el.parentElement?.id ?? null,
        });
        const options = Array.from(
            document.querySelectorAll('.country-select-popup .ant-select-item-option')
        ).slice(0, 10);
        const optionDetails = options.map((opt) => ({
            className: opt.className,
            role: opt.getAttribute('role'),
            ariaSelected: opt.getAttribute('aria-selected'),
            ariaLabel: opt.getAttribute('aria-label'),
            title: opt.getAttribute('title'),
            text: opt.textContent?.trim(),
            contentText: opt.querySelector('.ant-select-item-option-content')?.textContent?.trim(),
        }));
        const roleOptions = Array.from(document.querySelectorAll('[role="option"]'))
            .slice(0, 15)
            .map((opt) => ({
                text: opt.textContent?.trim().slice(0, 80),
                className: opt.className,
                inCountryPopup: !!opt.closest('.country-select-popup'),
                display: getComputedStyle(opt).display,
                ariaHidden: opt.getAttribute('aria-hidden'),
            }));
        return {
            wrapper: wrapperEl ? describe(wrapperEl) : null,
            popups: popups.map(describe),
            popupCount: popups.length,
            totalOptionsInPopup: document.querySelectorAll(
                '.country-select-popup .ant-select-item-option'
            ).length,
            optionDetails,
            roleOptions,
            hasVirtualList: !!document.querySelector('.country-select-popup .rc-virtual-list'),
            selectionTitle: wrapperEl
                ?.querySelector('.ant-select-selection-item')
                ?.getAttribute('title'),
        };
    });

    const popup = page.locator('#country-select-wrapper .country-select-popup');
    report.searchInputs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#country-select-wrapper input')).map((input) => ({
            type: input.getAttribute('type'),
            className: input.className,
            ariaControls: input.getAttribute('aria-controls'),
            ariaExpanded: input.getAttribute('aria-expanded'),
            placeholder: input.getAttribute('placeholder'),
        }))
    );

    report.locatorProbe = {
        popupVisible: await popup.isVisible(),
        hasHiddenDropdownClass: await popup.evaluate((el) =>
            el.classList.contains('ant-select-dropdown-hidden')
        ),
        ukraineRoleInPopup: await popup.getByRole('option', { name: 'Ukraine', exact: true }).count(),
        ukraineContentInPopup: await popup
            .locator('.ant-select-item-option-content')
            .filter({ hasText: /^Ukraine$/ })
            .count(),
    };

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    report.afterEscape = await page.evaluate(() => {
        const el = document.querySelector('#country-select-wrapper .country-select-popup');
        if (!el) {
            return { missing: true };
        }
        return {
            className: el.className,
            ariaHidden: el.getAttribute('aria-hidden'),
            display: getComputedStyle(el).display,
            hidden: (el as HTMLElement).hidden,
        };
    });

    await testInfo.attach('country-dropdown-staging-dom', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
    });
    console.log('COUNTRY_DROPDOWN_STAGING_DOM', JSON.stringify(report, null, 2));
});
