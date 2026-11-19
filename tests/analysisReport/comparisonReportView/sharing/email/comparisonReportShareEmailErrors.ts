import type { ComparisonReportShareEmailFlowEvidencePartial } from './comparisonReportShareEmailEvidenceTypes';

export class ComparisonReportShareEmailFlowError extends Error {
    partialEvidence?: ComparisonReportShareEmailFlowEvidencePartial;

    constructor(message: string, partialEvidence?: ComparisonReportShareEmailFlowEvidencePartial) {
        super(message);
        this.name = 'ComparisonReportShareEmailFlowError';
        this.partialEvidence = partialEvidence;
    }
}

export function attachComparisonShareEmailFlowErrorEvidence(
    error: unknown,
    partialEvidence: ComparisonReportShareEmailFlowEvidencePartial
): unknown {
    if (error instanceof ComparisonReportShareEmailFlowError) {
        error.partialEvidence = { ...partialEvidence, ...error.partialEvidence };
        return error;
    }
    const wrapped = new ComparisonReportShareEmailFlowError(
        error instanceof Error ? error.message : String(error),
        partialEvidence
    );
    if (error instanceof Error && error.stack) {
        wrapped.stack = error.stack;
    }
    return wrapped;
}