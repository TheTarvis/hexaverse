# surface-commit-stranding-warning — journey record (archive gate)

Tier 4 then tier 3, once each, tree locked, build at 808420d. Nothing rerun, nothing edited during or after a run.

## Outcome
- Tier 4 (`cd frontend && npm run e2e`): **26 passed, 0 failed**, wall **387 s** (6.3 m). The journey is test 3.
- Tier 3 (`npm run test:backend:all`): **1875 tests, 1 skipped, 1 failure**, wall **959 s** (gotestsum 947.7 s).
- Suite budget line: tier 4 = 387 s, tier 3 = 959 s.

## What the journey walks (`frontend/e2e/tests/commit-stranding-notice-journey.spec.ts`)
Pre-flight (code reading): a fresh spawn is a point park (`fleet.SeedFleet`, `ParkPoint`), never attached to the station, so the station burn is a real non-zero-length order. The one known refusal is the filed intermittent defect-station-order-500; the spec's failure message names it. Spec change: message and header comment only, before the run; target unchanged (the station is the only target guaranteed non-stranding by the backend's own rule).
1. Wake, select the home station, commit a burn. Asserts, keyed on `preview-panel`: no notice before; the real POST `/v1/fleets/:id/orders` is ok and its parsed body has no `strandingWarning` key (observed keys: corporationId,id,own,position,roster,scale,state,systemId,worldTime); row under way; success toast count 1; warning toast count 0; `commit-stranding-notice` count 0 in the panel and on the page. Closes QA BLOCKED item 1 (real-wire omission; Matrix B last row; Matrix C row 2 real-wire half).
2. Cut the drive: notice still 0 in the command panel, Burn enabled, no warning toast; row reads Drifting (corroboration). Closes the cut-drive clause of item 1.
3. `[journey-console]` update-depth hard `afterEach`: 0 update-depth lines (journey entries captured: 2).

## Stranding leg: UNTESTED at tier 4 (FULL-AUTO RULING 17), not passing
Not written. A deterministic stranding commit cannot be arranged without a production/seed change: the warning needs post-debit fuel below the floor-priced reach of every station/gate; spawn fuel is 100 t, fuel is not sellable, burn cost and reach depend on the random system geometry (defect-spawn-system-single-body), a burn-until-it-strands loop is unbounded, and a skip-if-none loop would pass vacuously. Still closed only at tier 1 on a mocked wire (SystemSpaceView.stranding-notice.test.tsx 3.1-3.20): QA item 2's real-wire instants equality, removal on cut drive against real reads, and the reload plus roster-indication leg.

## Reds and attribution
Tier 4: none. (The filed residue red `space-double-submit.spec.ts:267` PASSED this run.)

Tier 3: one failure, **attributed to the filed OPEN defect-station-order-500, not this change**.
- Failing test: `TestSpawn_Scenario_ASeededHullCanReachItsHomeStationOnItsStartingFuel` (backend/fuel_spawn_starting_fuel_e2e_test.go:53).
- Assertion: "the fresh hull's own default (ceiling-priced) burn order to its home station was REJECTED (status = 500) — a fresh corporation must never deadlock at spawn. Granted starting fuel: 100".
- Backend log in the same test: `fleet: solving burn: space: endpoint at or inside the star-clearance radius`, then `POST /v1/fleets/fleet_6c53…/orders 500` (home sys_9_-15).
- Defect's own signature (defect-station-order-500.md, "What happens"): `fleet: solving burn: space: endpoint at or inside the star-clearance radius` / `POST /v1/fleets/{id}/orders -> 500 (bodyless)`, same file's tests are named there (lines 183-196, 315).
- NOTE for the orchestrator: this is the same defect, same file, but a DIFFERENT test from the one the brief named (`…StartingFuelReachabilitySample`, :236), which did NOT fail this run. The brief's attribution rule says a red may be attributed only if it is the same assertion as the filed defect; here the signature and the root cause match exactly while the test name differs, so I attribute it and flag the difference for the orchestrator's call. It touches none of this change's scenarios (frontend-only change; no backend file edited; no command-panel, burn-commit-UI or own-fleets-read assertion).

## Environment record
- Load (1-min) before tier 4: 3.20 (waited for <4; 4.87 at first look); after: 9.72. Before tier 3: 3.43; after: 5.32.
- `backend/emulator.log` "Received SIGTERM" count: 1 before and 1 after both runs (the one entry is from the 2026-10-01 log, not this session). Each tier started its own throwaway emulator via with-test-emulators.sh. No uniform ~22 s failure signature.
- Foreign files (`frontend/app/not-found.tsx`, `frontend/lib/firebase.ts`, `frontend/lib/firebase.emulator-config.test.ts`): mtimes identical before and after each tier (1791126498 / 1791125092 / 1791125092); untouched by me.
- Stack: warped test stack (world scale 5); `.ports.env` / `.ports.json` present.
- Logs: scratchpad t4.log.keep / t3.log.
