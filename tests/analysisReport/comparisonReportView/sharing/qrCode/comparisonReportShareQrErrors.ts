import type { ComparisonReportShareQrFlowEvidencePartial } from './comparisonReportShareQrReporting';

export class ComparisonReportShareQrFlowError extends Error {
    partialEvidence?: ComparisonReportShareQrFlowEvidencePartial;

    constructor(message: string, partialEvidence?: ComparisonReportShareQrFlowEvidencePartial) {
        super(message);
        this.name = 'ComparisonReportShareQrFlowError';
        this.partialEvidence = partialEvidence;
    }
}

export function attachComparisonShareQrFlowErrorEvidence(
    error: unknown,
    partialEvidence: ComparisonReportShareQrFlowEvidencePartial
): unknown {
    if (error instanceof ComparisonReportShareQrFlowError) {
        error.partialEvidence = { ...partialEvidence, ...error.partialEvidence };
        return error;
    }
    const wrapped = new ComparisonReportShareQrFlowError(
        error instanceof Error ? error.message : String(error),
        partialEvidence
    );
    if (error instanceof Error && error.stack) {
        wrapped.stack = error.stack;
    }
    return wrapped;
}