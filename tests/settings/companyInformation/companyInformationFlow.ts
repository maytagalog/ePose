import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CustomerFlowEvidence } from '../../accountRegistration/customerFlow';
import type { SmokeAccountRef } from '../../mypage/changeEmail/myPageChangeEmailFlow';
import {
    appNavigationMenuDialog,
    waitForAuthProfilePost,
} from '../../mypage/profile/myPageProfileFlow';

const ACTION_TIMEOUT_MS = 15000;
const COMPANY_HYDRATION_TIMEOUT_MS = 30000;

/** Verified staging routes (bundle SETTINGS + SetCompanyInfoForm, 2026-10-24). */
export const STG_SETTINGS_URL = 'https://app-stg.epose.com/settings';
export const STG_SETTINGS_COMPANY_EDIT_URL =
    'https://app-stg.epose.com/settings/company-information';

/** Read-only Settings (SettingsPage.tsx → useGetUserCompanyStoreDetails). */
export const GET_USER_COMPANY_STORE_URL =
    'https://api-stg.epose.com/menu/get_user_company_store';
/** Company edit route (CompanyInfoPage.tsx → useGetCompanyInfo). */
export const GET_USER_COMPANY_URL = 'https://api-stg.epose.com/menu/get_user_company';
export const UPDATE_COMPANY_URL = 'https://api-stg.epose.com/menu/update_company';

export const SETTINGS_PAGE_TITLE = '設定';
export const SETTINGS_COMPANY_SECTION_TITLE = '会社情報';
export const SETTINGS_COMPANY_EDIT_TITLE = '会社情報の編集';
/** Staging DOM may expose「編集」or「編 集」(internal space); XPath normalize-space does not merge those. */
export const COMPANY_EDIT_BUTTON_NAME_PATTERN = /^編\s*集$/;
export const COMPANY_UPDATE_SUCCESS_TOAST = 'ステータスが正常に更新されました';

export const COMPANY_FORM_LABEL_BUSINESS_NAME = '事業者（店舗）名';
export const COMPANY_FORM_LABEL_TELEPHONE = '電話番号';
export const COMPANY_FORM_LABEL_WEBSITE = 'WebサイトURL';
export const COMPANY_FORM_LABEL_POSTAL_CODE = '郵便番号';
export const COMPANY_FORM_LABEL_STREET = '番地';
export const COMPANY_FORM_LABEL_BUILDINGS = '建物など';
/** Staging snapshot: Save control accessible name may be「保存」or「保 存」. */
export const COMPANY_SAVE_BUTTON_NAME_PATTERN = /^保\s*存$/;
/** Letters-only smoke alternates (live trace: digits in business name trigger validation and disable Save). */
export const COMPANY_BUSINESS_NAME_SMOKE_A = 'SmokeBusiness';
export const COMPANY_BUSINESS_NAME_SMOKE_B = 'SmokeBusinessUpdated';
/** Observed on business-name field when disallowed characters (e.g. digits) are present. */
export const COMPANY_BUSINESS_NAME_INVALID_CHARS_MESSAGE = '利用できない文字が含まれています。';

export type CompanyInformationValues = {
    businessName: string;
    telephoneNumber: string;
    /** Canonical ISO2 country code (e.g. AU). Used for identity checks. */
    countryCode: string;
    /** Selected country display from UI title or API-derived label (Australia vs AU). */
    countryTitle: string;
    postalCode: string;
    stateProvinceRegion: string;
    street: string;
    buildings: string;
    website: string;
};

export type CompanyInformationUpdateIntent = {
    before: CompanyInformationValues;
    after: CompanyInformationValues;
};

export type CompanyInformationFlowOptions = {
    /** Test seam: fixture origin settings URL (production default STG_SETTINGS_URL). */
    settingsUrl?: string;
};

export class CompanyInformationFlowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CompanyInformationFlowError';
    }
}

export class CompanyInformationPersistenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CompanyInformationPersistenceError';
    }
}

/**
 * Bundle (CountrySelect.tsx, 2026-10-24): options load from API; labels are English `name`
 * (Japan renders as `Japan(日本)`). Smoke rotation excludes United States.
 */
const COUNTRY_ISO_TO_SELECT_TITLE: Record<string, string> = {
    AU: 'Australia',
    CA: 'Canada',
    IN: 'India',
    UA: 'Ukraine',
    JP: 'Japan',
    ID: 'Indonesia',
};

const COUNTRY_SELECT_TITLE_TO_ISO: Record<string, string> = {
    Australia: 'AU',
    Canada: 'CA',
    India: 'IN',
    Ukraine: 'UA',
    Japan: 'JP',
    Indonesia: 'ID',
};

/** Bundle: COUNTRIES_REQUIRING_POSTAL_CODE = ["US","CA","UA","IN"]. US excluded from smoke. */
export const COMPANY_COUNTRIES_REQUIRING_POSTAL_CODE = ['US', 'CA', 'UA', 'IN'] as const;

export const COMPANY_SMOKE_EXCLUDED_COUNTRY_CODES = ['US'] as const;

/** Deterministic country rotation for smoke (excludes US). */
export const COMPANY_SMOKE_COUNTRY_ROTATION_ORDER = ['AU', 'UA', 'IN', 'CA'] as const;

export type CompanySmokeCountryCode = (typeof COMPANY_SMOKE_COUNTRY_ROTATION_ORDER)[number];

export type CompanySmokeAddressProfile = Pick<
    CompanyInformationValues,
    'countryCode' | 'countryTitle' | 'postalCode' | 'stateProvinceRegion' | 'street'
>;

/** Verified against bundle POSTCODE_REGEXES (UA/IN/CA) and product copy referencing these countries. */
export const COMPANY_SMOKE_ADDRESS_PROFILES: Record<CompanySmokeCountryCode, CompanySmokeAddressProfile> =
    {
        AU: {
            countryCode: 'AU',
            countryTitle: 'Australia',
            postalCode: '',
            stateProvinceRegion: 'New Queensland',
            street: 'Abbot Street',
        },
        UA: {
            countryCode: 'UA',
            countryTitle: 'Ukraine',
            postalCode: '01001',
            stateProvinceRegion: 'Kyiv',
            street: 'Khreshchatyk Street',
        },
        IN: {
            countryCode: 'IN',
            countryTitle: 'India',
            postalCode: '110001',
            stateProvinceRegion: 'Delhi',
            street: 'Janpath Road',
        },
        CA: {
            countryCode: 'CA',
            countryTitle: 'Canada',
            postalCode: 'K1A 0B1',
            stateProvinceRegion: 'Ontario',
            street: 'Wellington Street',
        },
    };

