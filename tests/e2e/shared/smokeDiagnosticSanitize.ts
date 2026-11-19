import { redactSharedReportUrlForDiagnostics } from '../../../utils/gmail';

const REDACTED = '[redacted]';
const SENSITIVE_JSON_KEY =
    /^(password|passwd|authorization|cookie|set-cookie|token|accessToken|refreshToken|secret|apiKey)$/i;

export function redactUrlQueryToken(url: string): string {
    const redacted = redactSharedReportUrlForDiagnostics(url);
    return redacted ?? REDACTED;
}

export function sanitizeApiResponseBody(raw: string, maxLen = 2000): string {
    const trimmed = raw.trim().slice(0, maxLen);
    if (!trimmed) {
        return '';
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return JSON.stringify(sanitizeJsonValue(parsed));
    } catch {
        return trimmed.replace(/token=[^&\s]+/gi, 'token=[redacted]');
    }
}

function sanitizeJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sanitizeJsonValue);
    }
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (SENSITIVE_JSON_KEY.test(key)) {
                out[key] = REDACTED;
            } else {
                out[key] = sanitizeJsonValue(child);
            }
        }
        return out;
    }
    if (typeof value === 'string' && value.length > 500) {
        return `${value.slice(0, 500)}…`;
    }
    return value;
}

export function pickResponseCorrelationHeaders(headers: Record<string, string>): Record<string, string> {
    const picked: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        const lower = key.toLowerCase();
        if (
            lower === 'x-request-id' ||
            lower === 'x-correlation-id' ||
            lower === 'traceparent' ||
            lower === 'x-amzn-trace-id'
        ) {
            picked[key] = value;
        }
    }
    return picked;
}