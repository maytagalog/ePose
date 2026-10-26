import { test, expect } from '@playwright/test';

test.use({ launchOptions: { slowMo: 0 } });
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    GET_USER_COMPANY_STORE_URL,
    GET_USER_COMPANY_URL,
    assertCompanyCountrySelectionMatchesCode,
    assertCompanyInformationEditPageClosed,
    assertCompanyReadOnlyDisplays,
    assertSettingsAddressCountryBeforePostcode,
    normalizePostalCodeForCountry,
    postalCodesEqualForCountry,
    openCompanyEditCountryDropdown,
    assertCompanyCountryDropdownClosed,
    assertCompanyValuesEqual,
    assertSettingsPageTitleVisible,
    assertSettingsRoute,
    settingsPageTitle,
    COMPANY_BUSINESS_NAME_INVALID_CHARS_MESSAGE,
    COMPANY_BUSINESS_NAME_SMOKE_A,
    COMPANY_BUSINESS_NAME_SMOKE_B,
    companyEditBusinessNameFieldBlock,
    companyEditBusinessNameValidationMessage,
    companyInformationEditContent,
    navigateToSettings,
    openCompanyInformationEdit,
    pickAlternateSmokeBusinessName,
    pickCompanyInformationUpdate,
    pickNextSmokeCountryCode,
    COMPANY_SMOKE_ADDRESS_PROFILES,
    COMPANY_SMOKE_COUNTRY_ROTATION_ORDER,
    COMPANY_SMOKE_EXCLUDED_COUNTRY_CODES,
    isPostalCodeRequiredForCountryCode,
    readCompanyInformationEditForm,
    normalizeCountryIdentity,
    resolveExpectedCountryDisplayName,
    resolveExpectedCountrySelectTitle,
    selectCompanyEditCountryByVisibleOption,
    companyCountrySelectDropdown,
    waitForCompanyEditAddressFieldsClearedAfterCountryChange,
    settingsCompanyReadOnlyAddressLine,
    waitForCompanyEditContentHydrated,
    returnToSettingsReadOnlyFromEdit,
    runUpdateCompanyInformationAndVerify,
    settingsCompanyInformationEditButton,
    settingsCompanyInformationSection,
    waitForSettingsCompanyReadOnlyReady,
    companyValuesFromGetUserCompany,
    companyValuesFromGetUserCompanyStore,
    parseGetUserCompanyReadResponse,
    waitForGetUserCompanyPost,
    type CompanyInformationValues,
    CompanyInformationFlowError,
    CompanyInformationPersistenceError,
} from './companyInformationFlow';
import {
    apiDataToFormValues,
    installCompanyInformationMockBackend,
} from './companyInformationMockBackend';
import { appNavigationMenuDialog, AUTH_PROFILE_URL } from '../../mypage/profile/myPageProfileFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_SETTINGS_URL = `${FIXTURE_ORIGIN}/settings`;

const FIXTURE_BASELINE: CompanyInformationValues = {
    businessName: 'Business',
    telephoneNumber: '09012345678',
    countryCode: 'AU',
    countryTitle: 'Australia',
    postalCode: '',
    stateProvinceRegion: 'New Queensland',
    street: 'Abbot Street',
    buildings: '',
    website: '',
};

const FIXTURE_ACCOUNT = { email: 'user@example.com', password: 'Password123' };

function loadFixture(name: string): string {
    return fs.readFileSync(path.join(e2eFixturesDir, name), 'utf8');
}

async function installFixturePage(page: import('@playwright/test').Page, htmlFile: string): Promise<void> {
    const html = loadFixture(htmlFile);
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
}

function companyReadApiPayload(values: CompanyInformationValues) {
    return {
        organizationName: values.businessName,
        companyPhone: values.telephoneNumber,
        companyWebsite: values.website,
        address: {
            country: values.countryCode,
            postalCode: values.postalCode,
            stateProvinceRegion: values.stateProvinceRegion,
            street: values.street,
            buildings: values.buildings,
        },
    };
}

function companyStoreApiJson(values: CompanyInformationValues) {
    return JSON.stringify(companyReadApiPayload(values));
}