export function isPostalCodeRequiredForCountryCode(countryCode: string): boolean {
    const code = normalizeCountryIdentity(countryCode);
    if (!code) {
        return false;
    }
    return (COMPANY_COUNTRIES_REQUIRING_POSTAL_CODE as readonly string[]).includes(code);
}

export function isCompanySmokeExcludedCountryCode(countryCode: string): boolean {
    const code = normalizeCountryIdentity(countryCode);
    return (COMPANY_SMOKE_EXCLUDED_COUNTRY_CODES as readonly string[]).includes(code);
}

export function pickNextSmokeCountryCode(currentCountryCode: string): CompanySmokeCountryCode {
    const current = normalizeCountryIdentity(currentCountryCode);
    if (isCompanySmokeExcludedCountryCode(current)) {
        throw new CompanyInformationFlowError(
            `Cannot rotate smoke country from excluded code ${JSON.stringify(current)}.`
        );
    }
    const order = COMPANY_SMOKE_COUNTRY_ROTATION_ORDER;
    const idx = order.indexOf(current as CompanySmokeCountryCode);
    if (idx >= 0) {
        return order[(idx + 1) % order.length];
    }
    const fallback = order.find((code) => code !== current);
    return fallback ?? order[0];
}

export function smokeAddressProfileForCountryCode(
    countryCode: string,
    options?: { alternateAuRegionStreet?: boolean }
): CompanySmokeAddressProfile {
    const code = normalizeCountryIdentity(countryCode) as CompanySmokeCountryCode;
    const base = COMPANY_SMOKE_ADDRESS_PROFILES[code];
    if (!base) {
        throw new CompanyInformationFlowError(
            `No smoke address profile for country code ${JSON.stringify(countryCode)}.`
        );
    }
    if (code !== 'AU' || !options?.alternateAuRegionStreet) {
        return { ...base };
    }
    return {
        ...base,
        stateProvinceRegion:
            base.stateProvinceRegion === 'New Queensland' ? 'Brisbane City' : 'New Queensland',
        street: base.street === 'Abbot Street' ? 'George Street' : 'Abbot Street',
    };
}

export function normalizeSettingsAddressDisplayText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/** Staging POSTCODE_REGEXES: Canada allows optional space (e.g. K1A 0B1 vs K1A0B1). */
export function normalizePostalCodeForCountry(countryCode: string, postalCode: string): string {
    const code = normalizeCountryIdentity(countryCode);
    const trimmed = postalCode.trim();
    if (!trimmed) {
        return '';
    }
    if (code === 'CA') {
        return trimmed.replace(/\s+/g, '').toUpperCase();
    }
    return trimmed;
}

export function postalCodesEqualForCountry(
    countryCode: string,
    expectedPostal: string,
    actualPostal: string
): boolean {
    return (
        normalizePostalCodeForCountry(countryCode, expectedPostal) ===
        normalizePostalCodeForCountry(countryCode, actualPostal)
    );
}

function extractPostcodeSegmentAfterCountry(
    normalizedAddress: string,
    countryDisplayName: string
): string {
    const countryIdx = normalizedAddress.indexOf(countryDisplayName);
    if (countryIdx < 0) {
        return '';
    }
    return normalizedAddress.slice(countryIdx + countryDisplayName.length).trim();
}

/**
 * Bundle newAddressFormatter: `${streetParts}, ${country} ${postalCode}` (trimmed).
 * For UA/IN/CA smoke, postcode must appear after the full country name on Settings read-only.
 */
export function assertSettingsAddressCountryBeforePostcode(
    addressText: string,
    countryDisplayName: string,
    postalCode: string,
    countryCode: string
): void {
    const normalized = normalizeSettingsAddressDisplayText(addressText);
    const countryIdx = normalized.indexOf(countryDisplayName);
    if (countryIdx < 0) {
        throw new CompanyInformationPersistenceError(
            `Settings address missing country display name ${JSON.stringify(countryDisplayName)} in ${JSON.stringify(normalized)}.`
        );
    }
    const trimmedPostal = postalCode.trim();
    if (!trimmedPostal) {
        return;
    }
    const tail = extractPostcodeSegmentAfterCountry(normalized, countryDisplayName);
    const tailNorm = normalizePostalCodeForCountry(countryCode, tail);
    const expectedNorm = normalizePostalCodeForCountry(countryCode, trimmedPostal);
    if (!tailNorm || tailNorm !== expectedNorm) {
        throw new CompanyInformationPersistenceError(
            `Settings address missing or incorrect postcode after country: expected ${JSON.stringify(trimmedPostal)} in ${JSON.stringify(normalized)}.`
        );
    }
    const compactAddress = normalized.replace(/\s+/g, '');
    const countryPos = compactAddress.indexOf(countryDisplayName.replace(/\s+/g, ''));
    const expectedPos = compactAddress.indexOf(expectedNorm);
    if (expectedPos >= 0 && countryPos >= 0 && expectedPos < countryPos) {
        throw new CompanyInformationPersistenceError(
            `Settings address shows postcode before country name: ${JSON.stringify(normalized)}.`
        );
    }
}

export function normalizeCountryIdentity(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    const upper = trimmed.toUpperCase();
    if (upper.length === 2 && COUNTRY_ISO_TO_SELECT_TITLE[upper]) {
        return upper;
    }
    const mapped = COUNTRY_SELECT_TITLE_TO_ISO[trimmed];
    if (mapped) {
        return mapped;
    }
    for (const [title, iso] of Object.entries(COUNTRY_SELECT_TITLE_TO_ISO)) {
        if (title.toLowerCase() === trimmed.toLowerCase()) {
            return iso;
        }
    }
    return upper.length === 2 ? upper : trimmed;
}

export function resolveExpectedCountrySelectTitle(apiCountry: string): string {
    const trimmed = apiCountry.trim();
    if (!trimmed) {
        return '';
    }
    const mapped = COUNTRY_ISO_TO_SELECT_TITLE[trimmed.toUpperCase()];
    if (mapped) {
        return mapped;
    }
    return trimmed;
}

/** Full country name required on Settings read-only address (ISO code alone is not sufficient). */
export function resolveExpectedCountryDisplayName(countryCode: string): string {
    const code = normalizeCountryIdentity(countryCode);
    if (!code) {
        return '';
    }
    return resolveExpectedCountrySelectTitle(code);
}

/**
 * Staging Settings read-only company block (trace 2026-10-24):
 * sibling `div`s inside the company wrapper — business name, address text, then
 * `.company-information-telephone-number` (Settings.tsx CompanyInformationWrapper).
 */
