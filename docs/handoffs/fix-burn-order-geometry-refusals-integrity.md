# fix-burn-order-geometry-refusals — integrity check (SDET)

Outcome: CLEAN on the suite; one tier-0 convention gap closed by a post-handoff test addition; two tier-0 determinism checks cannot be read in this sandbox (see below). Tiers 0-1 only. No emulator was listening (port 20242 down), so tier 2 was not run: the 89 emulator-backed tests skip under `-short`, as before. Tiers 3 and 4 not run.

## Results
- Manifest: `all 20 test file(s) unchanged since handoff` (before and after my one addition).
- `go vet ./...` clean. `go test -short -count=1 ./...`: every package ok. `system`, `corporations`, `fleet`: 576 pass, 0 fail, 89 skip (all skips are pre-existing emulator tests; none of this change's tests skip), zero "arrangement no longer holds".
- Frontend: vitest 128 files, 1843 tests pass; `tsc --noEmit` clean.
- No `t.Skip` or `.only` in the new files; no test file was edited by developers.
- Production wiring: `StationShellClearsStar` is called by the real `qualify` (`siteselection.go:211`). `space.SolveBurn` remains called only in `solve_refusal.go:76` (the helper) and `fuel.go:153` (`reachableAtFloor`, deliberately untouched, RULING 8). `solveOrder` (service.go:720) and `Stop` (service.go:1348) both go through `solveBurnClassified`.
- Boundary: production diff is exactly the contract's list (system/station_continuous.go, corporations/{siteselection,params}.go, fleet/{solve_refusal,service,handler}.go, fixtures/system/mirror-map.json, the three frontend files). `git diff` is empty for `backend/space`, every `fixtures/**/cases.json` and `fixtures/space/turn-table.json`. The mirror-map edit adds only the contract's coverage and inventory entries; the file parses.

## Findings
1. Tier 0 `Backend Test Coverage` failed for the new `backend/fleet/solve_refusal.go`: the convention wants `solve_refusal_test.go`, and the red suite had only `solve_refusal_*_test.go`. Test-side gap, not a dev defect. Post-handoff change (cause: tier-0 convention, no spec change): added `backend/fleet/solve_refusal_test.go` (helper decision order, 6 subtests, passes). Tier 0 coverage now passes. The manifest verify ignores the addition; it is not in the manifest.
2. Tier 0 `Determinism Mirror Map` and the `FMA-contraction` check print "not found" for `fixtures/market/mirror-map.json` and `fixtures/determinism-register.json`, both of which exist and are tracked. Sandbox read failure in my run, not attributable to this change; the same run reports the native and amd64 space/system/galaxy fixture suites passing (so the `stationOrbit` and `stationOrbitSweep` families pass unre-recorded). The orchestrator should re-run tier 0 outside the sandbox.

## Coverage table statuses
All `assertion-red` and `compile-red` rows in `fix-burn-order-geometry-refusals-red-coverage.md` are now green; `already-green` rows stay green. Playwright-deferred: none.

## Remaining for the archive gate
- Task 4.1 e2e repairs and 4.2 comments: e2e-tagged, run only at tier 3.
- Task 1.10 developer half, including the starting-fuel reachability sample naming accounts and homes: runs only at tier 3.
- Tier 2 for the touched packages if the orchestrator brings up the test emulator.
- The journey spec has not been started.

## Manifest re-record (archive gate)
Before the gate: verify reported all 20 files unchanged. The manifest was then re-recorded to 21 files, adding `backend/fleet/solve_refusal_test.go`. Cause: the tier-0 one-test-file-per-source-file convention (finding 1); no existing test changed.
