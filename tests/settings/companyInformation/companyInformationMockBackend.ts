import type { Page, Route } from '@playwright/test';
import {
    GET_USER_COMPANY_STORE_URL,
    GET_USER_COMPANY_URL,
    UPDATE_COMPANY_URL,
    companyValuesFromCompanyApiPayload,
    normalizeCountryIdentity,
    type CompanyInformationValues,
} from './companyInformationFlow';

/**
 * Observed staging update_company POST JSON (SettingsRepository.updateCompanyInfo +
 * CompanyInfoPage onSubmit, bundle 2026-10-24): { id, data: { organizationName, companyPhone,
 * companyAddressId, address: { country, postalCode, stateProvinceRegion, street, buildings },
 * companyWebsite? } }.
 */
export type UpdateCompanyRequestBody = {
    id: string;
    data: {
        organizationName: string;
        companyPhone: string;
        companyAddressId?: string;
        address: {
            country: string;
            postalCode: string;
            stateProvinceRegion: string;
            street: string;
            buildings: string;
        };
        companyWebsite?: string;
    };
};

export type GetUserCompanyApiData = {
    id?: string;
    organizationName: string;
    companyPhone: string;
    companyWebsite?: string;
    companyAddressId?: string;
    address: {
        country: string;
        postalCode: string;
        stateProvinceRegion: string;
        street: string;
        buildings: string;
    };
};

function valuesToGetUserCompanyReadBody(values: CompanyInformationValues): GetUserCompanyApiData {
    return {
        organizationName: values.businessName,
        companyPhone: values.telephoneNumber,
        companyWebsite: values.website,
        companyAddressId: 'fixture-address-id',
        address: {
            country: normalizeCountryIdentity(values.countryCode || values.countryTitle),
            postalCode: values.postalCode,
            stateProvinceRegion: values.stateProvinceRegion,
            street: values.street,
            buildings: values.buildings,
        },
    };
}

function applyUpdateRequest(
    current: GetUserCompanyApiData,
    request: UpdateCompanyRequestBody
): GetUserCompanyApiData {
    return {
        ...current,
        organizationName: request.data.organizationName,
        companyPhone: request.data.companyPhone,
        companyWebsite: request.data.companyWebsite ?? current.companyWebsite ?? '',
        address: {
            ...current.address,
            country: request.data.address.country,
            postalCode: request.data.address.postalCode,
            stateProvinceRegion: request.data.address.stateProvinceRegion,
            street: request.data.address.street,
            buildings: request.data.address.buildings,
        },
    };
}

export function apiDataToFormValues(data: GetUserCompanyApiData): CompanyInformationValues {
    return companyValuesFromCompanyApiPayload(
        {
            organizationName: data.organizationName,
            companyPhone: data.companyPhone,
            companyWebsite: data.companyWebsite,
            address: data.address,
        },
        'mock-backend'
    );
}

export type CompanyInformationMockBackend = {
    getUpdateCount: () => number;
    getLastUpdateRequest: () => UpdateCompanyRequestBody | null;
    getApiData: () => GetUserCompanyApiData;
};

export async function installCompanyInformationMockBackend(
    page: Page,
    initial: CompanyInformationValues,
    options: { persistUpdates: boolean }
): Promise<CompanyInformationMockBackend> {
    let apiData = valuesToGetUserCompanyReadBody(initial);
    let updateCount = 0;
    let lastUpdateRequest: UpdateCompanyRequestBody | null = null;

    const fulfillGet = async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(apiData),
        });
    };

    await page.route(GET_USER_COMPANY_STORE_URL, fulfillGet);
    await page.route(GET_USER_COMPANY_URL, fulfillGet);

    await page.route(UPDATE_COMPANY_URL, async (route) => {
        updateCount += 1;
        const request = route.request().postDataJSON() as UpdateCompanyRequestBody;
        lastUpdateRequest = request;
        if (options.persistUpdates) {
            apiData = applyUpdateRequest(apiData, request);
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(apiData),
        });
    });

    return {
        getUpdateCount: () => updateCount,
        getLastUpdateRequest: () => lastUpdateRequest,
        getApiData: () => apiData,
    };
}
