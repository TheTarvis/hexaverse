# clear-burn-preview-on-commit: tier 3, run A (SDET delegate 1)

**Result: COULD NOT BE EVALUATED. Contaminated by an overlapping tier 3 on the same emulator project. It also hit the 90m `-timeout` budget. Do not read any red below as a product finding.**

## Command
`npm run test:backend:all` (docs/testing-tiers.md tier 3). Log: `/private/tmp/claude-501/-Users-travis-Projects-hexaverse/9d55a6b8-d206-4d64-9014-7f1fdac0e26d/scratchpad/t3.log` (1169 lines). Timings: `t3.start` / `t3.end` in the same directory.

## Environment before the start
- Before tier 4: `uptime` 13:42, load 4.43 / 8.65 / 9.64. I waited until load was below 4, then began tier 4 at about 13:43 at load 3.51.
- Before tier 3: load 3.68 at 13:55 after the wait.
- The after-tier-4 load was 16.91 (about 13:50).
- The log's first lines say: `[emulators] reusing the complete test set already running (firestore:20242 auth:20241 pubsub:20244)`. Run A therefore attached to an already-running emulator set and did not start its own.
- The second SDET's tier 3 (pid 24831, about 13:55:21) ran against the same emulators. The orchestrator confirmed the overlap.
- The root package's `TestMain` wipes and re-seeds the shared project, so the two runs corrupted each other.

## Times
- Start: 2026-10-04 13:55:21 EDT (epoch 1791136521).
- gotestsum reported `DONE 177 tests, 8 failures in 5462.687s` (about 91 min). The package timeout fired at 1h30m0.5s, which is about 15:26 EDT by the log's own timestamps.
- `t3.end` stamped exit 143 and epoch 1791147220 (16:53:40 EDT). That stamp is the wrapper's exit time, not the test's end. About 87 minutes sit between the panic and the stamp, and I cannot explain them. The machine may have slept, or the wrapper was held. Treat the 5462 s figure as the wall time.
- The run hit the budget (`panic: test timed out after 1h30m0s`, `FAIL hexaverse 5400.541s`). The command's own banner says a timeout is not an assertion failure. I did not raise the budget.

## Counts
- 177 tests ran before the abort and 8 are reported as failures. The abort cut the run off, so there is no full per-package pass tally.
- `grep -c '^ok '` finds 0 passing-package lines because gotestsum prints a summary instead.
- The failure set is `.` (package `hexaverse`) and package `account`. Counts of skips are not available.

## Reds, verbatim
Each red is listed with its request, status and backend sentinel.

1. `TestRefuel_Scenario_AFleetWithARunningScanCanStillRefuel` (11.12s).
   - `fuel_purchase_e2e_test.go:506: setup order to home station: status = 500, burn = {Mode:0 Burn:<nil> Park:<nil> Drift:<nil>}`
   - Request: `POST /v1/fleets/fleet_ffa1cd38-d187-4f3c-bbb2-0175f4951c31/orders`, status 500 (13:58:54).
   - Backend sentinel: `fleet: solving burn: space: endpoint at or inside the star-clearance radius`.
   - This matches the filed signature in defect-station-order-500 (the request, the status and the sentinel all match). It is not one of the spawn starting-fuel tests the brief named. The backend diff against 987ba60 was empty at the start.
2. `TestScanSelfScannerExclusion_Scenario_NoSelfSightingAndSingleCleanSweep` and its two subtests.
   - `scan_self_scanner_exclusion_e2e_test.go:52: POST /v1/corporations: status = 500, body = ` (empty body).
   - The test was still running for 1h14m when the budget expired. Its subtest `scanner_plus_one_other_ship_at_the_host_...` was named by the panic as hung.
   - No star-clearance sentinel is attached to this one. It is most plausibly wipe or contention from the concurrent run, but I did not prove that.
3. `account TestFirestoreDaoImpl_IntegrationFlow/Create_accounts` (60.00s).
   - `dao_test.go:47: Received unexpected error: context deadline exceeded` (`account/dao_test.go:47`).
   - Its parent and the `Get_individual_accounts` subtest failed with it. This is an emulator timeout at 15:26:29, which is consistent with a wedged or overlapped emulator.
4. The package-level `. (1h30m0.542s)` failure is the timeout panic.

None of these touches the burn-preview, command-panel or own-fleets scenarios. I did not diagnose any of them beyond the above.

## Stack death
- `backend/emulator.log` has one `Received SIGTERM` line (line 28). The count was 1 before the run and is 1 after, so it is the pre-existing 2026-10-01 entry and not from this run.
- The wrapper exit code was 143, meaning the wrapper received a SIGTERM. I cannot tell from my evidence who sent it. It could have been the orchestrator's cleanup, or the other delegate's emulator handling.
- I did not check the failure times for a uniform ~22 s signature in the log. The one failing test with a recorded duration of 60.00s is a 60 s context deadline.

## git status --short
- Before tier 3 (13:55): 6 lines. Five were modified files: the three docs/handoffs records, docs/plans/system-hud/chain.md and openspec/changes/clear-burn-preview-on-commit/tasks.md. The sixth was `?? frontend/e2e/tests/committed-selection-journey.spec.ts`.
- After (16:53): only `?? frontend/e2e/tests/committed-selection-journey.spec.ts` remains. HEAD is now `7d67377 docs(handoffs): record the stopped archive gate for clear-burn-preview-on-commit`. Someone else committed during the run. It was not me.
- The spec's mtime is now 1791137964 (it was 1791135678 at the start of my gate, so it is about 38 minutes later). Another delegate edited it after my tier 4 run. I did not.

## Tier 4 facts from my run (for the second SDET's diagnosis)
- Wall time 1791135817 to 1791136233, which is 416 s. Result: 26 passed, 1 failed.
- The failure was `committed-selection-journey.spec.ts:343` at line 408 of the spec, before any journey leg ran. It was the spec's own fixture-precondition guard.
- The message: "FIXTURE PRECONDITION: the longest flight in home sys_-3_0 is 4359 wall ms at scale 5, shorter than the 50000 ms the mid-burn legs need ... the spawn drew a system too compact for this walk." The assertion was `Expected: >= 50000, Received: 4358.6`.
- So none of these legs ran: the keyboard focus leg, the hold across the first own-fleets read, and the release, re-commit, arrival and reload legs. Nothing was recorded for any of them.
- `space-double-submit.spec.ts:267` passed in my run (it is not among the failures).
- The journey-console capture showed 404 and 500 resource loads on `/systems/sys_-12_-3` (404) and `/systems/sys_-12_-4` (500) in one spec's 4-entry capture. I did not attribute them. `update-depth lines: 0` in every capture.