export function settingsCompanyReadOnlyAddressLine(section: Locator): Locator {
    const phone = section.locator('.company-information-telephone-number');
    return phone.locator('xpath=preceding-sibling::div[1]');
}

function resolveSettingsUrl(options?: CompanyInformationFlowOptions): string {
    return options?.settingsUrl ?? STG_SETTINGS_URL;
}

export function settingsPathname(pathname: string): boolean {
    const normalized = pathname.replace(/\/$/, '') || '/';
    return normalized === '/settings';
}

export function settingsCompanyEditPathname(pathname: string): boolean {
    const normalized = pathname.replace(/\/$/, '') || '/';
    return normalized === '/settings/company-information';
}

export async function assertSettingsRoute(
    page: Page,
    options?: CompanyInformationFlowOptions
): Promise<void> {
    const settingsPath = new URL(resolveSettingsUrl(options)).pathname;
    await expect(page).toHaveURL((url) => {
        const normalized = new URL(url).pathname.replace(/\/$/, '') || '/';
        return normalized === settingsPath.replace(/\/$/, '');
    });
}

export async function assertSettingsCompanyEditRoute(page: Page): Promise<void> {
    await expect(page).toHaveURL((url) =>
        settingsCompanyEditPathname(new URL(url).pathname)
    );
}

function xpathCompanyEditButtonLabelMatches(): string {
    return "(normalize-space(.)='編集' or normalize-space(.)='編 集')";
}

function xpathEscapeLiteral(value: string): string {
    if (!value.includes("'")) {
        return `'${value}'`;
    }
    if (!value.includes('"')) {
        return `"${value}"`;
    }
    return `concat('${value.split("'").join("', \"'\", '")}')`;
}

/**
 * Read-only company block (bundle: Settings.tsx Company + CompanyInformationWrapper;
 * live: stable class `company-information-telephone-number` on phone row).
 * Nearest ancestor `div` of the phone row that contains a company Edit control but not plan/display sections.
 * (`ancestor` is reverse document order; `[1]` is nearest, `[last()]` would be farthest.)
 */
export function settingsCompanyInformationSection(page: Page): Locator {
    const telephoneRow = page.locator('.company-information-telephone-number');
    const editLabel = xpathCompanyEditButtonLabelMatches();
    return telephoneRow.locator(
        `xpath=ancestor::div[.//button[${editLabel}] and not(.//button[contains(normalize-space(.), "プランの確認・変更")]) and not(.//*[normalize-space(.)="表示項目の設定"])][1]`
    );
}

export function settingsCompanyInformationEditButton(section: Locator): Locator {
    return section.getByRole('button', { name: COMPANY_EDIT_BUTTON_NAME_PATTERN });
}

const COMPANY_EDIT_SAVE_BUTTON_CLASS = 'save-button';
const COMPANY_EDIT_CANCEL_BUTTON_CLASS = 'cancel-button';
const COMPANY_COUNTRY_SELECT_WRAPPER_ID = 'country-select-wrapper';

/**
 * Live trace: company edit has no `<form>` / `<label>`; captions are divs; Save/Cancel use stable classes.
 * Nearest ancestor of Save that also contains edit title, cancel control, and #country-select-wrapper.
 */
export function companyInformationEditContent(page: Page): Locator {
    const editTitle = xpathEscapeLiteral(SETTINGS_COMPANY_EDIT_TITLE);
    return page.locator(`.${COMPANY_EDIT_SAVE_BUTTON_CLASS}`).locator(
        `xpath=ancestor::div[.//*[normalize-space(.)=${editTitle}] and .//*[@id='${COMPANY_COUNTRY_SELECT_WRAPPER_ID}'] and .//*[contains(concat(' ', normalize-space(@class), ' '), ' ${COMPANY_EDIT_CANCEL_BUTTON_CLASS} ')]][1]`
    );
}

/** @deprecated Renamed to {@link companyInformationEditContent} (no form element on staging edit page). */
export function companyInformationEditForm(page: Page): Locator {
    return companyInformationEditContent(page);
}

export type GetUserCompanyApiPayload = {
    organizationName?: string;
    companyPhone?: string;
    companyWebsite?: string;
    email?: string;
    directorFullName?: string;
    facilityName?: string;
    address?: {
        country?: string;
        postalCode?: string;
        stateProvinceRegion?: string;
        street?: string;
        buildings?: string;
    };
};

/** Live trace (2026-10-24): read endpoints return company fields at the JSON root (not `{ data: … }`). */
export type GetUserCompanyReadResponse = GetUserCompanyApiPayload;

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGetUserCompanyReadResponse(
    body: unknown,
    context: string
): GetUserCompanyReadResponse {
    if (!isJsonObject(body)) {
        throw new CompanyInformationFlowError(`${context} response was not a JSON object.`);
    }
    if (!('organizationName' in body)) {
        throw new CompanyInformationFlowError(
            `${context} response missing organizationName for company baseline.`
        );
    }
    return body as GetUserCompanyReadResponse;
}

/**
 * Live trace (2026-10-24): Settings page title is a plain div (`<div>設定</div>`), not a heading.
 * Often wrapped (`<div class="…"><div>設定</div></div>`); both normalize to 設定 — select innermost only.
 * Bundle: MainLayout showTitle + settingsPage.settingsPageTitle.
 */
export function settingsPageTitle(page: Page): Locator {
    return page.locator(
        "xpath=//div[normalize-space(.)='設定' and not(ancestor-or-self::*[@role='dialog']) and not(.//div[normalize-space(.)='設定'])]"
    );
}

