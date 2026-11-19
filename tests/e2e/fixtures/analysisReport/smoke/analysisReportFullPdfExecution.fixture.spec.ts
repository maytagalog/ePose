import { test, expect } from '@playwright/test';
import {
    describePdfExecutionContextForEvidence,
    probeChromiumHeadedPagePdfSupported,
    resolveFullSmokePdfExecutionContext,
    resolveFullSmokePdfExecutionPlan,
    usesAuxiliaryHeadlessPdfContext,
} from '../../../../analysisReport/smoke/analysisReportFullPdfExecution';

test('headless primary uses in-browser PDF context', async () => {
    const plan = await resolveFullSmokePdfExecutionPlan({
        browserName: 'chromium',
        primaryHeadless: true,
        primaryPage: {} as never,
    });
    expect(plan.context).toBe('primary-headless-chromium');
    expect(plan.headedPagePdfSupported).toBeNull();
    expect(usesAuxiliaryHeadlessPdfContext(plan.context)).toBe(false);
});

test('headed primary resolves via page.pdf probe', async ({ page, browser }) => {
    test.skip(browser.browserType().name() !== 'chromium', 'Chromium only');
    const plan = await resolveFullSmokePdfExecutionPlan({
        browserName: 'chromium',
        primaryHeadless: false,
        primaryPage: page,
    });
    const probed = await probeChromiumHeadedPagePdfSupported(page);
    expect(plan.headedPagePdfSupported).toBe(probed);
    if (probed) {
        expect(plan.context).toBe('primary-headed-chromium');
    } else {
        expect(plan.context).toBe('auxiliary-headless-chromium');
    }
});

test('static headed fallback without probe uses auxiliary path', () => {
    const context = resolveFullSmokePdfExecutionContext({
        browserName: 'chromium',
        primaryHeadless: false,
    });
    expect(context).toBe('auxiliary-headless-chromium');
});

test('non-chromium primary is rejected', async ({ page }) => {
    await expect(
        resolveFullSmokePdfExecutionPlan({
            browserName: 'firefox',
            primaryHeadless: true,
            primaryPage: page,
        })
    ).rejects.toThrow(/Chromium/);
});

test('evidence text distinguishes probe outcomes', () => {
    expect(describePdfExecutionContextForEvidence('auxiliary-headless-chromium', false)).toMatch(/probe failed/);
    expect(describePdfExecutionContextForEvidence('primary-headed-chromium', true)).toMatch(/probe succeeded/);
});
