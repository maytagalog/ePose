# Playwright configs

Repository root keeps only `playwright.config.ts` (default/local suite). Specialized runners live here; each resolves `testDir` and JUnit paths from the **repository root** (`configs/playwright/paths.ts`).

## Part 1 / Part 2 smoke

| npm script | Config |
|------------|--------|
| `npm run pw:part1` | `configs/playwright/smoke/part1.config.ts` |
| `npm run pw:part2` | `configs/playwright/smoke/part2.config.ts` (CIRS + Analysis Report combined; deletion default **off**) |

**Part 2 headed staging (deletion off):** set credentials and share-email recipient, then:

```bash
ANALYSIS_REPORT_DELETION_MODE=off npm run pw:part2
```

(Part 2 defaults to headed/slowMo; set `PART2_HEADLESS=1` for headless.)

**Staging smoke browser context:** Part 1 / Part 2 / combined configs use `configs/playwright/smoke/stagingSmokeBrowser.mjs` — viewport **1404×856** CSS px, **deviceScaleFactor 2** (same as Part 2 and Analysis Report smokes). Fresh contexts in withdrawal, change-password, share-email, and registration-resume flows inherit these options.

**Registration layout probe** (本登録 confirmation only; no 送信, no alias):

```bash
node scripts/registrationLayoutProbe.mjs
```

Artifacts: `test-output/registration-layout-probe/registration-confirmation-staging-1404-dpr2.{png,json}` (and a legacy 1280 baseline for comparison).

**Part 2 headed layout probe** (read-only login → `/customers` → first customer detail; no smoke, no mutations):

```bash
EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' node scripts/part2CustomersLayoutProbe.mjs
```

Artifacts: `test-output/part2-headed-layout-probe/customers-list-part2-1404-dpr2.{png,json}` and `customer-detail-part2-1404-dpr2.{png,json}`.

**Customers viewport probe** (list only, 1404×856 DPR 2, headed; browser stays open until Enter):

```bash
EPOSE_SMOKE_PART2_EMAIL='…' EPOSE_SMOKE_PART2_PASSWORD='…' node scripts/part2CustomersLayoutProbe.mjs --viewport-probe
```

Artifacts: `test-output/viewport-probe/customers/customers-list-viewport-probe-1404-dpr2.{png,json}` plus `customers-viewport-probe-summary.json`.

## Analysis Report staging smokes

| npm script | Config |
|------------|--------|
| `npm run pw:ar:full` | `configs/playwright/analysisReport/fullSmoke.config.ts` |
| `npm run pw:ar:history` | `configs/playwright/analysisReport/historySmoke.config.ts` |
| `npm run pw:ar:pdf` | `configs/playwright/analysisReport/pdfSmoke.config.ts` |
| `npm run pw:ar:share-email` | `configs/playwright/analysisReport/shareEmailSmoke.config.ts` |
| `npm run pw:ar:deletion-cancel` | `configs/playwright/analysisReport/deletionCancelSmoke.config.ts` |
| `npm run pw:ar:deletion-once` | `configs/playwright/analysisReport/deletionDeleteOnceSmoke.config.ts` |
| `npm run pw:ar:deletion-resume-once` | `configs/playwright/analysisReport/deletionResumeDeleteOnce.config.ts` |

## Maintenance (ledger / reconcile, read-only staging)

| npm script | Config |
|------------|--------|
| `npm run pw:maint:pre-submit-recovery` | `configs/playwright/maintenance/preSubmitSamePlanRecovery.config.ts` |
| `npm run pw:maint:reserved-recovery` | `configs/playwright/maintenance/reservedPlanRecovery.config.ts` |
| `npm run pw:maint:legacy-finalize` | `configs/playwright/maintenance/legacyPlanFinalize.config.ts` |

## Reporting validation (local JUnit shape only)

| npm script | Config |
|------------|--------|
| `npm run pw:report:part2` | `configs/playwright/reporting/part2ReportingCheck.config.ts` |
| `npm run test:part2-reporting` | Same config + `scripts/part2TestmoReporting.test.mjs` |
| `npm run pw:report:share-email` | `configs/playwright/reporting/shareEmailReportingCheck.config.ts` |

After `npm run pw:part2`, generate `results-part2-testmo.json` with `node scripts/part2TestmoReporting.mjs [path/to/results-part2.xml]` (auto-run during `node scripts/combineSmokeResults.mjs`).

`submit:smoke` validates `results.xml` (2 aggregate testcases), then writes `results-testmo-submit.xml` with Part 2 feature testcases (`classname` `e2e/part2SmokeTestmoFeature.spec.ts`, `name` = `part2-smoke-*` automation keys). When `results.xml` Part 2 is stale vs `SMOKE_PART2_JUNIT_SOURCE`, the builder replaces the entire Part 2 suite from that source (aggregate + features share one provenance). Preview: `SMOKE_PART2_JUNIT_SOURCE=results-part2-derived.xml npm run preview:testmo-submit`. Mock submit: `SMOKE_SUBMIT_MOCK=1 SMOKE_PART2_JUNIT_SOURCE=… npm run submit:smoke`.

For pre-`PART2_TESTMO_COVERAGE` runs, reconstruct `results-part2-derived.xml` with `node scripts/reconstructPart2DerivedReporting.mjs <console-log.txt> [more-same-run-logs...]` (does not alter original JUnit). Multiple logs are unioned only when `accountEmail`, `runOutputRoot`, and `PART2_RUN_COMPLETED` outcomes match; conflicting `PART2_*` lines are rejected (no “later file wins”).

## Common flags

```bash
# Headed Analysis Report full smoke
ANALYSIS_REPORT_FULL_HEADED=1 npm run pw:ar:full -- --headed

# Headed legacy reconciled-absent finalization
ANALYSIS_REPORT_LEGACY_FINALIZE_HEADED=1 npm run pw:maint:legacy-finalize -- --headed
```

Fixture-only regressions (no specialized config): see `tests/e2e/fixtures/FIXTURE_COMMANDS.md`.
