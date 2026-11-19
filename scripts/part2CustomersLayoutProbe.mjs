/**
 * Read-only headed layout probe on staging /customers (and optionally first customer detail).
 * Uses shared staging smoke browser context (1404×856 CSS px, deviceScaleFactor 2).
 *
 * Post-login blocking UI mirrors Part 2 Limit Dialog handling (automatic trial dialog).
 *
 * Requires: EPOSE_SMOKE_PART2_EMAIL, EPOSE_SMOKE_PART2_PASSWORD
 *
 * Customers list + detail (auto-close):
 *   node scripts/part2CustomersLayoutProbe.mjs
 *
 * Headed Customers viewport check — list only, press Enter to close browser:
 *   EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' \
 *     node scripts/part2CustomersLayoutProbe.mjs --viewport-probe
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { chromium, expect } from '@playwright/test';
import {
    STAGING_SMOKE_DEVICE_SCALE_FACTOR,
    STAGING_SMOKE_VIEWPORT,
    stagingSmokeBrowserContextOptions,
} from '../configs/playwright/smoke/stagingSmokeBrowser.mjs';

const viewportProbeMode =
    process.argv.includes('--viewport-probe') || process.env.PART2_VIEWPORT_PROBE === '1';

const OUT = viewportProbeMode
    ? path.join(process.cwd(), 'test-output/viewport-probe/customers')
    : path.join(process.cwd(), 'test-output/part2-headed-layout-probe');
const LOGIN_URL = 'https://app-stg.epose.com/login';

const PART2_CONTEXT = stagingSmokeBrowserContextOptions();

const ACTION_TIMEOUT_MS = 15000;
/** Part 2: bounded wait for optional automatic Limit Dialog after login. */
const LIMIT_DIALOG_AUTOMATIC_OBSERVATION_MS = 8000;
const LIMIT_DIALOG_IDENTIFYING_TEXT = '2週間のトライアルは終了いたしました。';
const LIMIT_DIALOG_CURRENT_PLAN_TEXT = 'フリープラン';
const LIMIT_DIALOG_CLOSE_LABEL = '閉じる';
const SESSION_TAKEOVER_DIALOG_NAME =
    '本アカウントは別の端末で使用中です。この端末でログインしますか？';
const ONLINE_BOOKING_ONBOARDING_HEADING = 'オンラインで使い方の説明を受ける';
const PHONEBOOK_SET_LOADING_SELECTOR = '#phonebook-set-loading';

function limitDialogRoot(page) {
    const marker = LIMIT_DIALOG_IDENTIFYING_TEXT.trim();
    return page.getByRole('dialog').filter({ hasText: marker });
}

