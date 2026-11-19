import { test, expect } from '@playwright/test';
import { HandwrittenNotesRunTracker } from './handwrittenNotesReporting';

test('CIRS_HANDWRITTEN_FAILED preserves lastCompletedStep and noteId on create-only flow', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new HandwrittenNotesRunTracker({ accountEmail: 'fixture@example.com' });
        tracker.logStarted('/customers/c1/interaction-records/r1', 'c1', 'r1');
        tracker.stepCompleted('identity verification');
        tracker.stepStarted('note create');
        tracker.createAttempted = true;
        tracker.logFailed(new Error('operation-success create timeout'), '/customers/c1/interaction-records/r1/memo/new');
    } finally {
        console.log = original;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_HANDWRITTEN_FAILED '.length));
    expect(payload.lastCompletedStep).toBe('identity verification');
    expect(payload.lastStartedStep).toBe('note create');
    expect(payload.noteRetainedOnStaging).toBe(true);
    expect(payload.deleteServerConfirmed).toBe(false);
    expect(payload.coverage).toBe('Handwritten Note creation');
});

test('CIRS_HANDWRITTEN_UPDATE_FAILED keeps updateVerified false', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new HandwrittenNotesRunTracker({ accountEmail: 'fixture@example.com' });
        tracker.logUpdateStarted('/customers/c1/interaction-records/r1', 'c1', 'r1', 'note-1');
        tracker.logUpdateFailed(new Error('operation-success update timeout'), '/customers/c1/interaction-records/r1/memo/note-1');
    } finally {
        console.log = original;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_UPDATE_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_HANDWRITTEN_UPDATE_FAILED '.length));
    expect(payload.updateVerified).toBe(false);
    expect(payload.noteId).toBe('note-1');
    expect(payload.lastStartedStep).toBe('note update');
});

test('CIRS_HANDWRITTEN_UPDATE_VERIFIED records update completion', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new HandwrittenNotesRunTracker();
        tracker.logUpdateStarted('/customers/c1/interaction-records/r1', 'c1', 'r1', 'note-1');
        tracker.logUpdateVerified('/customers/c1/interaction-records/r1');
    } finally {
        console.log = original;
    }

    const verifiedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_UPDATE_VERIFIED '));
    expect(verifiedLine).toBeDefined();
    const payload = JSON.parse(verifiedLine!.slice('CIRS_HANDWRITTEN_UPDATE_VERIFIED '.length));
    expect(payload.updateVerified).toBe(true);
    expect(payload.lastCompletedStep).toBe('note update');
});

test('CIRS_HANDWRITTEN_DELETE_FAILED keeps deleteVerified false after server confirm', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new HandwrittenNotesRunTracker();
        tracker.logDeleteStarted('/customers/c1/interaction-records/r1', 'c1', 'r1', 'note-1');
        tracker.deleteAttempted = true;
        tracker.deleteServerConfirmed = true;
        tracker.logDeleteFailed(new Error('target note still listed after reload'), '/customers/c1/interaction-records/r1');
    } finally {
        console.log = original;
    }

    const failedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_DELETE_FAILED '));
    expect(failedLine).toBeDefined();
    const payload = JSON.parse(failedLine!.slice('CIRS_HANDWRITTEN_DELETE_FAILED '.length));
    expect(payload.deleteVerified).toBe(false);
    expect(payload.deleteServerConfirmed).toBe(true);
    expect(payload.noteRetainedOnStaging).toBe(true);
});

test('CIRS_HANDWRITTEN_DELETE_VERIFIED records delete completion', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    };
    try {
        const tracker = new HandwrittenNotesRunTracker();
        tracker.logDeleteStarted('/customers/c1/interaction-records/r1', 'c1', 'r1', 'note-1');
        tracker.deleteServerConfirmed = true;
        tracker.logDeleteVerified('/customers/c1/interaction-records/r1');
    } finally {
        console.log = original;
    }

    const verifiedLine = lines.find((line) => line.startsWith('CIRS_HANDWRITTEN_DELETE_VERIFIED '));
    expect(verifiedLine).toBeDefined();
    const payload = JSON.parse(verifiedLine!.slice('CIRS_HANDWRITTEN_DELETE_VERIFIED '.length));
    expect(payload.deleteVerified).toBe(true);
    expect(payload.noteRetainedOnStaging).toBe(false);
    expect(payload.lastCompletedStep).toBe('note delete');
});
