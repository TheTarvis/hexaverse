# keep-console-tab-content-mounted — suite-integrity record (SDET, post-build)

Verdict: **CLEAN**. Tier 1 only; no Playwright, tier 3 or 4, no stack.

## Manifest

`bash harness/openspec-red-manifest.sh verify keep-console-tab-content-mounted`:
`all 4 test file(s) unchanged since handoff`.

## Run (tier 1, the red suite's own files)

`cd frontend && npx vitest run <the four files>`: `Test Files 4 passed (4)`, `Tests 67 passed (67)`.

| File | Tests |
| --- | --- |
| `SystemSpaceView.console-log-mounted.test.tsx` (L) | 23 |
| `SystemSpaceView.console-dock-escape.test.tsx` (E) | 19 |
| `SystemSpaceView.sighting-log-mount-ordering.test.tsx` (M) | 3 |
| `SystemSpaceView.console-dock.test.tsx` (D) | 22 |

Matches the red gate's 67 (31 red, 36 green); now 67 green. A grep for `.skip`, `.only`, `.todo`, `xit`, `xdescribe`, `fit(` over the four files found nothing.

## Diff scope

`git diff -- frontend/components frontend/hooks frontend/lib` touches production files `ConsoleDock.tsx` and `SystemSpaceView.tsx` only (both named by contract 2.1). The test files in the working-tree diff (D, M) are the SDET's red-phase edits, hash-verified unchanged; L and E are untracked, also verified. No developer-authored test edit. Nothing in `hooks/` or `lib/`; no `SightingLog.tsx`, `use-sightings.ts` or `query-client.ts` edit. Production hunks match tasks 4.1 (latch `logLatched`, `interiorAtRest`, mount-on-show expression deleted), 4.2 (`rereadPilesAfterSettle` used as `onSettled` and at the early-settle exit) and 4.3 (`window` bubble-phase listener while expanded, `defaultPrevented` and `repeat` guards, through `handleCollapse`).

## Already-green accounting (argued from the diff and the red-phase scratch proof; no production edit made)

- 1.2, 1.3-control, highlight rows: the highlight rides view state (`highlightedGhostId`), untouched by the diff. Non-vacuity precondition (highlighted before collapse) is in the test. Goes red if the latch/hide dropped it.
- 1.4 (unreachable while collapsed): now observing real content. The built log is present and hidden via the shell's `hidden` attribute (ConsoleDock untouched on that), so the role queries and Tab walk see a mounted-but-hidden log; the Tab-walk precondition (Console control visited) and the red-phase guard reasoning hold. A hide by `visibility`/`opacity` would fail it.
- 1.6, 1.9, 1.8 row 4: controls. Diff does not share a retry between card and log, and `resync` does not invalidate the pile (`rereadPilesAfterSettle` is wired only to `onSettled` and the early-settle exit). Their non-vacuity preconditions (card present then gone; request count rose on Refresh; poll called the interior `refetch`) are in the tests.
- 1.14 rows 1a, 1b, 2, 3: observe the latch through `interiorAtRest`; 1b (no interior held, nothing in flight) is green because the latch opens on `!isLoading && !isFetching`, and would go red for a latch on `data != null || isError`.
- 2.3, 2.4 rows 2-4, 2.6: 2.3 guards a second collapse path (the diff adds none: the listener calls `handleCollapse`); 2.4 non-expanded rows have non-default selection preconditions and the listener does not touch selection; 2.6 cannot fail at tier 1 by design, journey leg `press-on-dock-not-a-pick`.
- D live scenarios and M first half: unchanged behaviour carried.
- Scratch-proof history: the red-phase worktree proof (4.3+4.1: 2 failed 1.10/1.11; +4.2: 81 passed) is now confirmed by the real build (all 67 green).

No mutation run was needed beyond that; no worktree created.

## The four migrations (test files outside the manifest; none run)

| Task | File | Edit |
| --- | --- | --- |
| 3.3 | `frontend/e2e/tests/scan-lane-transit-fizzle.spec.ts` | `:293-310`: comment rewritten (log reads at view open, possibly pre-settle); after the log is visible, `waitForResponse` for the unfiltered `/v1/sightings` (no `systemId`) armed at `:305`, Refresh button (`Refresh sighting log`) clicked, awaited at `:310`, then `toHaveCount(0)` |
| 3.4 | `frontend/e2e/tests/scan-journey.spec.ts` | `:119-132` comment rewritten (log mounted, hidden, read since view open; row listed only because settle re-read ran; closure of the drift); `:164` "log unmounted" became "log hidden". Assertions untouched; the optional no-request assertion was not added |
| 3.5 | `frontend/e2e/tests/vitals-strip-journey.spec.ts` | header note at `:66-70` (written without a `*/` sequence, which broke the comment once and was fixed) |
| 3.6 | `frontend/e2e/tests/console-dock-journey.spec.ts` | header note at `:39-45` |

Checks: `npx tsc --noEmit` 0 errors; eslint on the four specs clean.

## tasks.md

3.3-3.6 ticked. `grep -c '^- \[x\]'` = 30, `grep -c '^- \[ \]'` = 10 (3.x/4.x/1.x/2.x done; 5.1-5.10 open).
