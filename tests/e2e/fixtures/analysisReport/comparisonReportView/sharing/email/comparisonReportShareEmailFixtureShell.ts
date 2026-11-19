import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN =
    'https://comparison-report-share-email-fixture.test';
export const COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_CUSTOMER_ID =
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ANALYSIS_ID =
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
export const COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_LEFT_ID =
    'cccccccc-cccc-4ccc-8ccc-cccccccc0003';
export const COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RIGHT_ID =
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
export const COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_RECIPIENT = 'fixture-recipient@example.com';

export type ComparisonReportShareEmailFixtureFlags = {
    recipientEmail?: string;
    sendFails?: boolean;
};

function loadStaffShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'comparisonReportShareEmailShell.html'), 'utf8');
}

export function loadGuestShellHtml(): string {
    return fs.readFileSync(path.join(fixturesDir, 'comparisonReportShareEmailGuestShell.html'), 'utf8');
}

export async function installComparisonReportShareEmailFixtureShell(
    page: Page,
    flags?: ComparisonReportShareEmailFixtureFlags
): Promise<void> {
    await page.route(`${COMPARISON_REPORT_SHARE_EMAIL_FIXTURE_ORIGIN}/**`, (route) => {
        route.fulfill({ contentType: 'text/html', body: loadStaffShellHtml() });
    });
    await page.addInitScript((cfg) => {
        const w = window as unknown as { __creFlags?: Record<string, unknown> };
        w.__creFlags = {
            recipientEmail: cfg.recipientEmail ?? 'fixture-recipient@example.com',
            sendFails: Boolean(cfg.sendFails),
        };
    }, flags ?? {});
}