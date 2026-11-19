import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertAnalysisReportPageLoaded } from '../../../../CIRS/postureAnalysis/postureAnalysisReportLocators';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ORIGIN = 'https://cirs-posture-analysis-fixture.test';
const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANALYSIS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function loadShell(): string {
    return fs.readFileSync(path.join(fixturesDir, 'cirsPostureAnalysisShell.html'), 'utf8');
}

async function installShell(
    page: import('@playwright/test').Page,
    flags: Record<string, string | boolean>
): Promise<void> {
    await page.route(`${FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadShell() });
    });
    await page.addInitScript((cfg) => {
        const w = window as unknown as Record<string, unknown>;
        Object.assign(w, cfg);
    }, flags);
}

test('report shell without populated score fails readiness', async ({ page }) => {
    await installShell(page, {
        __paListMode: 'populated',
        __paReportShellOnly: true,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`);
    await page.getByTestId('cirs-analysis-item').first().click();

    await expect(
        assertAnalysisReportPageLoaded(page, FIXTURE_ORIGIN, CUSTOMER_ID, ANALYSIS_ID)
    ).rejects.toThrow(/analysis-report-score populated/i);
});

test('analysis-report hooks with matching identity and populated score', async ({ page }) => {
    await installShell(page, {
        __paListMode: 'populated',
        __paReportShellOnly: false,
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers/${CUSTOMER_ID}/interaction-records/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`);
    await page.getByTestId('cirs-analysis-item').first().click();

    await assertAnalysisReportPageLoaded(page, FIXTURE_ORIGIN, CUSTOMER_ID, ANALYSIS_ID);
    await expect(page.getByTestId('analysis-report-summary')).toContainText('Fixture posture summary');
    await expect(page.getByTestId('analysis-report-score')).toHaveText(/\d+/);
});
