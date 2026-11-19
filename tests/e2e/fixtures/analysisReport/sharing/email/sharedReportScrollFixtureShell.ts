import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';
import { GET_FETCH_SHARED_REPORT_URL } from '../../../../../analysisReport/analysisReportTestIds';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
    ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
} from './analysisReportShareEmailFixtureShell';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const SHARED_REPORT_SCROLL_FIXTURE_ORIGIN = 'https://shared-report-scroll-fixture.test';

export const SHARED_REPORT_SCROLL_FIXTURE_CUSTOMER_NAME = 'Fixture Customer Tanaka';

export type SharedReportScrollFixtureMode = 'normal' | 'growing' | 'stalled';

export type SharedReportScrollFixtureConfig = {
    scrollMode?: SharedReportScrollFixtureMode;
    sectionCount?: number;
    customerName?: string;
    /** Adds a larger unrelated scroll panel (must not steal report scrolling). */
    decoyScrollPanel?: boolean;
};

function loadSharedReportScrollShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'sharedReportScrollShell.html'), 'utf8');
}

/** Trace 20261109-092223: top-level report + userPreferences (no headerData wrapper). */
export function buildFetchSharedReportFixtureBody(
    customerId = ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID,
    analysisId = ANALYSIS_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID,
    customerDisplayName = SHARED_REPORT_SCROLL_FIXTURE_CUSTOMER_NAME
): Record<string, unknown> {
    return {
        report: {
            customerId,
            analysisId,
            customer: {
                id: customerId,
                fullName: customerDisplayName,
            },
        },
        userPreferences: {
            showExercisesAndStretches: true,
        },
    };
}

export async function installSharedReportScrollFixture(
    page: Page,
    config: SharedReportScrollFixtureConfig = {}
): Promise<void> {
    const scrollMode = config.scrollMode ?? 'normal';
    const sectionCount = config.sectionCount ?? 8;
    const customerName = config.customerName ?? SHARED_REPORT_SCROLL_FIXTURE_CUSTOMER_NAME;
    const decoyScrollPanel = config.decoyScrollPanel ?? false;

    await page.route(`${SHARED_REPORT_SCROLL_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadSharedReportScrollShellHtml() });
    });
    await page.route(`${GET_FETCH_SHARED_REPORT_URL}**`, (route) => {
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(buildFetchSharedReportFixtureBody(undefined, undefined, customerName)),
        });
    });
    await page.addInitScript((fixtureConfig) => {
        (window as unknown as { __sharedReportScrollFixture?: Record<string, unknown> }).__sharedReportScrollFixture =
            fixtureConfig;
    }, { scrollMode, sectionCount, customerName, decoyScrollPanel });
}
