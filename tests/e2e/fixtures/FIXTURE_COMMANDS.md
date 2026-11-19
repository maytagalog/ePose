# Local fixture regressions (CIRS + Analysis Report)

Fixture HTML, helpers, and `*.fixture.spec.ts` files live under `tests/e2e/fixtures/`.
Live flows and standalone staging specs stay under `tests/CIRS/` and `tests/analysisReport/`.

## Analysis Report

```bash
npx playwright test tests/e2e/fixtures/analysisReport/reportView/analysisReportView.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/analysisReport/displaySettings/analysisReportDisplayItemSettings.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/analysisReport/sharing/qrCode/analysisReportShareQr.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/analysisReport/sharing/email/analysisReportShareEmail.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/analysisReport/reportPDF/analysisReportPdf.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/analysisReport/reportHistory/analysisReportHistory.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/analysisReport/reportDeletion/analysisReportDeletion.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/analysisReport/reportHistory/analysisReportHistoryReporting.spec.ts tests/analysisReport/reportHistory/analysisReportHistoryOrchestration.spec.ts --project=chromium --workers=1
npx playwright test tests/analysisReport/reportDeletion/analysisReportDeletionConfig.spec.ts --project=chromium --workers=1
npx playwright test tests/analysisReport/reportPDF/analysisReportPdfReporting.spec.ts tests/analysisReport/reportPDF/analysisReportPdfOrchestration.spec.ts --project=chromium --workers=1
```

## CIRS

```bash
npx playwright test tests/e2e/fixtures/CIRS/cirsRecord/cirsRecordFlow.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/CIRS/responseDetails/responseDetailsFlow.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/CIRS/handwrittenNotes --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/CIRS/takeover/takeoverCrud.fixture.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/fixtures/CIRS/postureAnalysis --project=chromium --workers=1
```

Smoke runners: `npm run pw:part1` / `npm run pw:part2` (see `configs/playwright/README.md`). Part 2 includes CIRS → Analysis Report same-page handoff (deletion default off).

```bash
npx playwright test tests/e2e/fixtures/e2e/part2AnalysisReportHandoff.fixture.spec.ts tests/e2e/fixtures/e2e/part2AnalysisReportReporting.fixture.spec.ts tests/e2e/fixtures/e2e/part2CirsHandoffCatalogCapture.fixture.spec.ts --project=chromium --workers=1
```
