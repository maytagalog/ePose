import { test, expect } from '@playwright/test';
import {
    ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT_LABEL,
    normalizeShareEmailRecipientBlockText,
    parseRecipientEmailFromLabelBlock,
} from './analysisReportShareEmailModal';

const FIXTURE_RECIPIENT = 'fixture-recipient@example.com';
const STAGING_RECIPIENT = 'aardvarkomonstrosesquip1230000@gmail.com';

test('parseRecipientEmailFromLabelBlock accepts staging-like multiline block', () => {
    const raw = `${ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT_LABEL}\n\n${STAGING_RECIPIENT}`;
    const normalized = normalizeShareEmailRecipientBlockText(raw);
    expect(parseRecipientEmailFromLabelBlock(normalized)).toBe(STAGING_RECIPIENT);
});

test('parseRecipientEmailFromLabelBlock rejects substring-only remainder', () => {
    const normalized = normalizeShareEmailRecipientBlockText(
        `${ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT_LABEL}\n\nprefix-${STAGING_RECIPIENT}`
    );
    expect(parseRecipientEmailFromLabelBlock(normalized)).toBe(`prefix-${STAGING_RECIPIENT}`);
    expect(parseRecipientEmailFromLabelBlock(normalized)).not.toBe(STAGING_RECIPIENT);
});

test('parseRecipientEmailFromLabelBlock rejects extra tokens after address', () => {
    const normalized = normalizeShareEmailRecipientBlockText(
        `${ANALYSIS_REPORT_SHARE_EMAIL_RECIPIENT_LABEL}\n\n${FIXTURE_RECIPIENT} extra`
    );
    expect(parseRecipientEmailFromLabelBlock(normalized)).toBeNull();
});