async function routeCompanyStoreAndEditApis(
    page: import('@playwright/test').Page,
    values: CompanyInformationValues,
    editDelayMs = 0
): Promise<void> {
    const body = companyStoreApiJson(values);
    await page.route(GET_USER_COMPANY_STORE_URL, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
    await page.route(GET_USER_COMPANY_URL, async (route) => {
        if (editDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, editDelayMs));
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
}

async function installAuthProfileMock(
    page: import('@playwright/test').Page,
    email: string
): Promise<void> {
    await page.addInitScript((profileUrl) => {
        window.addEventListener('load', () => {
            fetch(profileUrl, { method: 'POST', credentials: 'include' }).catch(() => undefined);
        });
    }, AUTH_PROFILE_URL);
    await page.route(AUTH_PROFILE_URL, async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                email,
                directorFullName: 'Fixture PIC',
                furiganaFullName: 'テスト',
                showingName: 'Fixture Display',
            }),
        });
    });
}

test('navigateToSettings: page title and dialog both 設定 — selects dialog item only', async ({
    page,
}) => {
    await installFixturePage(page, 'settingsNavigationMenu.html');
    await page.route(GET_USER_COMPANY_STORE_URL, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: companyStoreApiJson(FIXTURE_BASELINE),
        });
    });

    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });
    await navigateToSettings(page, { settingsUrl: FIXTURE_SETTINGS_URL });

    expect(await page.evaluate(() => (window as unknown as { __storeFetchCount: number }).__storeFetchCount)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __menuOpenCount: number }).__menuOpenCount)).toBe(1);
    expect(
        await page.evaluate(
            () => (window as unknown as { __settingsNavClickCount: number }).__settingsNavClickCount
        )
    ).toBe(1);
    await expect(appNavigationMenuDialog(page)).toBeHidden();
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
});

test('settings readiness: div page title (not heading) satisfies readiness', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await assertSettingsPageTitleVisible(page);
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toHaveCount(0);
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
});

test('settingsPageTitle: nested title wrapper resolves to one inner element', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await expect(
        page.locator(
            "xpath=//div[normalize-space(.)='設定' and not(ancestor-or-self::*[@role='dialog'])]"
        )
    ).toHaveCount(2);
    await assertSettingsPageTitleVisible(page);
    await expect(settingsPageTitle(page)).toHaveText('設定');
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
});

test('settingsPageTitle: navigation dialog 設定 is excluded from page title', async ({ page }) => {
    const html =
        loadFixture('companyInformationSettings.html').replace(
            '</body>',
            '<div role="dialog" aria-modal="true" id="nav-dialog"><div>設定</div></div></body>'
        );
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await assertSettingsPageTitleVisible(page);
    await expect(page.locator('[role="dialog"]').getByText('設定', { exact: true })).toBeVisible();
});

test('nested wrapper fixture: production company selectors resolve uniquely', async ({ page }) => {
    await installFixturePage(page, 'companyInformationNestedWrappers.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    const section = settingsCompanyInformationSection(page);
    await expect(section).toHaveCount(1);
    await expect(section).toHaveClass(/company-readonly-shell/);
    await expect(section.locator('.company-information-wrapper')).toHaveCount(1);
    await expect(section.locator('#layout-outer, .settings-stack, .plan-block, .display-block')).toHaveCount(
        0
    );
    await expect(section.getByText(FIXTURE_BASELINE.businessName, { exact: true })).toBeVisible();
    await expect(section.locator('.company-information-telephone-number')).toHaveText(
        FIXTURE_BASELINE.telephoneNumber
    );
    const companyEdit = settingsCompanyInformationEditButton(section);
    await expect(companyEdit).toHaveCount(1);
    await expect(companyEdit).toHaveText('編 集');
    await expect(section.getByText('ご契約中のプラン')).toHaveCount(0);
    await expect(section.getByText('表示項目の設定')).toHaveCount(0);
    await expect(
        section.getByRole('button', { name: 'プランの確認・変更はこちら', exact: true })
    ).toHaveCount(0);
    await expect(page.locator('.display-block').getByRole('button', { name: '編集', exact: true })).toHaveCount(
        1
    );
    await openCompanyInformationEdit(page);
    await expect(companyInformationEditContent(page)).toHaveCount(1);
});

test('company edit: delayed get_user_company hydration before baseline read', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE, 350);

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await openCompanyInformationEdit(page);
    const baseline = await readCompanyInformationEditForm(page);
    expect(baseline.businessName).toBe('Business');
    expect(baseline.countryCode).toBe('AU');
    expect(baseline.countryTitle).toBe('Australia');
});

