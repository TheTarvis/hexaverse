# fix-burn-order-geometry-refusals — red coverage (SDET)

Red phase, unit and integration only. No Playwright, no tier 3 or 4 was run, no stack booted. Commands are `docs/testing-tiers.md` tier 1 (`go test -short`, `vitest run`).

Status key: `assertion-red` fails today on an assertion; `compile-red` fails to compile today (missing pinned symbols), verified in a scratch copy; `already-green` passes today by nature (reason given); `composed` = "helper + handler, composed" (RULING 12).

Right-reason evidence (scratch copy at `$SCRATCH/repo`, a copy of `backend/` and `fixtures/`, never the live tree): (1) the contract implemented in the scratch copy turns every new Go test, and every existing test in `system`, `corporations` and `fleet`, green; (2) a pass-through stub (today's behaviour with the pinned names present) turns the fleet tests red on `status = 500, want 409/404` and "an error-level entry was written", with no "arrangement no longer holds" anywhere; (3) wrong wirings fail the intended tests (list at the end).

## corporation-spawn (`backend/system`, `backend/corporations`)

| Scenario | Test | Level | Status |
| --- | --- | --- | --- |
| A system whose station shell reaches the star clearance never qualifies | `corporations/siteselection_shell_test.go` TestSiteSelection_Scenario_ShellReachingClearanceNeverQualifies | unit (fake graph, real walk) | assertion-red (picks `sys_1_0`) |
| A bound exactly equal to the clearance radius is excluded and one just above qualifies | `system/station_shell_test.go` TestShellClears_Scenario_EqualityBoundary (+ one-ulp probes, SDET-added) | unit | compile-red (`shellClears`) |
| Outcome fixed for every parent type, ring and star class | `system/station_shell_test.go` TestStationShellClearsStar_Scenario_OutcomeFixedForEveryTypeRingAndClass (hand-typed literal table; 4 rocky-row types, ring 0-4 and 9, 7 classes plus unknown and empty class) and TestStationShellBound_Scenario_IsALowerBoundOnTheRealShell (task 1.2: real `Park.Position` over a phase grid; ring-0 rows reach the clearance) | unit | compile-red |
| Decided on the derived parent, not another body, when that parent fails | `corporations/siteselection_shell_test.go` TestSiteSelection_Scenario_DerivedParentFailsExcludesCandidate | unit, real walk | assertion-red |
| ... when that parent passes | same file TestSiteSelection_Scenario_DerivedParentPassesQualifiesCandidate | unit, real walk | already-green: with no criterion every candidate qualifies; its value is wrong-wiring detection (seed 0 and `Bodies[0]` mutants fail it, scratch) |
| Walk continues past a ring whose only candidates fail (d) | same file TestSiteSelection_Scenario_WalkContinuesPastFailingRing | unit | assertion-red (picks `sys_6_0`) |
| Field of only (d)-failing candidates fails as `ErrNoSpawnSite`, account corpless | same file TestSiteSelection_Scenario_PocketOfFailingCandidatesFailsAsNoSpawnSite (selection subtest; `Spawn` subtest over `MockDao` where any `CreateWithPointer` is an unexpected call, so no corporation, pointer or reservation) | unit | assertion-red (both) |
| Excluding failing candidates keeps the pick deterministic | same file TestSiteSelection_Scenario_DeterministicWithFailingCandidatesPresent (4 fixed accounts, 3 repeats, and the pick equals the same field without the failing candidates) | unit | assertion-red (account `b` picks failing `sys_14_0`) |
| A home selected after this criterion yields no clearance refusal at its station | `system/station_shell_sweep_test.go` TestStationShellSweep_Scenario_NoClearanceRefusalAtItsStation (rocky r1/F, gas r2/B, ice r1/K; ring-0 control must refuse on both sides; also asserts the predicate splits subjects from control) | unit | compile-red |
| A corporation already homed in a failing system keeps its home | `corporations/siteselection_shell_test.go` TestSpawnHealing_Scenario_CorporationHomedInFailingSystemKeepsItsHome (Spawn and GetForAccount paths; `MockDao` forbids `ListLiving`, `ListSpawnClaims`, `CreateWithPointer`; no `EnsureBlocks`) | unit | already-green: healing reuses the recorded home today; guards against (d) leaking into healing (a re-selecting mutant fails it, scratch) |

Task 1.4 arrangement: seed `7001`, id `sys_1_0` (searched; two-body skeleton names `feat-body-1` under 7001 and `feat-body-0` under seed 0), asserted first with "arrangement no longer holds". Task 1.10 fake half: `siteselection_test.go` `lineGraph` gains `skeleton` and `seed` fields and an explicit `StarClass: "G"`; no assertion changed, package green. Developer half of 1.10 is untouched, so 1.10 stays unchecked. The unchanged Home Site Selection scenarios stay covered by the existing `siteselection_test.go`, `spawn_walk_test.go`, `spawn_healing_test.go`.

## fleet-movement (`backend/fleet`, real Service behind the real handler, ownership seam and a `MockDao` with no write path)

| Scenario | Test (file `solve_refusal_*_test.go`) | Status |
| --- | --- | --- |
| Body whose solved standoff point is inside the clearance: destination reason | handler: TestRefusal_Scenario_BodyStandoffPointInsideClearance (sweep-located instant 240000 ms, arrangement asserted first) | compile-red |
| Preview of the same order: same status and byte-identical body | same test, second subtest | compile-red |
| Star: same destination reason as any other | handler: TestRefusal_Scenario_StarAndPointTargetsServeTheDestinationReason (commit and preview) | compile-red |
| Point at or inside the clearance | same test (inside and exactly equal; SDET-added: 0.001 outside is not refused, `TestRefusal_SDETAdded_PointJustOutsideClearanceIsNotRefused`, already-green) | compile-red |
| Own position inside: origin reason, differing text | handler: TestRefusal_Scenario_OriginInsideClearance | compile-red |
| Inside ordering a destination also inside (star): origin reason | same test | compile-red |
| Stop, origin inside: origin reason, state unchanged | stop: TestStop_Scenario_RefusedForOriginAndForLeadPoint | compile-red |
| Stop, lead point inside (1.0 outside, heading at the star): destination reason | same test | compile-red |
| Own host, solved curve below minimum: minimum-arc, commit and preview identical | handler: TestRefusal_Scenario_OwnHostMinimumArc (instant 12000 ms; host radius 60, period 73500 ms) | compile-red |
| Own host, curve long enough: commits | same test (instant 11000 ms, curve length 8.1) | already-green: it commits today; guards an identity refusal (mutant fails it, scratch) |
| Point closer than the minimum arc: minimum-arc reason, not clearance | handler: TestRefusal_Scenario_ShortPointMinimumArc | compile-red |
| Commit naming an absent body: 404 with reason, no burn, no action | handler: TestRefusal_Scenario_AbsentBodyServesAReasonOnCommitAndPreview (two different ids, byte-identical) | compile-red |
| Preview naming an absent body: same reason | same test | compile-red |
| Unknown or foreign fleet: bodyless 404 | handler: TestRefusal_Scenario_UnknownOrForeignFleetStillBodyless404 (four foreign-owned fleets; owner-baseline subtest proves each is arranged to refuse; foreign and corpless requesters; orders, preview and stop where refusable; byte-equal to the nonexistent fleet) | compile-red (owner-baseline subtest red; the matrix itself is already-green, existing seam) |
| Absent body while inside the clearance: absent-body 404 | handler: TestRefusal_Scenario_AbsentBodyOutranksOriginInside | compile-red |
| Origin inside outranks a destination or a short curve | handler: TestRefusal_Scenario_OriginInsideClearance (destination-inside and short-curve cases) | compile-red |
| Four refusals, four different reason bodies | reason: TestRefusalReasons_Scenario_ServedBodiesDistinctAndSameOnEveryRoute (served) and ..._FixedPairwiseDistinctFragments (sentinel texts) | compile-red |
| No reason contains another's fragment, nor `not found` | reason: TestRefusalReasons_Scenario_FixedPairwiseDistinctFragments | compile-red |
| Same refusal on commit, preview and stop: same reason | reason: TestRefusalReasons_Scenario_ServedBodiesDistinctAndSameOnEveryRoute, second subtest | compile-red |
| Every served refusal leaves state and fuel unchanged | trace: TestRefusal_Scenario_EveryServedRefusalLeavesStateAndFuelUnchanged (four separately arranged fleets) | compile-red |
| A served refusal is recorded once by cause below error level | trace: TestRefusal_Scenario_RecordedOnceByCauseBelowErrorLevel (10 cause/route cells: origin and destination on order, preview, stop; minimum-arc and absent-body on order, preview; exactly one entry, level info, four fields, no error-level entry) | compile-red |
| ... and a body-table cycle on the same routes: error-level entry naming no cause | faults: TestFaults_Scenario_BodyTableCycleIsStill5xxWithAnErrorLog_Composed (orders, preview, stop) | compile-red, **composed** |
| Body-table cycle is still a 5xx with an error log | same test | compile-red, **composed** (real table cannot hold a cycle) |
| Present target whose parent is missing is a 5xx, not the absent-body 404 | faults: TestFaults_Scenario_PresentTargetWithMissingParentIs5xx_Composed (also asserts `errors.Is(err, space.ErrUnknownBody)` true and `ErrTargetBodyAbsent` false) | compile-red, **composed** |
| Stored host no longer resolves is still a 5xx | faults: TestFaults_Scenario_StoredHostNoLongerResolvesIs5xx (real Service, real table; orders and preview) | already-green (real flow today; compile-red with the package) |
| Existing `errors.Is` pins stay green (task 2.9) | `star_destination_test.go:40`, `order_replace_and_retarget_test.go:199`, `service_test.go:224`, unedited; sentinel unwrap asserted in reason: TestRefusalSentinels_IdentityAndUnwrapTargets (SDET-added) | already-green |

`handler_test.go` `fakeFleetSvc` gained `orderErr`, `previewErr`, `stopErr` and a `PreviewOrder` method (zero values change no existing test).

## docked-fleet-actions (`frontend`)

| Scenario | Test | Status |
| --- | --- | --- |
| Each of the four refusals displays its own line | `lib/rejection-copy.test.ts` "Scenario: Each of the four refusals displays its own line" (plus the not-found variant) | assertion-red |
| No fragment crossing | same file, "No refusal reason contains another refusal's fragment..." (fragment alone selects its own line) | assertion-red |
| A stop refused for the clearance shows the same line a burn refused for it shows | panel: `FleetActionsPanel.test.tsx` (origin, destination, live region); roster: `GalaxyView.test.tsx` (origin); burn commit: `rejection-copy.test.ts` (same `burnErrorCopy`) | assertion-red |
| A stop refused on the galaxy roster does not toast the raw reason | `GalaxyView.test.tsx` "roster Stop refused for the star clearance" (destination) | assertion-red |

SDET-added: origin and destination share "star-clearance" yet map differently; RULING 11 legacy raw `space:` text no longer maps; case-insensitive and body-extracted reasons; a reasonless stop failure shows the generic line; existing burn lines unchanged (already-green guard). `R.clearance` re-pointed at the destination literal (the cases at `:99` and `:105` pass unchanged).

## Existing-test repair

| Task | File | Status |
| --- | --- | --- |
| 4.1 | `backend/fuel_spawn_starting_fuel_e2e_test.go`: both tests classify a non-200 as unaffordable, geometry refusal (fails naming criterion (d), never a tuning signal; not counted in the retune tally) or other (fails with status and body) | edited, compiles (`go vet .`), not run (e2e, archive gate) |
| 4.2 | `backend/stationkeep_e2e_helpers_test.go:204-220` diagnosis corrected (either endpoint can be guilty; cause is the home site); `backend/fleet_wrong_state_rejection_e2e_test.go:88-95` re-read, gate claim stands, pointer and origin note updated | comments only |

## Playwright, deferred and not automated

- `Playwright, deferred`: none required by a scenario; the archive journey may show a stop refusal toast on both surfaces. Task 4.1's two e2e tests run only at the archive gate.
- The burn-commit surface (`SystemSpaceView`) already routes through `burnErrorCopy`; its half of "same line on every surface" is the lib mapping, with no new component test.
- `reasoned-not-automated`: none. Silent gaps: none.

## Wrong wirings the suite catches (scratch mutants)

(d) always true; `>=` instead of `>`; station orbit radius or insertion standoff left out of the bound; seed 0 into the derivation; parent `Bodies[0]`; healing that re-runs selection; helper mapping `ErrUnknownBody` to absent; origin check before absent check; `respond` serving the wrapped text; an own-host identity refusal; a star identity check; origin and destination collapsed; error-level or wrong-route log. Each failed at least one named test.

## Per-commit gate state at handoff

`go test -short ./...`: `fleet` and `system` fail to build (missing pinned symbols, intended); `corporations` red on five assertions (intended); every other package ok; `go vet .` on the root package ok. `vitest`: three files red (3.1 and 3.3), the rest unchanged; `tsc --noEmit` clean. The `system` sweep tests take about five seconds under `-short`.
