import { PDFDocument, StandardFonts } from 'pdf-lib';
import { A4_HEIGHT_PT, A4_WIDTH_PT } from '../../../../analysisReport/reportPDF/analysisReportPdfValidation';

/** Centralized fixture PDF bytes: page 1 A4, page 2 non-A4 (500×700 pt). */
export async function buildMixedPageSizePdfBytes(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const a4 = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    a4.drawText('Fixture Customer page1 A4 2026/01/15 score-77', {
        x: 50,
        y: A4_HEIGHT_PT - 80,
        size: 12,
        font,
    });

    const small = doc.addPage([500, 700]);
    small.drawText('page2 letter-ish', { x: 40, y: 640, size: 12, font });

    return doc.save();
}
