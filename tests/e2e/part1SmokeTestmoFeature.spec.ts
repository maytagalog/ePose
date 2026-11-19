import { test, expect } from '@playwright/test';
import {
    PART1_TESTMO_CASE_DEFINITIONS,
    SmokePart1RunTracker,
    buildPart1TestmoCoverageReport,
    logPart1TestmoCoverage,
    logPart1TestmoCoverageFailed,
} from './shared/part1TestmoReporting';

/**
 * Synthetic Part 1 TestMo feature coverage for local JUnit / submit pipeline checks.
 * Classname matches stable automation bucket: e2e/part1SmokeTestmoFeature.spec.ts
 */
test.describe.configure({ retries: 0 });

test('part1-smoke-feature-reporting success path', () => {
    const tracker = new SmokePart1RunTracker('synthetic-part1@example.com');
    tracker.setResumedApplicationSubmit(false);

    for (const def of PART1_TESTMO_CASE_DEFINITIONS.filter((d) => !d.deferred)) {
        const key = def.key as keyof typeof tracker.outcomes;
        tracker.featureStarted(key);
        if (key === 'accountRegistration') {
            tracker.logRegistrationVerified({
                accountRegistrationComplete: true,
                registrationMode: 'fresh',
            });
            continue;
        }
        if (key === 'forgotPasswordSecondLogin') {
            tracker.logForgotPasswordVerified({
                accountEmail: 'synthetic-part1@example.com',
                resetSuccessVerified: true,
                loginAfterResetVerified: true,
                customersVisibleVerified: true,
            });
            continue;
        }
        tracker.verificationByKey[key] = { accountEmail: 'synthetic-part1@example.com', verified: true };
        tracker.featurePassed(key);
    }

    logPart1TestmoCoverage(tracker.buildCoverageInput(null));
});

test('part1-smoke-feature-reporting resumed registration evidence', () => {
    const tracker = new SmokePart1RunTracker('synthetic-resume@example.com');
    tracker.setResumedApplicationSubmit(true);
    tracker.featureStarted('accountRegistration');
    tracker.logRegistrationVerified({
        accountRegistrationComplete: true,
        registrationMode: 'resumed_application_submit_pending',
    });
    const report = buildPart1TestmoCoverageReport(tracker.buildCoverageInput(null));
    const regCase = report.cases.find((c) => c.key === 'accountRegistration');
    expect(regCase?.verificationDetails?.resumedApplicationSubmit).toBe(true);
    expect(regCase?.verificationDetails?.priorApplicationSubmitPerformedInThisRun).toBe(false);
});

test('part1-smoke-feature-reporting mid-flow failure preserves earlier passes', () => {
    const tracker = new SmokePart1RunTracker('synthetic-fail@example.com');
    tracker.featureStarted('accountRegistration');
    tracker.logRegistrationVerified({
        accountRegistrationComplete: true,
        registrationMode: 'fresh',
    });
    tracker.featureStarted('firstLogin');
    tracker.logFirstLoginVerified('synthetic-fail@example.com');
    tracker.featureStarted('onlineBooking');
    tracker.featureFailed('onlineBooking');
    const report = buildPart1TestmoCoverageReport(
        tracker.buildCoverageInput('online booking timeout', { playwrightAttachments: [] })
    );
    expect(report.cases.find((c) => c.key === 'firstLogin')?.status).toBe('Passed');
    expect(report.cases.find((c) => c.key === 'onlineBooking')?.status).toBe('Failed');
    expect(report.cases.find((c) => c.key === 'customerCreate')?.outcomeDetail).toContain('Not reached');
    logPart1TestmoCoverageFailed({
        ...tracker.buildCoverageInput('online booking timeout'),
        failureReason: 'online booking timeout',
    });
});