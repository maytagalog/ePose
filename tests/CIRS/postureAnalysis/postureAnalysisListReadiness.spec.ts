import { test, expect } from '@playwright/test';
import { assertPostureAnalysisFullListReady } from './postureAnalysisFullListReadiness';
import { POSTURE_ANALYSIS_FULL_LIST_TEST_IDS } from './postureAnalysisFullListLocators';

test('history list without active spin, empty marker, or rows stays non-terminal', async ({ page }) => {
    await page.setContent(`
      <div data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyList}" style="min-height: 8px">
        <div class="ant-spin-nested-loading" data-testid="${POSTURE_ANALYSIS_FULL_LIST_TEST_IDS.historyLoading}"></div>
      </div>
    `);

    await expect(
        assertPostureAnalysisFullListReady(page, 'analysis_full_list')
    ).rejects.toThrow(/never reached a valid terminal state/i);
});
