import { test, expect } from '@playwright/test';
import { CirsResponseDetailsRunTracker } from './responseDetailsReporting';
import { responseInputHasExistingContent } from './responseDetailsFlow';

test('responseInputHasExistingContent treats whitespace-only as empty', () => {
    expect(responseInputHasExistingContent('')).toBe(false);
    expect(responseInputHasExistingContent('   \n\t')).toBe(false);
    expect(responseInputHasExistingContent('note')).toBe(true);
});

test('CIRS_RESPONSE_DETAILS_FAILED preserves lastCompletedStep after autosave start', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new CirsResponseDetailsRunTracker({ accountEmail: 'fixture@example.com' });
        tracker.logStarted('/customers/c1/interaction-records/r1', 'c1', 'r1', 'Staging Smoke Automation Testing 2026-10-27');
        tracker.stepCompleted('identity verification');
        tracker.stepStarted('autosave');
        tracker.logFailed(new Error('data-save-state timeout'), '/customers/c1/interaction-records/r1');
    } finally {
        console.log = original;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_RESPONSE_DETAILS_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_RESPONSE_DETAILS_FAILED '.length));
    expect(payload.lastStartedStep).toBe('autosave');
    expect(payload.lastCompletedStep).toBe('identity verification');
    expect(payload.persistenceVerified).toBeUndefined();
});

test('skip path emits SKIPPED not SAVED and COMPLETED without autosaveVerified', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new CirsResponseDetailsRunTracker({ accountEmail: 'fixture@example.com' });
        tracker.logStarted('/customers/c1/interaction-records/r1', 'c1', 'r1', 'Staging Smoke Automation Testing 2026-10-27');
        tracker.logSkippedExistingContent('/customers/c1/interaction-records/r1', 'existing body');
        tracker.logCompleted('/customers/c1/interaction-records/r1');
    } finally {
        console.log = original;
    }

    expect(lines.some((l) => l.startsWith('CIRS_RESPONSE_DETAILS_SAVED '))).toBe(false);
    const skipped = lines.find((l) => l.startsWith('CIRS_RESPONSE_DETAILS_SKIPPED '));
    expect(skipped).toBeDefined();
    const skippedPayload = JSON.parse(skipped!.slice('CIRS_RESPONSE_DETAILS_SKIPPED '.length));
    expect(skippedPayload.saveOutcome).toBe('skipped_existing_content');
    expect(skippedPayload.savedTimestamp).toBeUndefined();
    expect(skippedPayload.autosaveVerified).toBeUndefined();

    const completed = lines.find((l) => l.startsWith('CIRS_RESPONSE_DETAILS_COMPLETED '));
    expect(completed).toBeDefined();
    const completedPayload = JSON.parse(completed!.slice('CIRS_RESPONSE_DETAILS_COMPLETED '.length));
    expect(completedPayload.persistenceVerified).toBeUndefined();
});