test('resolveExpectedCountrySelectTitle: maps AU ISO to Australia select title', () => {
    expect(resolveExpectedCountrySelectTitle('AU')).toBe('Australia');
    expect(resolveExpectedCountrySelectTitle('Australia')).toBe('Australia');
});

test('normalizeCountryIdentity: AU and Australia normalize to AU', () => {
    expect(normalizeCountryIdentity('AU')).toBe('AU');
    expect(normalizeCountryIdentity('Australia')).toBe('AU');
});

test('assertCompanyValuesEqual: country display label difference with same code passes', () => {
    const base = pickCompanyInformationUpdate(FIXTURE_BASELINE).after;
    const uiAu = { ...base, countryTitle: 'AU' };
    const uiAustralia = { ...base, countryTitle: 'Australia' };
    assertCompanyValuesEqual(uiAustralia, uiAu, 'country-display');
});

test('assertCompanyValuesEqual: different country codes fail', () => {
    const base = pickCompanyInformationUpdate(FIXTURE_BASELINE).after;
    const other = { ...base, countryCode: 'JP', countryTitle: 'Japan' };
    expect(() => assertCompanyValuesEqual(base, other, 'country-mismatch')).toThrow(
        CompanyInformationPersistenceError
    );
});

test('company edit hydration: API AU with UI title Australia passes', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await openCompanyInformationEdit(page);
    const expected = companyValuesFromGetUserCompany(companyReadApiPayload(FIXTURE_BASELINE));
    expect(expected.countryCode).toBe('AU');
    await waitForCompanyEditContentHydrated(page, expected);
});

test('company edit hydration: API AU with UI title AU passes', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    const companyResponse = waitForGetUserCompanyPost(page);
    await settingsCompanyInformationSection(page)
        .locator('button')
        .filter({ hasText: /^編\s*集$/ })
        .click();
    await companyResponse;
    await page
        .locator('#country-select-wrapper .ant-select-selection-item')
        .evaluate((element) => {
            element.setAttribute('title', 'AU');
            element.textContent = 'AU';
        });
    const expected = companyValuesFromGetUserCompany(companyReadApiPayload(FIXTURE_BASELINE));
    await waitForCompanyEditContentHydrated(page, expected);
});

async function openCompanyEditWithoutCountryHydration(
    page: import('@playwright/test').Page
): Promise<import('@playwright/test').Locator> {
    const companyResponse = waitForGetUserCompanyPost(page);
    await settingsCompanyInformationEditButton(settingsCompanyInformationSection(page)).click();
    await companyResponse;
    const editContent = companyInformationEditContent(page);
    await expect(editContent).toHaveCount(1);
    return editContent.locator('#country-select-wrapper .ant-select-selection-item');
}

test('country selection hydration: empty title then AU passes', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    const countryItem = await openCompanyEditWithoutCountryHydration(page);
    await expect(countryItem).toHaveCount(1);
    await countryItem.evaluate((element) => {
        element.removeAttribute('title');
        element.textContent = '';
        window.setTimeout(() => {
            element.setAttribute('title', 'AU');
            element.textContent = 'AU';
        }, 400);
    });
    const displayTitle = await assertCompanyCountrySelectionMatchesCode(countryItem, 'AU', {
        timeout: 5000,
    });
    expect(normalizeCountryIdentity(displayTitle)).toBe('AU');
});

test('country selection hydration: wrong title then expected AU passes', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    const countryItem = await openCompanyEditWithoutCountryHydration(page);
    await expect(countryItem).toHaveCount(1);
    await countryItem.evaluate((element) => {
        element.setAttribute('title', 'Japan');
        element.textContent = 'Japan';
        window.setTimeout(() => {
            element.setAttribute('title', 'Australia');
            element.textContent = 'Australia';
        }, 400);
    });
    await assertCompanyCountrySelectionMatchesCode(countryItem, 'AU', { timeout: 5000 });
});