export async function assertSettingsPageTitleVisible(page: Page): Promise<void> {
    const title = settingsPageTitle(page);
    await expect(title, 'Expected exactly one Settings page title element').toHaveCount(1, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(title).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}

export async function waitForGetUserCompanyStorePost(
    page: Page,
    timeoutMs = COMPANY_HYDRATION_TIMEOUT_MS
): Promise<GetUserCompanyReadResponse> {
    const response = await page.waitForResponse(
        (res) =>
            res.url() === GET_USER_COMPANY_STORE_URL &&
            res.request().method() === 'POST' &&
            res.status() === 200,
        { timeout: timeoutMs }
    );
    return parseGetUserCompanyReadResponse(await response.json(), 'get_user_company_store');
}

export async function waitForGetUserCompanyPost(
    page: Page,
    timeoutMs = COMPANY_HYDRATION_TIMEOUT_MS
): Promise<GetUserCompanyReadResponse> {
    const response = await page.waitForResponse(
        (res) =>
            res.url() === GET_USER_COMPANY_URL &&
            res.request().method() === 'POST' &&
            res.status() === 200,
        { timeout: timeoutMs }
    );
    return parseGetUserCompanyReadResponse(await response.json(), 'get_user_company');
}

export async function waitForUpdateCompanyPost(
    page: Page,
    timeoutMs = COMPANY_HYDRATION_TIMEOUT_MS
): Promise<void> {
    await page.waitForResponse(
        (res) =>
            res.url() === UPDATE_COMPANY_URL &&
            res.request().method() === 'POST' &&
            res.status() === 200,
        { timeout: timeoutMs }
    );
}

export function companyValuesFromCompanyApiPayload(
    data: GetUserCompanyApiPayload | undefined,
    context: string
): CompanyInformationValues {
    if (!data?.organizationName?.trim()) {
        throw new CompanyInformationFlowError(
            `${context} response missing organizationName for company baseline.`
        );
    }
    const address = data.address ?? {};
    const apiCountry = address.country ?? '';
    const countryCode = normalizeCountryIdentity(apiCountry);
    if (!countryCode) {
        throw new CompanyInformationFlowError(
            `${context} response missing address.country for company baseline.`
        );
    }
    return {
        businessName: data.organizationName ?? '',
        telephoneNumber: (data.companyPhone ?? '').replace(/-/g, ''),
        countryCode,
        countryTitle: resolveExpectedCountrySelectTitle(apiCountry),
        postalCode: address.postalCode ?? '',
        stateProvinceRegion: address.stateProvinceRegion ?? '',
        street: address.street ?? '',
        buildings: address.buildings ?? '',
        website: data.companyWebsite ?? '',
    };
}

export function companyValuesFromGetUserCompany(body: unknown): CompanyInformationValues {
    return companyValuesFromCompanyApiPayload(
        parseGetUserCompanyReadResponse(body, 'get_user_company'),
        'get_user_company'
    );
}

export function companyValuesFromGetUserCompanyStore(body: unknown): CompanyInformationValues {
    return companyValuesFromCompanyApiPayload(
        parseGetUserCompanyReadResponse(body, 'get_user_company_store'),
        'get_user_company_store'
    );
}

function companyEditFieldBlockByCaption(editContent: Locator, caption: string): Locator {
    const captionLiteral = xpathEscapeLiteral(caption);
    return editContent.locator(
        `xpath=.//div[normalize-space(.)=${captionLiteral}]/ancestor::div[count(.//input[not(@type='hidden')])=1][1]`
    );
}

function companyEditInputByCaption(editContent: Locator, caption: string): Locator {
    return companyEditFieldBlockByCaption(editContent, caption).locator(
        'input:not([type="hidden"])'
    );
}

export function companyEditBusinessNameFieldBlock(editContent: Locator): Locator {
    return companyEditFieldBlockByCaption(editContent, COMPANY_FORM_LABEL_BUSINESS_NAME);
}

export function companyEditBusinessNameValidationMessage(editContent: Locator): Locator {
    return companyEditBusinessNameFieldBlock(editContent).getByText(
        COMPANY_BUSINESS_NAME_INVALID_CHARS_MESSAGE,
        { exact: true }
    );
}

function companyEditTelephoneInput(editContent: Locator): Locator {
    return editContent.locator('input[name="telephoneNumber"]');
}

function companyEditWebsiteInput(editContent: Locator): Locator {
    return editContent.locator('input[type="url"]');
}

function companyEditStateProvinceInput(editContent: Locator): Locator {
    return editContent.locator(
        "xpath=.//div[normalize-space(.)='都道府県・市町村' or normalize-space(.)='州']/ancestor::div[count(.//input[not(@type='hidden')])=1][1]//input[not(@type='hidden')]"
    );
}

function companyEditCountrySelectionItem(editContent: Locator): Locator {
    return editContent.locator(`#${COMPANY_COUNTRY_SELECT_WRAPPER_ID} .ant-select-selection-item`);
}

export function companyEditCountrySelectTrigger(editContent: Locator): Locator {
    return editContent.locator(`#${COMPANY_COUNTRY_SELECT_WRAPPER_ID} .ant-select-selector`);
}

/**
 * Staging (2026-10-24 inspect): popup lives inside `#country-select-wrapper`, class
 * `country-select-popup ant-select-dropdown`; closed state adds `ant-select-dropdown-hidden`
 * (display:none). Options: `.ant-select-item.ant-select-item-option[title]` with
 * `.ant-select-item-option-content`; virtual list + search input `.ant-select-selection-search-input`.
 */
export function companyCountrySelectDropdown(page: Page): Locator {
    return page.locator(`#${COMPANY_COUNTRY_SELECT_WRAPPER_ID} .country-select-popup`);
}

export function companyCountryDropdownVisibleOption(
    popup: Locator,
    countryTitle: string
): Locator {
    return popup.getByRole('option', { name: countryTitle, exact: true });
}

export async function openCompanyEditCountryDropdown(page: Page): Promise<void> {
    const editContent = companyInformationEditContent(page);
    const wrapper = editContent.locator(`#${COMPANY_COUNTRY_SELECT_WRAPPER_ID}`);
    const trigger = companyEditCountrySelectTrigger(editContent);
    const countryItem = companyEditCountrySelectionItem(editContent);
    await assertUniqueCompanyEditField(trigger, 'country select trigger');
    await assertUniqueCompanyEditField(countryItem, 'country selection');
    if (await countryItem.isVisible()) {
        await countryItem.click();
    } else {
        await trigger.click({ force: true });
    }
    const popup = companyCountrySelectDropdown(page);
    await expect(popup).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(popup).not.toHaveClass(/ant-select-dropdown-hidden/, {
        timeout: ACTION_TIMEOUT_MS,
    });
}

export async function assertCompanyCountryDropdownClosed(page: Page): Promise<void> {
    const popup = companyCountrySelectDropdown(page);
    await expect
        .poll(async () => {
            const className = (await popup.getAttribute('class')) ?? '';
            if (className.includes('ant-select-dropdown-hidden')) {
                return true;
            }
            return !(await popup.isVisible());
        })
        .toBe(true);
}

/** Filter virtualized list via search, then click the visible titled option row. */
export async function selectCompanyEditCountryByVisibleOption(
    page: Page,
    countryTitle: string
): Promise<void> {
    if (isCompanySmokeExcludedCountryCode(countryTitle)) {
        throw new CompanyInformationFlowError(
            `Smoke country selection excludes ${JSON.stringify(countryTitle)}.`
        );
    }

    await openCompanyEditCountryDropdown(page);
    const editContent = companyInformationEditContent(page);
    const wrapper = editContent.locator(`#${COMPANY_COUNTRY_SELECT_WRAPPER_ID}`);
    const searchInput = wrapper.locator('input.ant-select-selection-search-input');
    if ((await searchInput.count()) === 1) {
        await searchInput.fill('');
        await searchInput.fill(countryTitle);
    }

    const popup = companyCountrySelectDropdown(page);
    const visibleOption = companyCountryDropdownVisibleOption(popup, countryTitle);
    await expect(
        visibleOption,
        `Country dropdown must expose exactly one visible option ${JSON.stringify(countryTitle)}`
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await visibleOption.scrollIntoViewIfNeeded();
    await visibleOption.click();
    const countryItem = companyEditCountrySelectionItem(editContent);
    await expect(countryItem).toHaveAttribute('title', countryTitle, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await assertCompanyCountryDropdownClosed(page);
}

export async function waitForCompanyEditAddressFieldsClearedAfterCountryChange(
    page: Page,
    expectedCountryCode: string
): Promise<void> {
    const editContent = companyInformationEditContent(page);
    const countryItem = companyEditCountrySelectionItem(editContent);
    await assertCompanyCountrySelectionMatchesCode(countryItem, expectedCountryCode, {
        timeout: COMPANY_HYDRATION_TIMEOUT_MS,
    });
    const postalCode = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_POSTAL_CODE);
    const region = companyEditStateProvinceInput(editContent);
    const street = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_STREET);
    await expect(postalCode).toHaveValue('', { timeout: ACTION_TIMEOUT_MS });
    await expect(region).toHaveValue('', { timeout: ACTION_TIMEOUT_MS });
    await expect(street).toHaveValue('', { timeout: ACTION_TIMEOUT_MS });
}

export async function waitForCompanyEditCountryDependentFieldsSettled(
    page: Page,
    expected: CompanyInformationValues
): Promise<void> {
    await waitForCompanyEditContentHydrated(page, expected);
}

function companyEditSaveButton(editContent: Locator): Locator {
    return editContent.locator(`.${COMPANY_EDIT_SAVE_BUTTON_CLASS}`);
}

function companyEditCancelButton(editContent: Locator): Locator {
    return editContent.locator(`.${COMPANY_EDIT_CANCEL_BUTTON_CLASS}`);
}

async function assertUniqueCompanyEditField(
    locator: Locator,
    fieldDescription: string
): Promise<void> {
    await expect(
        locator,
        `Expected exactly one company edit field: ${fieldDescription}`
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
}

export async function assertCompanyCountrySelectionMatchesCode(
    countryItem: Locator,
    expectedCountryCode: string,
    options?: { timeout?: number }
): Promise<string> {
    const timeout = options?.timeout ?? COMPANY_HYDRATION_TIMEOUT_MS;
    await expect(countryItem).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    const expectedCode = normalizeCountryIdentity(expectedCountryCode);
    try {
        await expect
            .poll(
                async () => {
                    const title = await countryItem.getAttribute('title');
                    if (!title?.trim()) {
                        return '';
                    }
                    return normalizeCountryIdentity(title.trim());
                },
                { timeout }
            )
            .toBe(expectedCode);
    } catch {
        const title = await countryItem.getAttribute('title');
        const actualCode = title?.trim() ? normalizeCountryIdentity(title.trim()) : '';
        throw new CompanyInformationFlowError(
            `Country selection mismatch: UI title ${JSON.stringify(title ?? '')} (${actualCode || 'empty'}) did not normalize to ${expectedCode} within ${timeout}ms.`
        );
    }
    const title = await countryItem.getAttribute('title');
    if (!title?.trim()) {
        throw new CompanyInformationFlowError(
            'Country select must expose selected value via #country-select-wrapper .ant-select-selection-item[title].'
        );
    }
    return title.trim();
}

export async function waitForCompanyEditContentHydrated(
    page: Page,
    expected: CompanyInformationValues,
    options?: { timeout?: number }
): Promise<void> {
    const timeout = options?.timeout ?? COMPANY_HYDRATION_TIMEOUT_MS;
    const editContent = companyInformationEditContent(page);
    await expect(
        editContent,
        'Expected exactly one company information edit content container'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const businessName = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_BUSINESS_NAME);
    const telephone = companyEditTelephoneInput(editContent);
    const postalCode = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_POSTAL_CODE);
    const region = companyEditStateProvinceInput(editContent);
    const street = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_STREET);
    const buildings = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_BUILDINGS);
    const website = companyEditWebsiteInput(editContent);
    const countryItem = companyEditCountrySelectionItem(editContent);

    await assertUniqueCompanyEditField(businessName, 'business name');
    await assertUniqueCompanyEditField(telephone, 'telephone');
    await assertUniqueCompanyEditField(postalCode, 'postal code');
    await assertUniqueCompanyEditField(region, 'state/province/region');
    await assertUniqueCompanyEditField(street, 'street');
    await assertUniqueCompanyEditField(buildings, 'buildings');
    await assertUniqueCompanyEditField(website, 'website');
    await assertUniqueCompanyEditField(countryItem, 'country selection');

    await expect(businessName).toHaveValue(expected.businessName, { timeout });
    await expect(telephone).toHaveValue(expected.telephoneNumber, { timeout });
    await expect(postalCode).toHaveValue(expected.postalCode, { timeout });
    await expect(region).toHaveValue(expected.stateProvinceRegion, { timeout });
    await expect(street).toHaveValue(expected.street, { timeout });
    await expect(buildings).toHaveValue(expected.buildings, { timeout });
    await expect(website).toHaveValue(expected.website, { timeout });
    await assertCompanyCountrySelectionMatchesCode(countryItem, expected.countryCode, {
        timeout,
    });
}

