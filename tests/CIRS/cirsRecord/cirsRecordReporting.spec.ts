import { test, expect } from '@playwright/test';
import { CirsRecordRunTracker, logCirsRecordEvent } from './cirsRecordReporting';

test('CIRS_RECORD_FAILED preserves lastCompletedStep from prior success', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new CirsRecordRunTracker({ accountEmail: 'fixture@example.com' });
        tracker.logStarted('/customers');
        tracker.logCustomerSelected('cust-id', 'Fixture Name', '/customers/cust-id');
        tracker.logCreated('record-id', '/customers/cust-id/interaction-records/record-id');
        tracker.logFailed(new Error('preview row mismatch'), '/customers/cust-id');
    } finally {
        console.log = original;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_RECORD_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_RECORD_FAILED '.length));
    expect(payload.lastCompletedStep).toBe('record create');
    expect(payload.lastStartedStep).toBeNull();
    expect(payload.createConfirmed).toBe(true);
    expect(payload.recordId).toBe('record-id');
    expect(payload.customerId).toBe('cust-id');
    expect(payload.failureReason).toMatch(/preview row mismatch/);
});

test('CIRS_RECORD_FAILED during full list keeps lastCompletedStep at preview verification', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new CirsRecordRunTracker({ accountEmail: 'fixture@example.com' });
        tracker.logStarted('/customers/cust-id');
        tracker.logCustomerSelected('cust-id', 'Fixture Name', '/customers/cust-id');
        tracker.logCreated('record-id', '/customers/cust-id/interaction-records/record-id');
        tracker.logPreviewVerified('/customers/cust-id');
        tracker.stepStarted('full list verification');
        tracker.logFailed(new Error('full cirs-record-list target row: data-customer-id'), '/customers/cust-id/interaction-records');
    } finally {
        console.log = original;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_RECORD_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_RECORD_FAILED '.length));
    expect(payload.lastStartedStep).toBe('full list verification');
    expect(payload.lastCompletedStep).toBe('preview verification');
});

test('logCirsRecordEvent emits JSON on one console line', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        logCirsRecordEvent('CIRS_RECORD_STARTED', { finalPathname: '/' });
    } finally {
        console.log = original;
    }
    expect(lines).toEqual(['CIRS_RECORD_STARTED {"finalPathname":"/"}']);
});