async function dismissLimitDialog(page) {
    const dialog = limitDialogRoot(page);
    await expect(dialog, 'Expected exactly one Limit Dialog').toHaveCount(1);
    await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(
        dialog.getByText(LIMIT_DIALOG_CURRENT_PLAN_TEXT, { exact: true }),
        'Expected current plan フリープラン inside Limit Dialog'
    ).toBeVisible();
    const closeButton = dialog.getByRole('button', {
        name: LIMIT_DIALOG_CLOSE_LABEL,
        exact: true,
    });
    await expect(closeButton, 'Expected exactly one 閉じる in Limit Dialog').toHaveCount(1);
    await expect(closeButton).toBeEnabled();
    await closeButton.click({ noWaitAfter: true });
    await expect(dialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
}

/**
 * Same bounded observation as limitDialogFlow.observeAutomaticLimitDialog.
 */
async function observeAutomaticLimitDialog(page) {
    const dialog = limitDialogRoot(page);
    try {
        await expect(dialog).toBeVisible({ timeout: LIMIT_DIALOG_AUTOMATIC_OBSERVATION_MS });
    } catch {
        return 'not_shown';
    }
    await dismissLimitDialog(page);
    return 'dismissed';
}

async function assertCustomerFlowNotBlocked(page) {
    if (await page.getByText(ONLINE_BOOKING_ONBOARDING_HEADING).isVisible().catch(() => false)) {
        throw new Error(
            'Online Booking onboarding overlay is blocking /customers (verified copy present).'
        );
    }
}

async function failBlockingOverlay(page, reason, modalText) {
    fs.mkdirSync(OUT, { recursive: true });
    const shot = path.join(OUT, 'blocking-modal-failure.png');
    await page.screenshot({ path: shot, fullPage: false });
    const payload = {
        reason,
        pathname: new URL(page.url()).pathname,
        modalText,
        screenshot: shot,
    };
    fs.writeFileSync(
        path.join(OUT, 'blocking-modal-failure.json'),
        JSON.stringify(payload, null, 2)
    );
    throw new Error(
        `${reason} Saved modal text and screenshot under test-output/part2-headed-layout-probe/.`
    );
}

/**
 * Fail fast if any visible dialog or ant modal wrap still blocks the customers shell.
 */
async function assertCustomersShellUnblocked(page, stepLabel) {
    const limitDialog = limitDialogRoot(page);
    if (await limitDialog.isVisible().catch(() => false)) {
        const text = await limitDialog.innerText().catch(() => '');
        await failBlockingOverlay(
            page,
            `Limit Dialog still visible after Part 2 dismissal (${stepLabel})`,
            text
        );
    }

    const sessionDialog = page.getByRole('dialog', { name: SESSION_TAKEOVER_DIALOG_NAME });
    if (await sessionDialog.isVisible().catch(() => false)) {
        const text = await sessionDialog.innerText().catch(() => '');
        await failBlockingOverlay(
            page,
            `Session takeover dialog still visible (${stepLabel})`,
            text
        );
    }

    const dialogs = page.getByRole('dialog');
    const dialogCount = await dialogs.count();
    for (let i = 0; i < dialogCount; i++) {
        const dialog = dialogs.nth(i);
        if (!(await dialog.isVisible().catch(() => false))) {
            continue;
        }
        const text = (await dialog.innerText().catch(() => '')).trim();
        await failBlockingOverlay(
            page,
            `Unknown role=dialog blocks customers shell (${stepLabel})`,
            text
        );
    }

    const wraps = page.locator('.ant-modal-wrap');
    const wrapCount = await wraps.count();
    for (let i = 0; i < wrapCount; i++) {
        const wrap = wraps.nth(i);
        if (!(await wrap.isVisible().catch(() => false))) {
            continue;
        }
        const text = (await wrap.innerText().catch(() => '')).trim();
        await failBlockingOverlay(
            page,
            `Visible ant-modal-wrap overlay blocks customers shell (${stepLabel})`,
            text
        );
    }
}

async function prepareCustomersShellAfterLogin(page) {
    await expect(page).toHaveURL(/\/customers(?:\/|$|\?)/, { timeout: ACTION_TIMEOUT_MS });
    await expect(page.getByRole('img', { name: 'Menu' })).toBeVisible({
        timeout: ACTION_TIMEOUT_MS,
    });
    await assertCustomerFlowNotBlocked(page);
    const automaticOutcome = await observeAutomaticLimitDialog(page);
    const loading = page.locator(PHONEBOOK_SET_LOADING_SELECTOR);
    if ((await loading.count()) > 0) {
        await expect(loading).toBeHidden({ timeout: 30000 });
    }
    await expect(page.getByTestId('customer-list')).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    await expect(page.getByTestId('customer-list-loading')).toBeHidden({
        timeout: ACTION_TIMEOUT_MS,
    });
    await assertCustomersShellUnblocked(page, 'after post-login Limit Dialog handling');
    return { automaticLimitDialog: automaticOutcome };
}

async function measureLayout(page) {
    return page.evaluate(() => {
        const probes = ['main', '.ant-layout', '#root', '#root > div'];
        let best = null;
        for (const sel of probes) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const entry = {
                selector: sel,
                width: Math.round(rect.width),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                maxWidth: cs.maxWidth,
                marginLeft: cs.marginLeft,
                marginRight: cs.marginRight,
            };
            if (!best || rect.width < window.innerWidth) {
                best = entry;
            }
        }
        const sideMargin =
            best != null ? Math.round((window.innerWidth - best.width) / 2) : null;
        return {
            pathname: location.pathname,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
            container: best,
            symmetricSideMarginPx: sideMargin,
        };
    });
}

async function dismissLoginPageIncidentals(page) {
    const loginClose = page.locator('button', { hasText: 'とじる' });
    if (await loginClose.isVisible().catch(() => false)) {
        await loginClose.click();
    }
}