test('assertCompanyReadOnlyDisplays: staging-like sibling address with full country passes', async ({
    page,
}) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    const section = settingsCompanyInformationSection(page);
    const addressLine = settingsCompanyReadOnlyAddressLine(section);
    await expect(addressLine).toHaveCount(1);
    await assertCompanyReadOnlyDisplays(page, FIXTURE_BASELINE);
    await expect(addressLine).toContainText(resolveExpectedCountryDisplayName('AU'));
});

test('assertCompanyReadOnlyDisplays: missing country display name fails', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await page.evaluate(() => {
        (window as unknown as { __fixtureOmitCountryInSettingsAddress?: boolean }).__fixtureOmitCountryInSettingsAddress =
            true;
        const el = document.getElementById('readonly-address');
        if (el) el.textContent = 'Abbot Street, New Queensland,';
    });
    await expect(assertCompanyReadOnlyDisplays(page, FIXTURE_BASELINE)).rejects.toThrow();
});

test('assertCompanyReadOnlyDisplays: abbreviated ISO country without full name fails', async ({
    page,
}) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await page.evaluate(() => {
        const el = document.getElementById('readonly-address');
        if (el) el.textContent = 'Abbot Street, New Queensland, AU';
    });
    await expect(assertCompanyReadOnlyDisplays(page, FIXTURE_BASELINE)).rejects.toThrow();
});

test('country selection hydration: persistently wrong country fails', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    const countryItem = await openCompanyEditWithoutCountryHydration(page);
    await expect(countryItem).toHaveCount(1);
    await countryItem.evaluate((element) => {
        element.setAttribute('title', 'Japan');
        element.textContent = 'Japan';
    });
    await expect(
        assertCompanyCountrySelectionMatchesCode(countryItem, 'AU', { timeout: 1500 })
    ).rejects.toThrow(CompanyInformationFlowError);
});

test('company edit hydration: API AU with mismatched country UI fails', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    const companyResponse = waitForGetUserCompanyPost(page);
    await settingsCompanyInformationSection(page)
        .locator('button')
        .filter({ hasText: /^編\s*集$/ })
        .click();
    await companyResponse;
    await page
        .locator('#country-select-wrapper .ant-select-selection-item')
        .evaluate((element) => {
            element.setAttribute('title', 'Japan');
            element.textContent = 'Japan';
        });
    const expected = companyValuesFromGetUserCompany(companyReadApiPayload(FIXTURE_BASELINE));
    await expect(waitForCompanyEditContentHydrated(page, expected)).rejects.toThrow(
        CompanyInformationFlowError
    );
});

test('parseGetUserCompanyReadResponse: root-level company payload maps to form values', () => {
    const payload = companyReadApiPayload(FIXTURE_BASELINE);
    const parsed = parseGetUserCompanyReadResponse(payload, 'unit');
    expect(parsed.organizationName).toBe(FIXTURE_BASELINE.businessName);
    const fromCompany = companyValuesFromGetUserCompany(payload);
    const fromStore = companyValuesFromGetUserCompanyStore(payload);
    expect(fromCompany).toEqual(fromStore);
    expect(fromCompany.businessName).toBe(FIXTURE_BASELINE.businessName);
    expect(fromCompany.telephoneNumber).toBe(FIXTURE_BASELINE.telephoneNumber);
    expect(fromCompany.countryCode).toBe('AU');
    expect(fromCompany.countryTitle).toBe('Australia');
});

test('parseGetUserCompanyReadResponse: nested data-only wrapper fails clearly', () => {
    expect(() =>
        parseGetUserCompanyReadResponse({ data: companyReadApiPayload(FIXTURE_BASELINE) }, 'unit')
    ).toThrow(CompanyInformationFlowError);
    expect(() =>
        parseGetUserCompanyReadResponse({ data: companyReadApiPayload(FIXTURE_BASELINE) }, 'unit')
    ).toThrow(/missing organizationName/);
});

test('companyValuesFromGetUserCompany: blank organizationName fails validation', () => {
    expect(() =>
        companyValuesFromGetUserCompany({
            ...companyReadApiPayload(FIXTURE_BASELINE),
            organizationName: '   ',
        })
    ).toThrow(CompanyInformationFlowError);
});

