import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AUTH_PROFILE_URL } from '../mypage/profile/myPageProfileFlow';
import {
    ONLINE_BOOKING_ONBOARDING_HEADING,
    SESSION_TAKEOVER_DIALOG_ACCESSIBLE_NAME,
    type Part2LoginEnvironment,
    loginExistingUserForPart2,
    sessionTakeoverModalRoot,
    verifyExistingUserCustomersReady,
} from './existingUserLoginFlow';

const e2eFixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../e2e/fixtures'
);
const FIXTURE_ORIGIN = 'https://fixture.test';

const FIXTURE_LOGIN_ENV: Part2LoginEnvironment = {
    loginUrl: `${FIXTURE_ORIGIN}/login`,
    appOrigin: FIXTURE_ORIGIN,
    requireStagingCustomersOrigin: false,
};

test.beforeEach(async ({}, testInfo) => {
    if (testInfo.title.includes('loginExistingUserForPart2')) {
        test.setTimeout(120000);
    }
});

function loadFixture(name: string): string {
    return fs.readFileSync(path.join(e2eFixturesDir, name), 'utf8');
}

async function installCustomersProfileRoute(
    page: import('@playwright/test').Page,
    profileEmail: string,
    profileStatus = 200
): Promise<void> {
    await page.route(AUTH_PROFILE_URL, async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        if (profileStatus !== 200) {
            await route.fulfill({
                status: profileStatus,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'fixture failure' }),
            });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ email: profileEmail }),
        });
    });
}

test('loginExistingUserForPart2: direct login success with auth/profile identity', async ({
    page,
}) => {
    const accountEmail = 'direct-success@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/login`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2LoginDirectSuccess.html'),
        });
    });
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('existingUserCustomersLanding.html'),
        });
    });
    await installCustomersProfileRoute(page, accountEmail);

    const readiness = await loginExistingUserForPart2(
        page,
        { email: accountEmail, password: 'fixture-password' },
        { env: FIXTURE_LOGIN_ENV }
    );

    expect(readiness.profileEmailVerified).toBe(true);
    expect(readiness.identityEvidence.status).toBe('verified');
    expect(readiness.takeoverDetected).toBe(false);
    expect(readiness.takeoverConfirmed).toBe(false);
    await expect(page).toHaveURL(`${FIXTURE_ORIGIN}/customers`);
});

test('loginExistingUserForPart2: session takeover modal — one Continue, identity after /customers', async ({
    page,
}) => {
    const accountEmail = 'session-takeover@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/login`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2LoginSessionTakeoverModal.html'),
        });
    });
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('existingUserCustomersLanding.html'),
        });
    });

    let profilePostCount = 0;
    await page.route(AUTH_PROFILE_URL, async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        profilePostCount += 1;
        const email =
            profilePostCount === 1 ? 'premature-on-login@fixture.test' : accountEmail;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ email }),
        });
    });

    const readiness = await loginExistingUserForPart2(
        page,
        { email: accountEmail, password: 'fixture-password' },
        { env: FIXTURE_LOGIN_ENV }
    );

    expect(readiness.takeoverDetected).toBe(true);
    expect(readiness.takeoverConfirmed).toBe(true);
    expect(readiness.profileEmailVerified).toBe(true);
    expect(readiness.identityEvidence.status).toBe('verified');
    expect(profilePostCount).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => sessionStorage.getItem('part2TakeoverContinueClicks'))).toBe(
        '1'
    );
    await expect(
        sessionTakeoverModalRoot(page)
    ).toHaveCount(0);
    await expect(
        page.getByRole('dialog', {
            name: SESSION_TAKEOVER_DIALOG_ACCESSIBLE_NAME,
            exact: true,
        })
    ).toHaveCount(0);
    await expect(page).toHaveURL(`${FIXTURE_ORIGIN}/customers`);
});

test('loginExistingUserForPart2: session takeover then preserves generic customers dialog', async ({
    page,
}) => {
    const accountEmail = 'takeover-then-dialog@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/login`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2LoginSessionTakeoverModal.html'),
        });
    });
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2CustomersMenuWithDialog.html'),
        });
    });
    await installCustomersProfileRoute(page, accountEmail);

    const readiness = await loginExistingUserForPart2(
        page,
        { email: accountEmail, password: 'fixture-password' },
        { env: FIXTURE_LOGIN_ENV }
    );

    expect(readiness.takeoverDetected).toBe(true);
    expect(readiness.takeoverConfirmed).toBe(true);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Fixture generic post-login dialog/)).toBeVisible();
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { __dialogDismissClickCount?: number })
                    .__dialogDismissClickCount ?? 0
        )
    ).toBe(0);
});

test('loginExistingUserForPart2: rejects wrong-account auth/profile email', async ({
    page,
}) => {
    const accountEmail = 'expected@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/login`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2LoginDirectSuccess.html'),
        });
    });
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('existingUserCustomersLanding.html'),
        });
    });
    await installCustomersProfileRoute(page, 'other@fixture.test');

    await expect(
        loginExistingUserForPart2(
            page,
            { email: accountEmail, password: 'fixture-password' },
            { env: FIXTURE_LOGIN_ENV }
        )
    ).rejects.toThrow(/auth\/profile email/);
});

