import type { ComparisonReportViewFlowEvidencePartial } from './comparisonReportViewReporting';

export class ComparisonReportViewFlowError extends Error {
    partialEvidence?: ComparisonReportViewFlowEvidencePartial;

    constructor(message: string, partialEvidence?: ComparisonReportViewFlowEvidencePartial) {
        super(message);
        this.name = 'ComparisonReportViewFlowError';
        this.partialEvidence = partialEvidence;
    }
}

export function attachComparisonFlowErrorEvidence(
    error: unknown,
    partialEvidence: ComparisonReportViewFlowEvidencePartial
): unknown {
    if (error instanceof ComparisonReportViewFlowError) {
        error.partialEvidence = { ...partialEvidence, ...error.partialEvidence };
        return error;
    }
    const wrapped = new ComparisonReportViewFlowError(
        error instanceof Error ? error.message : String(error),
        partialEvidence
    );
    if (error instanceof Error && error.stack) {
        wrapped.stack = error.stack;
    }
    return wrapped;
}