test('runUpdateCompanyInformationAndVerify: mock backend persists update payload', async ({
    page,
}) => {
    test.setTimeout(120000);
    await installFixturePage(page, 'companyInformationSettings.html');
    await installAuthProfileMock(page, FIXTURE_ACCOUNT.email);
    const backend = await installCompanyInformationMockBackend(page, FIXTURE_BASELINE, {
        persistUpdates: true,
    });

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    let getUserCompanyPostCount = 0;
    page.on('request', (request) => {
        if (request.url() === GET_USER_COMPANY_URL && request.method() === 'POST') {
            getUserCompanyPostCount += 1;
        }
    });

    await runUpdateCompanyInformationAndVerify(page, FIXTURE_ACCOUNT, undefined, {
        settingsUrl: FIXTURE_SETTINGS_URL,
    });

    expect(backend.getUpdateCount()).toBe(1);
    expect(getUserCompanyPostCount).toBe(1);
    await assertSettingsRoute(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await assertCompanyInformationEditPageClosed(page);
    const persisted = apiDataToFormValues(backend.getApiData());
    const intent = pickCompanyInformationUpdate(FIXTURE_BASELINE);
    await assertCompanyReadOnlyDisplays(page, intent.after);
    assertCompanyValuesEqual(intent.after, persisted, 'mock-backend-state');
    expect(persisted.countryCode).toBe(intent.after.countryCode);
    expect(persisted.countryTitle).toBe(intent.after.countryTitle);
    expect(persisted.postalCode).toBe(intent.after.postalCode);
    expect(persisted.buildings).toBe(FIXTURE_BASELINE.buildings);
    expect(persisted.website).toBe(FIXTURE_BASELINE.website);

    const lastRequest = backend.getLastUpdateRequest();
    expect(lastRequest?.data.organizationName).toBe(intent.after.businessName);
    expect(lastRequest?.data.companyPhone).toBe(intent.after.telephoneNumber);
    expect(lastRequest?.data.address.street).toBe(intent.after.street);
});

test('runUpdateCompanyInformationAndVerify: non-persisting backend fails persistence verification', async ({
    page,
}) => {
    test.setTimeout(120000);
    await installFixturePage(page, 'companyInformationSettings.html');
    await installAuthProfileMock(page, FIXTURE_ACCOUNT.email);
    await installCompanyInformationMockBackend(page, FIXTURE_BASELINE, {
        persistUpdates: false,
    });

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await expect(
        runUpdateCompanyInformationAndVerify(page, FIXTURE_ACCOUNT, undefined, {
            settingsUrl: FIXTURE_SETTINGS_URL,
        })
    ).rejects.toThrow(CompanyInformationPersistenceError);
});

test('assertCompanyValuesEqual: stale values fail verification', () => {
    const expected = pickCompanyInformationUpdate(FIXTURE_BASELINE).after;
    const stale: CompanyInformationValues = { ...expected, businessName: COMPANY_BUSINESS_NAME_SMOKE_A };
    expect(() => assertCompanyValuesEqual(expected, stale, 'unit')).toThrow(
        CompanyInformationPersistenceError
    );
});

test('pickAlternateSmokeBusinessName: alternates letters-only smoke names', () => {
    expect(pickAlternateSmokeBusinessName('Business')).toBe(COMPANY_BUSINESS_NAME_SMOKE_B);
    expect(pickAlternateSmokeBusinessName(COMPANY_BUSINESS_NAME_SMOKE_B)).toBe(
        COMPANY_BUSINESS_NAME_SMOKE_A
    );
    expect(pickAlternateSmokeBusinessName(COMPANY_BUSINESS_NAME_SMOKE_A)).toBe(
        COMPANY_BUSINESS_NAME_SMOKE_B
    );
});

test('pickNextSmokeCountryCode: deterministic AU → UA → IN → CA rotation', () => {
    expect(pickNextSmokeCountryCode('AU')).toBe('UA');
    expect(pickNextSmokeCountryCode('UA')).toBe('IN');
    expect(pickNextSmokeCountryCode('IN')).toBe('CA');
    expect(pickNextSmokeCountryCode('CA')).toBe('AU');
    expect(COMPANY_SMOKE_COUNTRY_ROTATION_ORDER).not.toContain('US');
    expect(COMPANY_SMOKE_EXCLUDED_COUNTRY_CODES).toContain('US');
});

test('pickCompanyInformationUpdate: rotates country and supplies matching address profile', () => {
    const intent = pickCompanyInformationUpdate(FIXTURE_BASELINE);
    expect(intent.after.businessName).toBe(COMPANY_BUSINESS_NAME_SMOKE_B);
    expect(intent.after.countryCode).toBe('UA');
    expect(intent.after).toMatchObject(COMPANY_SMOKE_ADDRESS_PROFILES.UA);
    expect(intent.after.buildings).toBe(FIXTURE_BASELINE.buildings);
    expect(intent.after.website).toBe(FIXTURE_BASELINE.website);
    expect(intent.after.businessName).not.toBe(FIXTURE_BASELINE.businessName);
    expect(isPostalCodeRequiredForCountryCode(intent.after.countryCode)).toBe(true);
});

test('assertSettingsAddressCountryBeforePostcode: country then postcode passes and wrong order fails', () => {
    const country = resolveExpectedCountryDisplayName('UA');
    assertSettingsAddressCountryBeforePostcode(
        'Khreshchatyk Street, Kyiv, Ukraine 01001',
        country,
        '01001',
        'UA'
    );
    expect(() =>
        assertSettingsAddressCountryBeforePostcode('01001, Kyiv, Ukraine', country, '01001', 'UA')
    ).toThrow(CompanyInformationPersistenceError);
    expect(() =>
        assertSettingsAddressCountryBeforePostcode('Kyiv, Ukraine', country, '01001', 'UA')
    ).toThrow(CompanyInformationPersistenceError);
});

test('postalCodesEqualForCountry: Canada space formatting equivalent; wrong postcode fails', () => {
    expect(postalCodesEqualForCountry('CA', 'K1A 0B1', 'K1A0B1')).toBe(true);
    expect(postalCodesEqualForCountry('CA', 'K1A 0B1', 'K1A 0A1')).toBe(false);
    expect(normalizePostalCodeForCountry('CA', 'k1a 0b1')).toBe('K1A0B1');
    const country = resolveExpectedCountryDisplayName('CA');
    assertSettingsAddressCountryBeforePostcode(
        'Wellington Street, Ontario, Canada K1A0B1',
        country,
        'K1A 0B1',
        'CA'
    );
    expect(() =>
        assertSettingsAddressCountryBeforePostcode(
            'Wellington Street, Ontario, Canada K1A 0A1',
            country,
            'K1A 0B1',
            'CA'
        )
    ).toThrow(CompanyInformationPersistenceError);
});

test('company edit: fixture country dropdown matches staging hooks and selects via search + title', async ({
    page,
}) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await openCompanyInformationEdit(page);
    await openCompanyEditCountryDropdown(page);
    const popup = companyCountrySelectDropdown(page);
    await expect(popup).not.toHaveClass(/ant-select-dropdown-hidden/);
    await expect(popup.getByRole('option', { name: 'United States', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('option', { name: 'Ukraine', exact: true })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await assertCompanyCountryDropdownClosed(page);
    await selectCompanyEditCountryByVisibleOption(page, 'Ukraine');
    await waitForCompanyEditAddressFieldsClearedAfterCountryChange(page, 'UA');
});

test('company edit: country switch clears address fields then refill before save', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await openCompanyInformationEdit(page);
    const intent = pickCompanyInformationUpdate(FIXTURE_BASELINE);
    const editContent = companyInformationEditContent(page);
    await editContent.locator('input[name="businessName"]').fill(intent.after.businessName);
    await editContent.locator('input[name="telephoneNumber"]').fill(intent.after.telephoneNumber);
    await selectCompanyEditCountryByVisibleOption(page, intent.after.countryTitle);
    await waitForCompanyEditAddressFieldsClearedAfterCountryChange(page, intent.after.countryCode);
    await editContent.locator('input[name="postalCode"]').fill(intent.after.postalCode);
    await editContent.locator('input[name="stateProvinceRegion"]').fill(intent.after.stateProvinceRegion);
    await editContent.locator('input[name="street"]').fill(intent.after.street);
    await expect(editContent.locator('.save-button')).toBeEnabled();
});

test('assertCompanyReadOnlyDisplays: Ukraine address shows country then postcode', async ({ page }) => {
    const uaExpectation = {
        ...FIXTURE_BASELINE,
        ...COMPANY_SMOKE_ADDRESS_PROFILES.UA,
        businessName: COMPANY_BUSINESS_NAME_SMOKE_B,
    };
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, uaExpectation);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await assertCompanyReadOnlyDisplays(page, uaExpectation);
});

test('assertCompanyReadOnlyDisplays: missing postcode after country fails for Ukraine', async ({
    page,
}) => {
    const uaExpectation = {
        ...FIXTURE_BASELINE,
        ...COMPANY_SMOKE_ADDRESS_PROFILES.UA,
    };
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, uaExpectation);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await page.evaluate(() => {
        const el = document.getElementById('readonly-address');
        if (el) el.textContent = 'Khreshchatyk Street, Kyiv, Ukraine';
    });
    await expect(assertCompanyReadOnlyDisplays(page, uaExpectation)).rejects.toThrow();
});

