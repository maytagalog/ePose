import { test, expect } from '@playwright/test';

test.use({ launchOptions: { slowMo: 0 } });
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    DISPLAY_ITEMS_EXERCISE_STRETCHES_LABEL,
    SETTINGS_REPORT_DISPLAY_SECTION_TITLE,
    parseShowExercisesAndStretchesFromGetUser,
    runDisplayItemSettingsUpdateAndVerify,
    settingsDisplayItemSettingsEditButton,
    settingsDisplayItemSettingsWrapper,
    openDisplayItemSettingsEdit,
    displayItemSettingsExerciseSwitch,
    closeDisplayItemSettingsDialogWithoutSaving,
} from './displayItemSettingsFlow';
import { waitForSettingsCompanyReadOnlyReady } from '../companyInformation/companyInformationFlow';
import { installDisplayItemSettingsMockBackend } from './displayItemSettingsMockBackend';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';
const FIXTURE_SETTINGS_URL = `${FIXTURE_ORIGIN}/settings`;
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

const COMPANY_STORE_JSON = JSON.stringify({
    organizationName: 'Business',
    companyPhone: '09012345678',
    companyWebsite: '',
    address: {
        country: 'AU',
        postalCode: '',
        stateProvinceRegion: 'New Queensland',
        street: 'Abbot Street',
        buildings: '',
    },
});

test('display item section: group title sibling wrapper scopes Edit control', async ({ page }) => {
    await installFixturePage(page, 'displayItemSettingsPage.html');
    const mockState = { showExercisesAndStretches: true };
    await installDisplayItemSettingsMockBackend(page, mockState, COMPANY_STORE_JSON);

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });

    await expect(page.getByText(SETTINGS_REPORT_DISPLAY_SECTION_TITLE, { exact: true })).toBeVisible();
    const wrapper = settingsDisplayItemSettingsWrapper(page);
    await expect(wrapper.getByText('表示項目の設定', { exact: true })).toBeVisible();
    await expect(settingsDisplayItemSettingsEditButton(page)).toHaveCount(1);
});

test('parseShowExercisesAndStretchesFromGetUser: root and nested data', () => {
    expect(parseShowExercisesAndStretchesFromGetUser({ showExercisesAndStretches: true }, 't')).toBe(
        true
    );
    expect(
        parseShowExercisesAndStretchesFromGetUser(
            { data: { showExercisesAndStretches: false } },
            't'
        )
    ).toBe(false);
    expect(
        parseShowExercisesAndStretchesFromGetUser(
            { data: { userPreferences: { showExercisesAndStretches: true } } },
            't'
        )
    ).toBe(true);
});

test('runDisplayItemSettingsUpdateAndVerify: mock backend persists toggle', async ({ page }) => {
    await installFixturePage(page, 'displayItemSettingsPage.html');
    const mockState = { showExercisesAndStretches: true };
    await installDisplayItemSettingsMockBackend(page, mockState, COMPANY_STORE_JSON);

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });

    await runDisplayItemSettingsUpdateAndVerify(page, FIXTURE_ACCOUNT, undefined, {
        settingsUrl: FIXTURE_SETTINGS_URL,
    });

    expect(mockState.showExercisesAndStretches).toBe(false);
});

test('openDisplayItemSettingsEdit: dialog switch label matches exercise/stretch setting', async ({
    page,
}) => {
    await installFixturePage(page, 'displayItemSettingsPage.html');
    const mockState = { showExercisesAndStretches: false };
    await installDisplayItemSettingsMockBackend(page, mockState, COMPANY_STORE_JSON);

    await page.goto(FIXTURE_SETTINGS_URL, { waitUntil: 'domcontentloaded' });
    await waitForSettingsCompanyReadOnlyReady(page, { settingsUrl: FIXTURE_SETTINGS_URL });

    const dialog = await openDisplayItemSettingsEdit(page);
    await expect(dialog.getByText(DISPLAY_ITEMS_EXERCISE_STRETCHES_LABEL, { exact: true })).toBeVisible();
    const switchLoc = displayItemSettingsExerciseSwitch(dialog);
    await expect(switchLoc).toHaveAttribute('aria-checked', 'false');
    await closeDisplayItemSettingsDialogWithoutSaving(page);
});