/** @deprecated Renamed to {@link waitForCompanyEditContentHydrated}. */
export async function waitForCompanyEditFormHydrated(
    page: Page,
    expected: CompanyInformationValues,
    options?: { timeout?: number }
): Promise<void> {
    await waitForCompanyEditContentHydrated(page, expected, options);
}

export async function readCompanyInformationEditForm(
    page: Page
): Promise<CompanyInformationValues> {
    const editContent = companyInformationEditContent(page);
    await expect(editContent).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const businessName = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_BUSINESS_NAME);
    const telephone = companyEditTelephoneInput(editContent);
    const postalCode = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_POSTAL_CODE);
    const region = companyEditStateProvinceInput(editContent);
    const street = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_STREET);
    const buildings = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_BUILDINGS);
    const website = companyEditWebsiteInput(editContent);
    const countryItem = companyEditCountrySelectionItem(editContent);

    await assertUniqueCompanyEditField(businessName, 'business name');
    await assertUniqueCompanyEditField(telephone, 'telephone');
    await assertUniqueCompanyEditField(postalCode, 'postal code');
    await assertUniqueCompanyEditField(region, 'state/province/region');
    await assertUniqueCompanyEditField(street, 'street');
    await assertUniqueCompanyEditField(buildings, 'buildings');
    await assertUniqueCompanyEditField(website, 'website');
    await assertUniqueCompanyEditField(countryItem, 'country selection');

    const title = await countryItem.getAttribute('title');
    if (!title?.trim()) {
        throw new CompanyInformationFlowError(
            'Country select must expose selected value via #country-select-wrapper .ant-select-selection-item[title].'
        );
    }

    return {
        businessName: await businessName.inputValue(),
        telephoneNumber: await telephone.inputValue(),
        countryCode: normalizeCountryIdentity(title.trim()),
        countryTitle: title.trim(),
        postalCode: await postalCode.inputValue(),
        stateProvinceRegion: await region.inputValue(),
        street: await street.inputValue(),
        buildings: await buildings.inputValue(),
        website: await website.inputValue(),
    };
}

