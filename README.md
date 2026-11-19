# ePose automation

## Staging smoke → TestMo workflow

Root JUnit artifacts (`results.xml`, `results-part1.xml`, `results-part2.xml`) are published automatically after diagnostic smoke runs. Preview and submit default to **`results.xml`** and block when the aggregate is stale until you recombine.

### 1. Parallel Part 1 + Part 2

```bash
npm run test:smoke -- --project=chromium --workers=2 --retries=0 --repeat-each=1 --headed
```

When Playwright finishes (pass or fail, as long as JUnit exists), the runner:

- Keeps the original JUnit and evidence under `test-output/smoke-combined/<runId>/`
- Writes repo-root `results.xml`, `results-part1.xml`, and `results-part2.xml` (lossless part extraction)
- Records aligned provenance in `results-publication-provenance.json` and `results-backups/results-root-state.json`

Playwright’s exit code is unchanged (a failed smoke still exits non-zero even if publication succeeds).

### 2. Rerun a failed part only

```bash
npm run test:smoke:part1   # updates results-part1.xml only
npm run test:smoke:part2   # updates results-part2.xml only
```

The other part file and prior run-directory artifacts are preserved. The aggregate is marked **stale** (`recombinationRequired`) until you combine.

```bash
npm run combine:smoke
# or: node scripts/combineSmokeResults.mjs
```

Combine prints source run timestamps/statuses, backs up the previous `results.xml`, and refreshes `results-combined-provenance.json`. Re-running combine with the same inputs reports **already up to date**.

Optional third suite (share email):

```bash
npm run combine:smoke -- --with-share-email
```

Skip auto-publish: `EPOSE_SMOKE_PUBLISH=0` or `EPOSE_SMOKE_MIRROR_JUNIT=0`.

### 3. Preview and submit (no auto-submit after smoke)

```bash
npm run preview:testmo-submit
npm run submit:smoke -- --mock-submit   # dry run without TestMo upload
npm run submit:smoke                    # live upload when ready
```

- Defaults to repo-root `results.xml` (aggregate only; feature payload is built internally: 20 + 21 = 41 cases).
- Resolves Part 2 evidence from aligned root parts; `SMOKE_PART2_JUNIT_SOURCE` is only needed for explicit overrides.
- **Blocks** preview/submit while `results-root-state.json` has `recombinationRequired` or a SHA mismatch until combine/publication succeeds.
- Parallel single-run timing uses the max part duration; recombined results use **sequential** timing (not concurrent).

### Helper tests

```bash
npm run test:submit-smoke-helper
```

Covers publication, combine idempotency, stale-guard behavior, and TestMo submit helpers (no staging smoke, no live TestMo upload in tests).