test('assertCompanyReadOnlyDisplays: postcode before country fails', async ({ page }) => {
    const uaExpectation = {
        ...FIXTURE_BASELINE,
        ...COMPANY_SMOKE_ADDRESS_PROFILES.UA,
    };
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, uaExpectation);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await page.evaluate(() => {
        (window as unknown as { __fixtureWrongPostcodeOrder?: boolean }).__fixtureWrongPostcodeOrder =
            true;
        const el = document.getElementById('readonly-address');
        if (el) {
            el.textContent = 'Khreshchatyk Street, Kyiv, 01001 Ukraine';
        }
    });
    await expect(assertCompanyReadOnlyDisplays(page, uaExpectation)).rejects.toThrow(
        CompanyInformationPersistenceError
    );
});

test('company edit: digits in business name show field-scoped validation and disable Save', async ({
    page,
}) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await openCompanyInformationEdit(page);
    const editContent = companyInformationEditContent(page);
    const businessNameInput = companyEditBusinessNameFieldBlock(editContent).locator(
        'input[name="businessName"]'
    );
    await businessNameInput.fill('E2E Business Updated');
    const validation = companyEditBusinessNameValidationMessage(editContent);
    await expect(validation).toHaveCount(1);
    await expect(validation).toHaveText(COMPANY_BUSINESS_NAME_INVALID_CHARS_MESSAGE);
    await expect(editContent.locator('.save-button')).toBeDisabled();
});