export function pickAlternateSmokeBusinessName(currentBusinessName: string): string {
    const trimmed = currentBusinessName.trim();
    if (trimmed === COMPANY_BUSINESS_NAME_SMOKE_B) {
        return COMPANY_BUSINESS_NAME_SMOKE_A;
    }
    return COMPANY_BUSINESS_NAME_SMOKE_B;
}

export function pickCompanyInformationUpdate(
    baseline: CompanyInformationValues
): CompanyInformationUpdateIntent {
    const alternateName = pickAlternateSmokeBusinessName(baseline.businessName);
    const alternateTelephone =
        baseline.telephoneNumber.trim() === '09012345678'
            ? '09087654321'
            : '09012345678';
    const nextCountryCode = pickNextSmokeCountryCode(baseline.countryCode);
    const addressProfile = smokeAddressProfileForCountryCode(nextCountryCode, {
        alternateAuRegionStreet:
            nextCountryCode === 'AU' &&
            baseline.stateProvinceRegion.trim() === 'New Queensland' &&
            baseline.street.trim() === 'Abbot Street',
    });

    const after: CompanyInformationValues = {
        ...baseline,
        businessName: alternateName,
        telephoneNumber: alternateTelephone,
        countryCode: addressProfile.countryCode,
        countryTitle: addressProfile.countryTitle,
        postalCode: addressProfile.postalCode,
        stateProvinceRegion: addressProfile.stateProvinceRegion,
        street: addressProfile.street,
    };

    return { before: baseline, after };
}

export function assertCompanyValuesEqual(
    expected: CompanyInformationValues,
    actual: CompanyInformationValues,
    context: string
): void {
    const keys = Object.keys(expected) as (keyof CompanyInformationValues)[];
    for (const key of keys) {
        if (key === 'countryTitle') {
            continue;
        }
        if (key === 'countryCode') {
            const exp = normalizeCountryIdentity(expected.countryCode || expected.countryTitle);
            const act = normalizeCountryIdentity(actual.countryCode || actual.countryTitle);
            if (exp !== act) {
                throw new CompanyInformationPersistenceError(
                    `${context}: countryCode expected ${JSON.stringify(exp)} but got ${JSON.stringify(act)}`
                );
            }
            continue;
        }
        if (key === 'postalCode') {
            if (
                !postalCodesEqualForCountry(
                    expected.countryCode || actual.countryCode,
                    expected.postalCode,
                    actual.postalCode
                )
            ) {
                throw new CompanyInformationPersistenceError(
                    `${context}: postalCode expected ${JSON.stringify(expected.postalCode)} but got ${JSON.stringify(actual.postalCode)}`
                );
            }
            continue;
        }
        if (expected[key] !== actual[key]) {
            throw new CompanyInformationPersistenceError(
                `${context}: ${String(key)} expected ${JSON.stringify(expected[key])} but got ${JSON.stringify(actual[key])}`
            );
        }
    }
}

