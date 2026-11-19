import { test, expect } from '@playwright/test';
import { TakeoverRunTracker } from './takeoverReporting';

test('CIRS_TAKEOVER_DELETE_FAILED keeps deleteVerified false after server confirm', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new TakeoverRunTracker();
        tracker.handoverId = 'handover-1';
        tracker.deleteAttempted = true;
        tracker.deleteServerConfirmed = true;
        tracker.deleteServerConfirmed = true;
        tracker.logDeleteFailed(new Error('target still listed'), '/customers/c1/interaction-records/r1');
    } finally {
        console.log = original;
    }
    const failedLine = lines.find((line) => line.startsWith('CIRS_TAKEOVER_DELETE_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_TAKEOVER_DELETE_FAILED '.length));
    expect(payload.deleteVerified).toBe(false);
    expect(payload.deleteServerConfirmed).toBe(true);
});

test('CIRS_TAKEOVER_READ_VERIFIED records read completion', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new TakeoverRunTracker();
        tracker.logCrudStarted('/customers/c1/interaction-records/r1', 'c1', 'r1');
        tracker.readVerified = true;
        tracker.logReadVerified('/customers/c1/interaction-records/r1');
    } finally {
        console.log = original;
    }
    const verifiedLine = lines.find((line) => line.startsWith('CIRS_TAKEOVER_READ_VERIFIED '));
    expect(verifiedLine).toBeDefined();
    const payload = JSON.parse(verifiedLine!.slice('CIRS_TAKEOVER_READ_VERIFIED '.length));
    expect(payload.readVerified).toBe(true);
});
