import { test, expect } from '@playwright/test';
import { login } from "../../utils/login";
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

test('analysis report', async ({ page }) => {
    test.setTimeout(500000);
    await login(page, {
        email: requireEnv('EPOSE_ANALYSIS_REPORT_EMAIL'),
        password: requireEnv('EPOSE_ANALYSIS_REPORT_PASSWORD'),
    });

    await page.getByRole('img').nth(4).click();

    await page.locator('img[alt="posture analysis image"]').click();

    const header = page.locator('.hide-on-print > div > div:nth-child(2)');

    await expect(header.locator('div:nth-child(1) > div:nth-child(2)')).toBeVisible();
    await expect(header.locator('div:nth-child(2) > div:nth-child(2)')).toBeVisible();
    await expect(header.locator('div:nth-child(3) > div:nth-child(2)')).toBeVisible();
    await expect(header.locator('div:nth-child(4) > div:nth-child(2)')).toBeVisible();
    await expect(header.locator('div:nth-child(5) > div:nth-child(2)')).toBeVisible();

    page.waitForLoadState('domcontentloaded')
    const sideStanding = page.locator('#item1 > div:nth-child(2)');
    //await expect(sideStanding.locator('div:nth-child(1) > img')).toBeVisible();
    const sideStandingGraph = sideStanding.locator('div:nth-child(2) > div > div:nth-child(3)');
    await expect(sideStandingGraph.locator('div:nth-child(3) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(4) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(5) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(6) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(7) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(8) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(9) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(10) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(sideStandingGraph.locator('div:nth-child(11) > div:nth-child(2) > div > div > svg')).toBeVisible();

    const frontStanding = page.locator('#item2 > div');
    //await expect(frontStanding.locator('div:nth-child(1) > img')).toBeVisible();
    const frontStandingGraph = frontStanding.locator('div:nth-child(2) > div > div:nth-child(3)');
    await expect(frontStandingGraph.locator('div:nth-child(3) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(4) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(5) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(6) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(7) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(8) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(9) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(10) > div:nth-child(2) > div > div > svg')).toBeVisible();
    await expect(frontStandingGraph.locator('div:nth-child(11) > div:nth-child(2) > div > div > svg')).toBeVisible();

    const postureType = page.locator('#item3');
    await expect(postureType.locator('div').filter({ hasText: /^猫背$/ })).toBeVisible();
    await expect(postureType.locator('div:nth-child(3) > div:nth-child(1) > img')).toBeVisible();
    await expect(page.locator('path').first()).toBeVisible();
    await expect(page.locator('path').nth(1)).toBeVisible();
    await expect(page.locator('path').nth(2)).toBeVisible();
    await expect(page.locator('path').nth(3)).toBeVisible();
    await expect(page.locator('path').nth(4)).toBeVisible();
    await expect(page.locator('path').nth(5)).toBeVisible();
    await expect(page.locator('g:nth-child(14) > .recharts-rectangle').first()).toBeVisible();
    await expect(page.locator('g:nth-child(16) > .recharts-rectangle').first()).toBeVisible();
    await expect(page.locator('image').first()).toBeVisible();
    await expect(page.locator('image').nth(1)).toBeVisible();

    const xoLegs = page.locator('#item4 > div:nth-child(2)');
    await expect(xoLegs.locator('div:nth-child(1) > div:nth-child(1) > img:nth-child(1)')).toBeVisible();
    await expect(xoLegs.locator('div:nth-child(1) > div:nth-child(1) > img:nth-child(2)')).toBeVisible();
    await expect(xoLegs.locator('div:nth-child(1) > div:nth-child(2)').first()).toBeVisible();
    await expect(xoLegs.locator('div:nth-child(2) > div:nth-child(1)').first()).toBeVisible();
    await expect(xoLegs.locator('div:nth-child(2) > div:nth-child(2)').first()).toBeVisible();

    const muscleCondition = page.locator('#item5 > div:nth-child(2)');

    if (await muscleCondition.getByText("正常な姿勢です。").count() > 0) {
        await expect(await page.getByText('全筋肉を表示')).toBeDisabled();
        await expect(await page.getByText('全筋肉を非表示')).toBeDisabled();
        await expect(await page.getByText('該当する筋肉はありません').first()).toBeVisible();
        await expect(await page.getByText('該当する筋肉はありません').nth(1)).toBeVisible();
        await expect(await page.getByText('表 示').first()).toBeDisabled();
        await expect(await page.getByText('表 示').nth(1)).toBeDisabled();
        await expect(await page.getByText('非表示').first()).toBeDisabled();
        await expect(await page.getByText('非表示').nth(1)).toBeDisabled();
        await expect(await page.getByText('エクササイズとストレッチ')).not.toBeVisible();
    } else {
        await expect(await page.getByText('全筋肉を表示')).toBeEnabled();
        await expect(await page.getByText('全筋肉を非表示')).toBeEnabled();
        await expect(await page.getByText('表 示').first()).toBeEnabled();
        await expect(await page.getByText('表 示').nth(1)).toBeEnabled();
        await expect(await page.getByText('非表示').first()).toBeEnabled();
        await expect(await page.getByText('非表示').nth(1)).toBeEnabled();
        const shortening = await muscleCondition.locator(".shortening-list > div:nth-child(2) > div").count()
        const stretching = await muscleCondition.locator(".stretching-list > div:nth-child(2) > div").count()
        if (shortening > 0 && stretching > 0) {
            const exercises = await page.locator('#item6 > div:nth-child(2) > div:nth-child(3) > div:nth-child(1)').isVisible();
            const stretches = await page.locator('#item6 > div:nth-child(2) > div:nth-child(6) > div:nth-child(1)').isVisible();
            !(exercises || stretches) && test.fail();
        } else {
            test.fail();
        }
    }
});