test('company edit: letters-only business name clears validation and enables Save', async ({
    page,
}) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await openCompanyInformationEdit(page);
    const editContent = companyInformationEditContent(page);
    const businessNameInput = companyEditBusinessNameFieldBlock(editContent).locator(
        'input[name="businessName"]'
    );
    await businessNameInput.fill('E2E Business Updated');
    await expect(companyEditBusinessNameValidationMessage(editContent)).toHaveCount(1);
    await businessNameInput.fill(COMPANY_BUSINESS_NAME_SMOKE_B);
    await expect(companyEditBusinessNameValidationMessage(editContent)).toHaveCount(0);
    await expect(editContent.locator('.save-button')).toBeEnabled();
});

test('waitForSettingsCompanyReadOnlyReady: wrong route fails', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });
    await expect(
        waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL })
    ).rejects.toThrow();
});

test('waitForSettingsCompanyReadOnlyReady: missing company phone section fails', async ({
    page,
}) => {
    const html = loadFixture('companyInformationSettings.html').replace(
        'company-information-telephone-number',
        'missing-phone-marker'
    );
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await expect(
        waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL })
    ).rejects.toThrow();
});

test('settingsPageTitle: duplicate 設定 divs outside dialog fail readiness', async ({ page }) => {
    const html = loadFixture('companyInformationSettings.html').replace(
        '<div class="page-title-wrap"><div id="settings-page-title">設定</div></div>',
        '<div class="page-title-wrap"><div id="settings-page-title-a">設定</div></div><div class="page-title-wrap"><div id="settings-page-title-b">設定</div></div>'
    );
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await expect(
        waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL })
    ).rejects.toThrow(/Expected exactly one Settings page title/);
});

test('company edit: cancel returns to read-only Settings', async ({ page }) => {
    await installFixturePage(page, 'companyInformationSettings.html');
    await routeCompanyStoreAndEditApis(page, FIXTURE_BASELINE);

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await openCompanyInformationEdit(page);
    await returnToSettingsReadOnlyFromEdit(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await assertSettingsRoute(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });
    await expect(page.getByText('会社情報の編集', { exact: true })).toBeHidden();
});
