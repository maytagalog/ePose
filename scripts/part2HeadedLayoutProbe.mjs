/**
 * Read-only headed layout probe (staging /login). Does not run Part 2 smoke.
 * Usage: node scripts/part2HeadedLayoutProbe.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const OUT = path.join(process.cwd(), 'test-output/part2-headed-layout-probe');
const LOGIN_URL = 'https://app-stg.epose.com/login';

const profiles = [
    {
        label: 'before-desktop-chrome-default',
        options: { ...devices['Desktop Chrome'] },
    },
    {
        label: 'after-part2-target-1404-dpr2',
        options: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1404, height: 856 },
            deviceScaleFactor: 2,
        },
    },
];

async function measureLayout(page) {
    return page.evaluate(() => {
        const probes = [
            'main',
            '.ant-layout',
            '#root',
            '#root > div',
        ];
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
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            outerWidth: window.outerWidth,
            outerHeight: window.outerHeight,
            devicePixelRatio: window.devicePixelRatio,
            visualViewportScale: window.visualViewport?.scale ?? null,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            container: best,
            symmetricSideMarginPx: sideMargin,
        };
    });
}

async function runProfile({ label, options }) {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({
        headless: false,
        slowMo: 200,
    });
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const metrics = await measureLayout(page);
    const shot = path.join(OUT, `${label}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    await browser.close();
  const report = { label, contextOptions: {
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor,
    screen: options.screen,
  }, metrics, screenshot: shot };
    fs.writeFileSync(
        path.join(OUT, `${label}.json`),
        JSON.stringify(report, null, 2)
    );
    return report;
}

const results = [];
for (const profile of profiles) {
    results.push(await runProfile(profile));
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
