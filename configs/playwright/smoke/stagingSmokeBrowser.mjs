import { devices } from '@playwright/test';

/** CSS layout viewport for headed staging smoke (matches Part 2 / AR probes). */
export const STAGING_SMOKE_VIEWPORT = { width: 1404, height: 856 };

/** Retina screenshots; does not change CSS layout width (viewport width does). */
export const STAGING_SMOKE_DEVICE_SCALE_FACTOR = 2;

/**
 * Playwright browser-context options aligned with Part 2 smoke and layout probes.
 */
export function stagingSmokeBrowserContextOptions(overrides = {}) {
    return {
        ...devices['Desktop Chrome'],
        viewport: STAGING_SMOKE_VIEWPORT,
        deviceScaleFactor: STAGING_SMOKE_DEVICE_SCALE_FACTOR,
        ...overrides,
    };
}

/** Merge into playwright project `use` for smoke configs. */
export const stagingSmokeProjectUse = stagingSmokeBrowserContextOptions();