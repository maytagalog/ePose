export type AnalysisReportShareQrRunEvidence = {
    customerId: string;
    analysisId: string;
    qrDialogOpened: boolean;
    qrDialogClosed: boolean;
    reportStillReady: boolean;
    failureStep: string | null;
};

export function analysisReportShareQrEvidenceAttachmentBody(
    payload: AnalysisReportShareQrRunEvidence
): string {
    return JSON.stringify(payload, null, 2);
}
