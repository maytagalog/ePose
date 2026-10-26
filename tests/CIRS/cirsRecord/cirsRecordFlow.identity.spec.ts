import { test, expect } from '@playwright/test';
import {
    CirsRecordFlowError,
    parseCreateRecordResponseBodyText,
} from './cirsRecordFlow';

const RECORD_ID = 'f11b84fe-d4aa-4bc3-8cfa-90a566c158cb';

test.describe('parseCreateRecordResponseBodyText', () => {
    test('accepts trimmed raw UUID body (staging contract)', () => {
        const parsed = parseCreateRecordResponseBodyText(`  ${RECORD_ID}\n`);
        expect(parsed.recordId).toBe(RECORD_ID);
        expect(parsed.customerId).toBeNull();
        expect(parsed.notes).toContain('customerId_not_in_response');
    });

    test('rejects JSON wrapper with nested id', () => {
        expect(() =>
            parseCreateRecordResponseBodyText(JSON.stringify({ data: { id: RECORD_ID } }))
        ).toThrow(CirsRecordFlowError);
    });

    test('rejects arbitrary text', () => {
        expect(() => parseCreateRecordResponseBodyText('not-a-uuid')).toThrow(CirsRecordFlowError);
        expect(() => parseCreateRecordResponseBodyText(`${RECORD_ID}-extra`)).toThrow(
            CirsRecordFlowError
        );
    });

    test('empty body is explicit, not an error', () => {
        const parsed = parseCreateRecordResponseBodyText('   ');
        expect(parsed.recordId).toBeNull();
        expect(parsed.notes).toContain('empty_response_body');
    });
});
