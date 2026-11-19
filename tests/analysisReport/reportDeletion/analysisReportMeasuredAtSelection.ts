import type { MeasuredHistoryRow } from './analysisReportDeletionMeasuredAtCatalog';
import { AnalysisReportDeletionFlowError } from './analysisReportDeletionErrors';

export type MeasuredAtReportSelection = {
    customerId: string;
    analysisId: string;
    measuredAtIso: string;
    measuredAtDisplay: string;
    listCreatedAtIso: string;
    accountId: string;
    deleteRequestId: string;
    rowCount: number;
    tiedAnalysisIds: string[];
    catalogComplete: boolean;
    chronologyBasis: 'measuredAt' | 'history-order-newest-first';
};

export function assertMeasuredHistoryRowsValid(
    rows: MeasuredHistoryRow[],
    catalogComplete: boolean
): void {
    if (!catalogComplete) {
        throw new AnalysisReportDeletionFlowError(
            'Measured-at selection blocked: customer history catalog completeness not established.'
        );
    }
    if (rows.length === 0) {
        throw new AnalysisReportDeletionFlowError('Cannot select a report from an empty measured history.');
    }
    for (const row of rows) {
        const parsed = Date.parse(row.measuredAtIso);
        if (!row.measuredAtIso.trim() || Number.isNaN(parsed)) {
            throw new AnalysisReportDeletionFlowError(
                `Invalid measuredAt for analysisId ${row.analysisId}: "${row.measuredAtIso}".`
            );
        }
    }
}

function selectAtMeasuredExtreme(
    rows: MeasuredHistoryRow[],
    accountId: string,
    extreme: 'earliest' | 'latest',
    tieBreakAnalysisId: string | null,
    catalogComplete: boolean
): MeasuredAtReportSelection {
    assertMeasuredHistoryRowsValid(rows, catalogComplete);
    const times = rows.map((row) => Date.parse(row.measuredAtIso));
    const targetTime = extreme === 'earliest' ? Math.min(...times) : Math.max(...times);
    const tied = rows.filter((row) => Date.parse(row.measuredAtIso) === targetTime);
    const tiedAnalysisIds = tied.map((row) => row.analysisId).sort();
    let chosen: MeasuredHistoryRow;
    if (tied.length === 1) {
        chosen = tied[0]!;
    } else if (tieBreakAnalysisId) {
        const match = tied.find((row) => row.analysisId === tieBreakAnalysisId);
        if (!match) {
            const label = extreme === 'earliest' ? 'earliest' : 'latest';
            throw new AnalysisReportDeletionFlowError(
                `Tie-break analysisId ${tieBreakAnalysisId} is not among tied ${label} measured reports: ${tiedAnalysisIds.join(', ')}.`
            );
        }
        chosen = match;
    } else {
        const label = extreme === 'earliest' ? 'earliest' : 'latest';
        throw new AnalysisReportDeletionFlowError(
            `${label} measuredAt is tied across ${tied.length} reports; set a tie-break ANALYSIS_REPORT_*_TIE_BREAK_ANALYSIS_ID. ` +
                `Candidates: ${tiedAnalysisIds.join(', ')}.`
        );
    }
    return {
        customerId: chosen.customerId,
        analysisId: chosen.analysisId,
        measuredAtIso: chosen.measuredAtIso,
        measuredAtDisplay: chosen.measuredAtDisplay,
        listCreatedAtIso: chosen.listCreatedAtIso,
        accountId,
        deleteRequestId: chosen.analysisId,
        rowCount: rows.length,
        tiedAnalysisIds,
        catalogComplete,
        chronologyBasis: 'measuredAt',
    };
}

export function selectLatestFromMeasuredRows(
    rows: MeasuredHistoryRow[],
    accountId: string,
    tieBreakAnalysisId: string | null,
    catalogComplete: boolean
): MeasuredAtReportSelection {
    return selectAtMeasuredExtreme(rows, accountId, 'latest', tieBreakAnalysisId, catalogComplete);
}

export function selectEarliestFromMeasuredRows(
    rows: MeasuredHistoryRow[],
    accountId: string,
    tieBreakAnalysisId: string | null,
    catalogComplete: boolean
): MeasuredAtReportSelection {
    return selectAtMeasuredExtreme(rows, accountId, 'earliest', tieBreakAnalysisId, catalogComplete);
}
