import type { Page } from '@playwright/test';

const MAX_ENTRIES = 40;
const MAX_TEXT_LEN = 500;

export type SmokePageDiagnosticEntry = {
    kind: 'console' | 'pageerror';
    level?: string;
    text: string;
    url?: string;
};

export type SmokePageDiagnostics = {
    entries: SmokePageDiagnosticEntry[];
    detach: () => void;
    snapshot: () => SmokePageDiagnosticEntry[];
    logSnapshot: (label: string) => void;
};

function truncate(text: string): string {
    const t = text.trim();
    if (t.length <= MAX_TEXT_LEN) {
        return t;
    }
    return `${t.slice(0, MAX_TEXT_LEN)}…`;
}

export function attachSmokePageDiagnostics(page: Page): SmokePageDiagnostics {
    const entries: SmokePageDiagnosticEntry[] = [];

    const onConsole = (msg: { type: () => string; text: () => string; location: () => { url?: string } }) => {
        const level = msg.type();
        if (level !== 'error' && level !== 'warning') {
            return;
        }
        if (entries.length >= MAX_ENTRIES) {
            return;
        }
        entries.push({
            kind: 'console',
            level,
            text: truncate(msg.text()),
            url: msg.location()?.url,
        });
    };

    const onPageError = (error: Error) => {
        if (entries.length >= MAX_ENTRIES) {
            return;
        }
        entries.push({
            kind: 'pageerror',
            text: truncate(error.message || String(error)),
            url: page.url(),
        });
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    return {
        entries,
        detach: () => {
            page.off('console', onConsole);
            page.off('pageerror', onPageError);
        },
        snapshot: () => [...entries],
        logSnapshot: (label: string) => {
            console.log(
                'SMOKE_PAGE_DIAGNOSTICS',
                JSON.stringify({ label, entries: entries.slice() })
            );
        },
    };
}