test('loginExistingUserForPart2: fails on observed auth/profile HTTP error', async ({
    page,
}) => {
    const accountEmail = 'profile-error@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/login`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2LoginDirectSuccess.html'),
        });
    });
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('existingUserCustomersLanding.html'),
        });
    });
    await installCustomersProfileRoute(page, accountEmail, 503);

    await expect(
        loginExistingUserForPart2(
            page,
            { email: accountEmail, password: 'fixture-password' },
            { env: FIXTURE_LOGIN_ENV }
        )
    ).rejects.toThrow(/auth\/profile responded with HTTP 503/);
});

test('loginExistingUserForPart2: leaves generic post-login dialog open (no dismissal clicks)', async ({
    page,
}) => {
    const accountEmail = 'dialog-preservation@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/login`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2LoginDirectSuccess.html'),
        });
    });
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2CustomersMenuWithDialog.html'),
        });
    });
    await installCustomersProfileRoute(page, accountEmail);

    await loginExistingUserForPart2(
        page,
        { email: accountEmail, password: 'fixture-password' },
        { env: FIXTURE_LOGIN_ENV }
    );

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Fixture generic post-login dialog/)).toBeVisible();
    expect(
        await page.evaluate(() => (window as unknown as { __dialogDismissClickCount?: number }).__dialogDismissClickCount ?? 0)
    ).toBe(0);
});

test('verifyExistingUserCustomersReady: rejects injected auth/profile email mismatch', async ({
    page,
}) => {
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: '<img role="img" alt="Menu" />',
        });
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await expect(
        verifyExistingUserCustomersReady(
            page,
            { email: 'expected@fixture.test', password: 'x' },
            {
                env: FIXTURE_LOGIN_ENV,
                identityEvidence: {
                    status: 'verified',
                    authProfile: { email: 'other@fixture.test' },
                },
            }
        )
    ).rejects.toThrow(/auth\/profile email/);
});

test('verifyExistingUserCustomersReady: propagates observed profile failure evidence', async ({
    page,
}) => {
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: '<img role="img" alt="Menu" />',
        });
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    await expect(
        verifyExistingUserCustomersReady(
            page,
            { email: 'user@fixture.test', password: 'x' },
            {
                env: FIXTURE_LOGIN_ENV,
                identityEvidence: {
                    status: 'failed',
                    reason: 'auth/profile responded with HTTP 500',
                    httpStatus: 500,
                },
            }
        )
    ).rejects.toThrow(/HTTP 500/);
});

test('verifyExistingUserCustomersReady: does not wait for load when URL already matches /customers', async ({
    page,
}) => {
    const accountEmail = 'existing-user@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: `<!DOCTYPE html><html><body>
              <img role="img" alt="Menu" />
              <script>window.__loadHung = true;</script>
            </body></html>`,
        });
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'commit' });

    const started = Date.now();
    await verifyExistingUserCustomersReady(
        page,
        { email: accountEmail, password: 'fixture-password' },
        {
            env: FIXTURE_LOGIN_ENV,
            identityEvidence: {
                status: 'verified',
                authProfile: { email: accountEmail },
            },
        }
    );
    expect(Date.now() - started).toBeLessThan(5000);
});

test('beginAuthProfileLoginCapture: deferred timer survives slow landing before auth/profile', async ({
    page,
}) => {
    const accountEmail = 'deferred-capture@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/login`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('part2LoginSessionTakeoverModal.html'),
        });
    });
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('existingUserCustomersLanding.html'),
        });
    });

    let profilePosts = 0;
    await page.route(AUTH_PROFILE_URL, async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        profilePosts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ email: accountEmail }),
        });
    });

    const readiness = await loginExistingUserForPart2(
        page,
        { email: accountEmail, password: 'fixture-password' },
        { env: FIXTURE_LOGIN_ENV, authProfileTimeoutMs: 8000 }
    );

    expect(readiness.identityEvidence.status).toBe('verified');
    expect(profilePosts).toBeGreaterThanOrEqual(1);
});

test('verifyExistingUserCustomersReady: Menu visible and no Online Booking onboarding', async ({
    page,
}) => {
    const accountEmail = 'existing-user@fixture.test';
    await page.route(`${FIXTURE_ORIGIN}/customers`, (route) => {
        route.fulfill({
            contentType: 'text/html',
            body: loadFixture('existingUserCustomersLanding.html'),
        });
    });
    await page.goto(`${FIXTURE_ORIGIN}/customers`, { waitUntil: 'domcontentloaded' });

    const readiness = await verifyExistingUserCustomersReady(
        page,
        { email: accountEmail, password: 'fixture-password' },
        {
            env: FIXTURE_LOGIN_ENV,
            identityEvidence: {
                status: 'verified',
                authProfile: { email: accountEmail },
            },
        }
    );

    expect(readiness.profileEmailVerified).toBe(true);
    await expect(page.getByRole('img', { name: 'Menu' })).toBeVisible();
    await expect(page.getByText(ONLINE_BOOKING_ONBOARDING_HEADING)).not.toBeVisible();
});
