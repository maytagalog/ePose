import type { Page } from '@playwright/test';
import { GET_USER_URL, UPDATE_USER_URL } from './displayItemSettingsFlow';
import { GET_USER_COMPANY_STORE_URL } from '../companyInformation/companyInformationFlow';

export type DisplayItemSettingsMockState = {
    showExercisesAndStretches: boolean;
};

export async function installDisplayItemSettingsMockBackend(
    page: Page,
    state: DisplayItemSettingsMockState,
    companyStoreJson: string
): Promise<void> {
    await page.route(GET_USER_COMPANY_STORE_URL, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: companyStoreJson,
        });
    });

    await page.route(GET_USER_URL, async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ showExercisesAndStretches: state.showExercisesAndStretches }),
        });
    });

    await page.route(UPDATE_USER_URL, async (route) => {
        if (route.request().method() !== 'PATCH') {
            await route.continue();
            return;
        }
        let payload: { showExercisesAndStretches?: boolean } = {};
        try {
            payload = route.request().postDataJSON() as { showExercisesAndStretches?: boolean };
        } catch {
            payload = {};
        }
        if (typeof payload.showExercisesAndStretches === 'boolean') {
            state.showExercisesAndStretches = payload.showExercisesAndStretches;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ showExercisesAndStretches: state.showExercisesAndStretches }),
        });
    });
}