async function navigateToSettingsViaMenu(
    page: Page,
    options?: CompanyInformationFlowOptions
): Promise<void> {
    await page.getByRole('img', { name: 'Menu' }).click();
    const dialog = appNavigationMenuDialog(page);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const settingsNavItem = dialog.getByText(SETTINGS_PAGE_TITLE, { exact: true });
    await expect(
        settingsNavItem,
        'Navigation menu dialog must expose exactly one 設定 control'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const storeSettled = waitForGetUserCompanyStorePost(page).then(
        (body) => ({ ok: true as const, body }),
        (err) => ({ ok: false as const, err })
    );

    let navigationError: unknown;
    try {
        await settingsNavItem.click();
        await assertSettingsRoute(page, options);
        await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
        await waitForSettingsCompanyReadOnlyReady(page, options);
    } catch (err) {
        navigationError = err;
    }

    const storeOutcome = await storeSettled;
    if (navigationError !== undefined) {
        throw navigationError;
    }
    if (!storeOutcome.ok) {
        throw storeOutcome.err;
    }
}

export async function navigateToSettings(
    page: Page,
    options?: CompanyInformationFlowOptions
): Promise<GetUserCompanyReadResponse | null> {
    const settingsUrl = resolveSettingsUrl(options);
    const pathname = new URL(page.url()).pathname;
    const targetPath = new URL(settingsUrl).pathname.replace(/\/$/, '') || '/';
    const normalized = pathname.replace(/\/$/, '') || '/';
    if (normalized === targetPath) {
        await waitForSettingsCompanyReadOnlyReady(page, options);
        return null;
    }
    await navigateToSettingsViaMenu(page, options);
    return null;
}

export async function waitForSettingsCompanyReadOnlyReady(
    page: Page,
    options?: CompanyInformationFlowOptions
): Promise<void> {
    await assertSettingsRoute(page, options);
    await assertSettingsPageTitleVisible(page);
    await expect(page.getByText(SETTINGS_COMPANY_SECTION_TITLE, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });

    const section = settingsCompanyInformationSection(page);
    await expect(
        section,
        'Expected exactly one Settings company information section'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const phone = section.locator('.company-information-telephone-number');
    await expect(phone).toBeVisible({ timeout: COMPANY_HYDRATION_TIMEOUT_MS });
    await expect(phone).not.toHaveText('', { timeout: COMPANY_HYDRATION_TIMEOUT_MS });
}

export async function assertAuthenticatedAccountViaAuthProfile(
    page: Page,
    account: SmokeAccountRef
): Promise<void> {
    const profileSettled = waitForAuthProfilePost(page).then(
        (profile) => ({ ok: true as const, profile }),
        (err) => ({ ok: false as const, err })
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const outcome = await profileSettled;
    if (!outcome.ok) {
        throw outcome.err;
    }
    const email = outcome.profile.email;
    if (!email) {
        throw new CompanyInformationFlowError(
            'auth/profile response missing email; cannot verify signed-in account before company update.'
        );
    }
    if (email !== account.email) {
        throw new CompanyInformationFlowError(
            `auth/profile email ${JSON.stringify(email)} !== ${JSON.stringify(account.email)}`
        );
    }
}

export async function openCompanyInformationEdit(page: Page): Promise<GetUserCompanyReadResponse> {
    const section = settingsCompanyInformationSection(page);
    await expect(section).toHaveCount(1);

    const companySettled = waitForGetUserCompanyPost(page).then(
        (body) => ({ ok: true as const, body }),
        (err) => ({ ok: false as const, err })
    );

    const editButton = settingsCompanyInformationEditButton(section);
    await expect(
        editButton,
        'Expected exactly one company Edit control in scoped company information block'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await editButton.click();
    await assertSettingsCompanyEditRoute(page);
    await expect(
        page.getByText(SETTINGS_COMPANY_EDIT_TITLE, { exact: true })
    ).toBeVisible({ timeout: ACTION_TIMEOUT_MS });

    const outcome = await companySettled;
    if (!outcome.ok) {
        throw outcome.err;
    }

    const expectedForm = companyValuesFromGetUserCompany(outcome.body);
    await waitForCompanyEditContentHydrated(page, expectedForm);
    return outcome.body;
}

export async function returnToSettingsReadOnlyFromEdit(
    page: Page,
    options?: CompanyInformationFlowOptions
): Promise<void> {
    const pathname = new URL(page.url()).pathname;
    if (settingsCompanyEditPathname(pathname)) {
        const editContent = companyInformationEditContent(page);
        const cancelButton = companyEditCancelButton(editContent);
        await assertUniqueCompanyEditField(cancelButton, 'cancel');
        await cancelButton.click();
        await assertSettingsRoute(page, options);
        await waitForSettingsCompanyReadOnlyReady(page, options);
        return;
    }
    if (!settingsPathname(pathname)) {
        await page.goto(resolveSettingsUrl(options), { waitUntil: 'domcontentloaded' });
    }
    await waitForSettingsCompanyReadOnlyReady(page, options);
}

export async function assertCompanyInformationEditPageClosed(page: Page): Promise<void> {
    await expect(page).not.toHaveURL((url) =>
        settingsCompanyEditPathname(new URL(url).pathname)
    );
    await expect(companyInformationEditContent(page)).toHaveCount(0, {
        timeout: ACTION_TIMEOUT_MS,
    });
}

export type CompanyReadOnlyDisplayExpectation = Pick<
    CompanyInformationValues,
    | 'businessName'
    | 'telephoneNumber'
    | 'stateProvinceRegion'
    | 'street'
    | 'countryCode'
    | 'postalCode'
>;

/** Read-only company block (name, address sibling div, phone class). Requires full country display name. */
export async function assertCompanyReadOnlyDisplays(
    page: Page,
    expected: CompanyReadOnlyDisplayExpectation
): Promise<void> {
    const section = settingsCompanyInformationSection(page);
    await expect(section.getByText(expected.businessName, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    const phone = section.locator('.company-information-telephone-number');
    await expect(
        phone,
        'Expected exactly one company telephone row in scoped company section'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(phone).toHaveText(expected.telephoneNumber, { timeout: ACTION_TIMEOUT_MS });

    const addressLine = settingsCompanyReadOnlyAddressLine(section);
    await expect(
        addressLine,
        'Expected exactly one address line div immediately before the telephone row'
    ).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const countryDisplayName = resolveExpectedCountryDisplayName(expected.countryCode);
    if (!countryDisplayName) {
        throw new CompanyInformationFlowError(
            'Expected countryCode must resolve to a full country display name for read-only verification.'
        );
    }

    await expect(addressLine).toContainText(expected.street, { timeout: ACTION_TIMEOUT_MS });
    await expect(addressLine).toContainText(expected.stateProvinceRegion, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(
        addressLine,
        'Settings address must include full country name, not ISO code only'
    ).toContainText(countryDisplayName, { timeout: ACTION_TIMEOUT_MS });

    const addressText = normalizeSettingsAddressDisplayText(
        (await addressLine.textContent()) ?? ''
    );
    assertSettingsAddressCountryBeforePostcode(
        addressText,
        countryDisplayName,
        expected.postalCode,
        expected.countryCode
    );
    if (isPostalCodeRequiredForCountryCode(expected.countryCode)) {
        const displayPostalNorm = normalizePostalCodeForCountry(
            expected.countryCode,
            expected.postalCode
        );
        const addressCompact = addressText.replace(/\s+/g, '').toUpperCase();
        expect(
            addressCompact.includes(displayPostalNorm),
            `Settings address must include postcode ${JSON.stringify(expected.postalCode)}`
        ).toBe(true);
    }
}

async function fillCompanyInformationForm(
    page: Page,
    values: CompanyInformationValues,
    preserve: CompanyInformationValues
): Promise<void> {
    const editContent = companyInformationEditContent(page);
    await expect(editContent).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });

    const businessName = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_BUSINESS_NAME);
    const telephone = companyEditTelephoneInput(editContent);
    const postalCode = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_POSTAL_CODE);
    const region = companyEditStateProvinceInput(editContent);
    const street = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_STREET);
    const buildings = companyEditInputByCaption(editContent, COMPANY_FORM_LABEL_BUILDINGS);
    const website = companyEditWebsiteInput(editContent);
    await assertUniqueCompanyEditField(businessName, 'business name');
    await assertUniqueCompanyEditField(telephone, 'telephone');
    await assertUniqueCompanyEditField(postalCode, 'postal code');
    await assertUniqueCompanyEditField(region, 'state/province/region');
    await assertUniqueCompanyEditField(street, 'street');
    await assertUniqueCompanyEditField(buildings, 'buildings');
    await assertUniqueCompanyEditField(website, 'website');

    const countryChanged =
        normalizeCountryIdentity(values.countryCode) !==
        normalizeCountryIdentity(preserve.countryCode);
    if (countryChanged) {
        await selectCompanyEditCountryByVisibleOption(page, values.countryTitle);
        await waitForCompanyEditAddressFieldsClearedAfterCountryChange(page, values.countryCode);
    }

    await businessName.fill(values.businessName);
    await telephone.fill(values.telephoneNumber);

    await postalCode.fill(values.postalCode);
    await region.fill(values.stateProvinceRegion);
    await street.fill(values.street);
    await buildings.fill(values.buildings);
    await website.fill(values.website);

    await waitForCompanyEditCountryDependentFieldsSettled(page, values);
    await assertCompanyEditFormReadyToSave(page);
}

async function assertCompanyEditFormReadyToSave(page: Page): Promise<void> {
    await assertCompanyEditBusinessNameValidAndSaveEnabled(page);
    const editContent = companyInformationEditContent(page);
    await expect(
        editContent.getByText(COMPANY_BUSINESS_NAME_INVALID_CHARS_MESSAGE, { exact: true })
    ).toHaveCount(0, { timeout: ACTION_TIMEOUT_MS });
    await expect(
        editContent.getByText(/Postal Code is incorrect|postal code is incorrect/i)
    ).toHaveCount(0, { timeout: ACTION_TIMEOUT_MS });
}

async function assertCompanyEditBusinessNameValidAndSaveEnabled(page: Page): Promise<void> {
    const editContent = companyInformationEditContent(page);
    await expect(editContent).toHaveCount(1, { timeout: ACTION_TIMEOUT_MS });
    await expect(
        companyEditBusinessNameValidationMessage(editContent),
        'Business name field must not show invalid-character validation before save'
    ).toHaveCount(0, { timeout: ACTION_TIMEOUT_MS });
    const saveButton = companyEditSaveButton(editContent);
    await assertUniqueCompanyEditField(saveButton, 'save');
    await expect(saveButton).toHaveAccessibleName(COMPANY_SAVE_BUTTON_NAME_PATTERN, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(saveButton).toBeEnabled({ timeout: ACTION_TIMEOUT_MS });
}

async function submitCompanyInformationSaveOnce(page: Page): Promise<void> {
    await assertCompanyEditBusinessNameValidAndSaveEnabled(page);
    const editContent = companyInformationEditContent(page);
    const saveButton = companyEditSaveButton(editContent);

    const updateSettled = waitForUpdateCompanyPost(page).then(
        () => ({ ok: true as const }),
        (err) => ({ ok: false as const, err })
    );

    await saveButton.click();

    const updateOutcome = await updateSettled;
    if (!updateOutcome.ok) {
        throw updateOutcome.err;
    }

    await expect(page.getByText(COMPANY_UPDATE_SUCCESS_TOAST, { exact: true })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
}

async function verifyCompanyPersistenceAfterFreshLoad(
    page: Page,
    expected: CompanyInformationValues,
    options?: CompanyInformationFlowOptions
): Promise<void> {
    const storeSettled = waitForGetUserCompanyStorePost(page).then(
        (body) => ({ ok: true as const, body }),
        (err) => ({ ok: false as const, err })
    );

    await page.goto(resolveSettingsUrl(options), { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, options);

    const storeOutcome = await storeSettled;
    if (!storeOutcome.ok) {
        throw storeOutcome.err;
    }

    try {
        const apiValues = companyValuesFromGetUserCompanyStore(storeOutcome.body);
        assertCompanyValuesEqual(expected, apiValues, 'fresh-load-get_user_company_store');
    } catch (err) {
        if (err instanceof CompanyInformationPersistenceError) {
            throw err;
        }
        throw new CompanyInformationPersistenceError(
            'get_user_company_store response did not match expected values after fresh load'
        );
    }

    try {
        await assertCompanyReadOnlyDisplays(page, expected);
    } catch {
        throw new CompanyInformationPersistenceError(
            'read-only company block did not reflect saved values after fresh load'
        );
    }
    await assertSettingsRoute(page, options);
    await assertCompanyInformationEditPageClosed(page);
}

export async function runUpdateCompanyInformationAndVerify(
    page: Page,
    account: SmokeAccountRef,
    evidence?: CustomerFlowEvidence,
    options?: CompanyInformationFlowOptions
): Promise<void> {
    try {
        await test.step('settings company: navigate', async () => {
            await navigateToSettings(page, options);
        });

        await test.step('settings company: verify signed-in account (auth/profile)', async () => {
            await assertAuthenticatedAccountViaAuthProfile(page, account);
            await waitForSettingsCompanyReadOnlyReady(page, options);
        });

        const baseline = await test.step(
            'settings company: read hydrated baseline in edit form',
            async () => {
                await openCompanyInformationEdit(page);
                return readCompanyInformationEditForm(page);
            }
        );

        const intent = pickCompanyInformationUpdate(baseline);
        console.log(
            'COMPANY_INFORMATION_UPDATE_INTENT',
            JSON.stringify({
                accountEmail: account.email,
                before: {
                    businessName: intent.before.businessName,
                    telephoneNumber: intent.before.telephoneNumber,
                    stateProvinceRegion: intent.before.stateProvinceRegion,
                    street: intent.before.street,
                    countryTitle: intent.before.countryTitle,
                },
                after: {
                    businessName: intent.after.businessName,
                    telephoneNumber: intent.after.telephoneNumber,
                    stateProvinceRegion: intent.after.stateProvinceRegion,
                    street: intent.after.street,
                    countryCode: intent.after.countryCode,
                    countryTitle: intent.after.countryTitle,
                    postalCode: intent.after.postalCode,
                },
            })
        );
        if (evidence) {
            await evidence.attachJson('COMPANY_INFORMATION_UPDATE_INTENT', {
                accountEmail: account.email,
                before: intent.before,
                after: intent.after,
            });
        }

        await test.step('settings company: update and save once', async () => {
            await fillCompanyInformationForm(page, intent.after, intent.before);
            if (evidence) {
                await evidence.attachScreenshot('company-information-before-save');
            }
            await submitCompanyInformationSaveOnce(page);
            await assertSettingsRoute(page, options);
            await waitForSettingsCompanyReadOnlyReady(page, options);
            await assertCompanyInformationEditPageClosed(page);
            await assertCompanyReadOnlyDisplays(page, intent.after);
            if (evidence) {
                await evidence.attachScreenshot('company-information-after-save');
                await evidence.attachJson('COMPANY_INFORMATION_SAVED', intent.after);
            }
        });

        await test.step('settings company: persistence after one fresh load', async () => {
            await verifyCompanyPersistenceAfterFreshLoad(page, intent.after, options);
        });
    } catch (err) {
        if (evidence) {
            await evidence.attachScreenshot('company-information-failure');
            await evidence.attachPageHtml('company-information-failure-dom');
        }
        throw err;
    }
}