async function loginPart2(page, email, password) {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismissLoginPageIncidentals(page);
    await page.getByRole('textbox', { name: 'メールアドレス' }).fill(email);
    await page.getByRole('textbox', { name: 'パスワード' }).fill(password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    const takeoverDialog = page.getByRole('dialog', { name: SESSION_TAKEOVER_DIALOG_NAME });
    try {
        await expect(takeoverDialog).toBeVisible({ timeout: 8000 });
        const continueButton = takeoverDialog.getByRole('button', { name: '続行する' });
        await expect(continueButton).toHaveCount(1);
        await continueButton.click();
        await expect(takeoverDialog).toBeHidden({ timeout: ACTION_TIMEOUT_MS });
    } catch {
        /* No simultaneous-login dialog. */
    }
    await page.waitForURL(/\/customers/, { timeout: 90000 });
}

async function openFirstCustomerRow(page) {
    await assertCustomersShellUnblocked(page, 'before customer-row click');
    const row = page.getByTestId('customer-row').first();
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
    try {
        await row.click({ timeout: ACTION_TIMEOUT_MS });
    } catch (err) {
        await assertCustomersShellUnblocked(page, 'customer-row click intercepted');
        throw err;
    }
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}(?:\/|$|\?)/i, {
        timeout: ACTION_TIMEOUT_MS,
    });
    await expect(page.getByRole('main')).toBeVisible({ timeout: ACTION_TIMEOUT_MS });
}

async function captureStep(page, label, extra = {}) {
    fs.mkdirSync(OUT, { recursive: true });
    const metrics = await measureLayout(page);
    const shot = path.join(OUT, `${label}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    const report = {
        label,
        effectiveContext: {
            viewport: PART2_CONTEXT.viewport,
            deviceScaleFactor: PART2_CONTEXT.deviceScaleFactor,
        },
        metrics,
        screenshot: shot,
        ...extra,
    };
    fs.writeFileSync(path.join(OUT, `${label}.json`), JSON.stringify(report, null, 2));
    return report;
}

const email = process.env.EPOSE_SMOKE_PART2_EMAIL?.trim() ?? '';
const password = process.env.EPOSE_SMOKE_PART2_PASSWORD ?? '';
if (!email || !password) {
    console.error(
        'Missing EPOSE_SMOKE_PART2_EMAIL or EPOSE_SMOKE_PART2_PASSWORD — set both before running.'
    );
    process.exit(1);
}

function waitForEnterInTerminal() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        console.log('\nBrowser left open on /customers for manual layout inspection.');
        console.log('Press Enter in this terminal to close the browser and exit.\n');
        rl.question('', () => {
            rl.close();
            resolve();
        });
    });
}

const browser = await chromium.launch({ headless: false, slowMo: viewportProbeMode ? 0 : 200 });
const context = await browser.newContext(PART2_CONTEXT);
const page = await context.newPage();

await loginPart2(page, email, password);
const shellPrep = await prepareCustomersShellAfterLogin(page);
await assertCustomersShellUnblocked(page, 'before customers list capture');
const screenshotLabel = viewportProbeMode
    ? 'customers-list-viewport-probe-1404-dpr2'
    : 'customers-list-part2-1404-dpr2';
const customersList = await captureStep(page, screenshotLabel, {
    limitDialog: shellPrep,
});

const viewportReport = {
    mode: viewportProbeMode ? 'viewport-probe' : 'list-and-detail',
    outputDir: OUT,
    playwrightViewport: STAGING_SMOKE_VIEWPORT,
    deviceScaleFactor: STAGING_SMOKE_DEVICE_SCALE_FACTOR,
    pageMetrics: customersList.metrics,
    customersListCapture: customersList,
};

console.log(
    JSON.stringify(
        {
            effectiveViewport: viewportReport.playwrightViewport,
            deviceScaleFactor: viewportReport.deviceScaleFactor,
            innerWidth: customersList.metrics.innerWidth,
            innerHeight: customersList.metrics.innerHeight,
            devicePixelRatio: customersList.metrics.devicePixelRatio,
            pathname: customersList.metrics.pathname,
            screenshot: customersList.screenshot,
            reportJson: path.join(OUT, `${screenshotLabel}.json`),
        },
        null,
        2
    )
);

const summary = [customersList];

if (!viewportProbeMode) {
    await openFirstCustomerRow(page);
    await assertCustomersShellUnblocked(page, 'before customer detail capture');
    const customerDetail = await captureStep(page, 'customer-detail-part2-1404-dpr2');
    summary.push(customerDetail);
    await browser.close();
} else {
    fs.writeFileSync(
        path.join(OUT, 'customers-viewport-probe-summary.json'),
        JSON.stringify(viewportReport, null, 2)
    );
    await waitForEnterInTerminal();
    await browser.close();
}

fs.writeFileSync(path.join(OUT, 'customers-probe-summary.json'), JSON.stringify(summary, null, 2));
if (!viewportProbeMode) {
    console.log(JSON.stringify(summary, null, 2));
}
