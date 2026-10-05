# fix-burn-order-geometry-refusals — journey record (archive gate)

Outcome: GREEN at both tiers, each run once, tree locked, no rerun.

Journey spec: `frontend/e2e/tests/burn-geometry-refusals-journey.spec.ts` (one spec, one test; existing helpers read-only, no fixture, helper, `wakeNewCorp` or other spec edited).

## Runs
| Tier | Command | Result | Wall |
| --- | --- | --- | --- |
| 4 | `cd frontend && npm run e2e` | 28 passed (setup + 27 specs, including the new journey at 17.4 s), 0 failed, 0 skipped | 410 s (6.6 m reported) |
| 3 | `npm run test:backend:all` | DONE 1979 tests, 1 skipped (`space TestTurnTable_RecordOrRegenerate`, the pre-existing record-or-regenerate guard), 0 failures; timeout banner absent | 1026 s (1010 s in gotestsum) |

Load averages (1/5/15 min): tier 4 start 2.55 9.44 9.91, end 8.08 9.07 9.44; tier 3 start 4.21 7.52 8.81 (waited from 6.07 until under 4, then started at 4.21), end 16.23 10.16 8.96. Other projects' emulators were running; neither run showed a uniform ~22 s failure signature. `backend/emulator.log` `Received SIGTERM` count was 1 before tier 4, after tier 4, before tier 3 and after tier 3 (that single entry predates this gate), so nothing killed an emulator during either run. No process was killed.

## The journey legs (all asserted, all passed)
1. Wake a new corporation (home `sys_0_1`, fleet `fleet_34e68725-1460-4c2a-91fc-247e0b650b10`), one hull, one station body.
2. Deterministic served refusal through the UI: the camera's default centre is the star, so `select-pan-target-point` then Burn names a point inside the clearance. The toast read the pinned destination line ("That destination is too close to the star to fly to."); no raw reason, no `fleet:` text; the fleet did not go under way. An own-host order was not used.
3. Arrival: burn to the home station, "Under way", then "Docked" (sell section visible).
4. Departure from the station's orbit to another body: "Under way", then "Docked".

## Backend log evidence (tier 4, whole run, `frontend/playwright/.auth/backend.log`, 2898 lines)
- Lines containing `endpoint at or inside the star-clearance radius`: **0** (the spec asserts this on its own slice of the log too).
- `fleet: burn solve refusal served` entries: exactly **2**, both level INF, from the journey's leg 2, both `refusalCause=destination-inside-clearance`, `systemId=sys_0_1`, `fleetId=fleet_34e68725-...`: `route=preview` (19:45:57, 409) then `route=order` (19:45:57, 409). The same fleet's later preview and order at 19:45:58 returned 200 (legs 3 onward). No other spec produced a refusal entry.
- Order, preview and stop requests with status 500: none. The only two 500s in the log are `GET /v1/systems/sys_5_5` (19:51:23) and `GET /v1/systems/sys_-6_0` (19:51:57), both `context canceled` interior and lane-gate reads (the browser aborting a read while a jump leg navigated); they are interior reads, not burn routes, and every spec passed. Three ERR lines in total, all `context canceled`.
- Tier 3 output carries no refusal entries or star-clearance lines (Go test logs print only on failure).

## Findings
None. No red, so nothing to attribute against `defect-*.md`; the filed fixture reds (`space-double-submit.spec.ts:267`, `scan-journey.spec.ts:332`, `slice.spec.ts:83`, `space-journey.spec.ts:85`) all passed this run (note for the defect records: they are not red at this commit).

## Starting-fuel reachability sample (task 1.10)
`fuel_spawn_starting_fuel_e2e_test.go` ran inside tier 3 and passed: the flagship `TestSpawn_Scenario_ASeededHullCanReachItsHomeStationOnItsStartingFuel` (one corporation) and `TestSpawn_Scenario_StartingFuelReachabilitySample` (8 fresh accounts, "SDET Sample Corp"), each default order to its home station accepted and affordable, and the repaired classification never reached a geometry-refusal or other-rejection branch. Limit: the test does not log account ids or home system ids and gotestsum prints nothing for passing tests, so I cannot name the accounts and homes it asserted from the run; naming them needs a verbose run, which this gate does not allow.

## Suite budget line
Tier 4: 410 s (28 tests). Tier 3: 1026 s (1979 tests) against its 90 m budget. Both far inside budget; tier 3 grew with this change's new Go tests only at the package level (they skip nothing and run under `-short`).
