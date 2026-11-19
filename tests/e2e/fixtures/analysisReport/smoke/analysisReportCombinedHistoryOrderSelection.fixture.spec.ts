import { test, expect } from '@playwright/test';
import {
    assertCustomerHistoryNewestFirstContract,
    assertExplicitSourceMatchesHistoryOrderPin,
    historyOrderPinToDeletionSelection,
    selectHistoryOrderNewestFirstPin,
} from '../../../../analysisReport/smoke/analysisReportCombinedHistoryOrderSelection';
import type { CustomerHistoryCatalogResult } from '../../../../analysisReport/reportDeletion/analysisReportCustomerHistoryApiCatalog';
import { ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID } from '../../../../analysisReport/sharing/email/analysisReportShareEmailSmokeConfig';

const customerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function catalog(rows: Array<{ analysisId: string; createdAt: string }>): CustomerHistoryCatalogResult & {
    accountId: string;
} {
    return {
        rows: rows.map((row, rowIndex) => ({
            customerId,
            analysisId: row.analysisId,
            chronologyIso: row.createdAt,
            chronologySource: 'api.createdAt' as const,
            rowIndex,
        })),
        catalogComplete: true,
        pagesFetched: 1,
        firstPageSortType: 'DESC',
        historyOrderVerified: false,
        accountId: 'acct-1',
    };
}

test('selects first row in verified newest-first API order', () => {
    const pin = selectHistoryOrderNewestFirstPin(
        catalog([
            { analysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: '2026-03-01T00:00:00.000Z' },
            { analysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', createdAt: '2025-01-01T00:00:00.000Z' },
        ])
    );
    expect(pin.analysisId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(pin.chronologyBasis).toBe('history-order-newest-first');
    expect(pin.selectionIndex).toBe(0);
    const selection = historyOrderPinToDeletionSelection(pin);
    expect(selection.analysisId).toBe(pin.analysisId);
    expect(selection.customerId).toBe(pin.customerId);
});

test('rejects ascending createdAt catalog', () => {
    expect(() =>
        assertCustomerHistoryNewestFirstContract(
            catalog([
                { analysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: '2024-01-01T00:00:00.000Z' },
                { analysisId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', createdAt: '2026-01-01T00:00:00.000Z' },
            ])
        )
    ).toThrow(/non-increasing/);
});

test('rejects missing captured sortType', () => {
    const broken = catalog([{ analysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: '2026-01-01T00:00:00.000Z' }]);
    broken.firstPageSortType = null;
    expect(() => assertCustomerHistoryNewestFirstContract(broken)).toThrow(/sortType/);
});

test('explicit analysis id must match history-order pin', () => {
    const pin = selectHistoryOrderNewestFirstPin(
        catalog([{ analysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: '2026-01-01T00:00:00.000Z' }])
    );
    expect(() => assertExplicitSourceMatchesHistoryOrderPin('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', pin)).toThrow(
        /history-order/
    );
});

test('protected standalone smoke analysis ids still block combined pin selection', () => {
    expect(() =>
        selectHistoryOrderNewestFirstPin(
            catalog([
                {
                    analysisId: ANALYSIS_REPORT_SHARE_EMAIL_SMOKE_ANALYSIS_ID,
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            ])
        )
    ).toThrow(/protected/);
});

test('source and deletion target share one history-order pin', () => {
    const pin = selectHistoryOrderNewestFirstPin(
        catalog([{ analysisId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: '2026-01-01T00:00:00.000Z' }])
    );
    const deletion = historyOrderPinToDeletionSelection(pin);
    expect(deletion.analysisId).toBe(pin.analysisId);
});
