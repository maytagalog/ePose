import type { Page } from '@playwright/test';

export type PrintInterceptSnapshot = {
    invocationCount: number;
    titleAtInvocation: string | null;
};

export type PrintInterceptCleanupResult = {
    error: string | null;
};

const INTERCEPT_FLAG = '__eposeAnalysisReportPrintInterceptInstalled';
const ORIGINAL_PRINT_KEY = '__eposeOriginalWindowPrint';
const DESCRIPTOR_KEY = '__eposeOriginalWindowPrintDescriptor';
const CAPTURE_KEY = '__eposePrintCapture';

export async function installAnalysisReportPrintIntercept(page: Page): Promise<void> {
    await page.evaluate(
        ({ interceptFlag, originalKey, descriptorKey, captureKey }) => {
            const win = window as unknown as Record<string, unknown>;
            if (win[interceptFlag]) {
                return;
            }
            win[interceptFlag] = true;
            const ownDescriptor = Object.getOwnPropertyDescriptor(window, 'print');
            const protoDescriptor = Object.getOwnPropertyDescriptor(
                Window.prototype,
                'print'
            );
            win[descriptorKey] = ownDescriptor ?? protoDescriptor ?? null;
            win[originalKey] = window.print;
            win[captureKey] = { invocationCount: 0, titleAtInvocation: null as string | null };
            window.print = function eposeInterceptedPrint() {
                const capture = win[captureKey] as {
                    invocationCount: number;
                    titleAtInvocation: string | null;
                };
                capture.invocationCount += 1;
                capture.titleAtInvocation = document.title;
            };
        },
        {
            interceptFlag: INTERCEPT_FLAG,
            originalKey: ORIGINAL_PRINT_KEY,
            descriptorKey: DESCRIPTOR_KEY,
            captureKey: CAPTURE_KEY,
        }
    );
}

export async function readAnalysisReportPrintIntercept(
    page: Page
): Promise<PrintInterceptSnapshot> {
    return page.evaluate((captureKey) => {
        const capture = (window as unknown as Record<string, unknown>)[captureKey] as
            | { invocationCount: number; titleAtInvocation: string | null }
            | undefined;
        return {
            invocationCount: capture?.invocationCount ?? 0,
            titleAtInvocation: capture?.titleAtInvocation ?? null,
        };
    }, CAPTURE_KEY);
}

export async function restoreAnalysisReportPrintIntercept(page: Page): Promise<PrintInterceptCleanupResult> {
    try {
        await page.evaluate(
            ({ interceptFlag, originalKey, descriptorKey, captureKey }) => {
                const win = window as unknown as Record<string, unknown>;
                const descriptor = win[descriptorKey] as PropertyDescriptor | null | undefined;
                if (descriptor) {
                    Object.defineProperty(window, 'print', descriptor);
                } else {
                    const original = win[originalKey];
                    if (typeof original === 'function') {
                        (window as Window & { print: () => void }).print = original as () => void;
                    }
                }
                delete win[originalKey];
                delete win[descriptorKey];
                delete win[captureKey];
                delete win[interceptFlag];
            },
            {
                interceptFlag: INTERCEPT_FLAG,
                originalKey: ORIGINAL_PRINT_KEY,
                descriptorKey: DESCRIPTOR_KEY,
                captureKey: CAPTURE_KEY,
            }
        );
        return { error: null };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
