import { test, expect } from '@playwright/test';
import {
    AnalysisReportSharedReportVerificationError,
    assertSharedReportGuestViewVisible,
    parseFetchSharedReportIdentity,
    type FetchSharedReportIdentity,
} from './analysisReportSharedReportVerification';

const TRACE_BODY = {
    report: {
        customerId: 'cust-1',
        analysisId: 'analysis-1',
        customer: {
            id: 'cust-1',
            fullName: 'Nikolas Samuel',
        },
    },
    userPreferences: {
        showExercisesAndStretches: true,
    },
};

test('parseFetchSharedReportIdentity reads trace 20261109-092223 report.customer shape', () => {
    const identity = parseFetchSharedReportIdentity(TRACE_BODY);
    expect(identity.customerId).toBe('cust-1');
    expect(identity.customerRecordId).toBe('cust-1');
    expect(identity.analysisId).toBe('analysis-1');
    expect(identity.customerDisplayName).toBe('Nikolas Samuel');
});

test('parseFetchSharedReportIdentity accepts report nested under data', () => {
    const identity = parseFetchSharedReportIdentity({ data: TRACE_BODY });
    expect(identity.customerRecordId).toBe('cust-1');
    expect(identity.customerDisplayName).toBe('Nikolas Samuel');
});

test('parseFetchSharedReportIdentity rejects missing ids', () => {
    expect(() => parseFetchSharedReportIdentity({ report: { customerId: 'only-cust' } })).toThrow(
        AnalysisReportSharedReportVerificationError
    );
});

test('parseFetchSharedReportIdentity rejects mismatched report.customer.id', () => {
    expect(() =>
        parseFetchSharedReportIdentity({
            report: {
                customerId: 'cust-1',
                analysisId: 'analysis-1',
                customer: { id: 'other-cust', fullName: 'Someone' },
            },
        })
    ).toThrow(/report\.customer\.id does not match report\.customerId/);
});

test('parseFetchSharedReportIdentity returns null display name when customer.fullName blank', () => {
    const identity = parseFetchSharedReportIdentity({
        report: {
            customerId: 'cust-1',
            analysisId: 'analysis-1',
            customer: { id: 'cust-1', fullName: '   ' },
        },
    });
    expect(identity.customerDisplayName).toBeNull();
});

test('parseFetchSharedReportIdentity rejects missing report.customer.id', () => {
    expect(() =>
        parseFetchSharedReportIdentity({
            report: {
                customerId: 'cust-1',
                analysisId: 'analysis-1',
                customer: { fullName: 'Nikolas Samuel' },
            },
        })
    ).toThrow(/missing report\.customer\.id/);
});

test('assertSharedReportGuestViewVisible rejects missing customer display name', async ({ page }) => {
    const identity: FetchSharedReportIdentity = {
        customerId: 'cust-1',
        analysisId: 'analysis-1',
        customerRecordId: 'cust-1',
        customerDisplayName: null,
    };
    await expect(assertSharedReportGuestViewVisible(page, identity)).rejects.toThrow(
        AnalysisReportSharedReportVerificationError
    );
});
