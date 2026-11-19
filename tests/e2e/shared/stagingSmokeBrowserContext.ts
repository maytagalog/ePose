import type { BrowserContextOptions } from '@playwright/test';
import { stagingSmokeBrowserContextOptions } from '../../../configs/playwright/smoke/stagingSmokeBrowser.mjs';

export {
    STAGING_SMOKE_DEVICE_SCALE_FACTOR,
    STAGING_SMOKE_VIEWPORT,
    stagingSmokeBrowserContextOptions,
} from '../../../configs/playwright/smoke/stagingSmokeBrowser.mjs';

export function newStagingSmokeBrowserContextOptions(
    overrides: BrowserContextOptions = {}
): BrowserContextOptions {
    return stagingSmokeBrowserContextOptions(overrides);
}