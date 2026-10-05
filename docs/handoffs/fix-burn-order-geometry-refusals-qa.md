# fix-burn-order-geometry-refusals — QA verify (tiers 0-1 by reading and running; no stack booted)

Built at 7020952. Runs this session (all green): `go test -short -count=1 ./system ./corporations ./fleet` (ok x3), `go vet ./...` (clean), vitest `lib/rejection-copy.test.ts` (21), `FleetActionsPanel` + `GalaxyView` (85 across the two; 92 with the third file matched). No test or code edited. Test-to-scenario mapping is the SDET table `-red-coverage.md`; I re-read the production code each test reaches (`fleet/solve_refusal.go`, `fleet/handler.go:470-482`, `fleet/service.go:720,1348`, `frontend/lib/rejection-copy.ts:59-69`) and judged observability.

Observability judgments: the handler tests run the real Service behind the real handler with the ownership seam, and assert status AND body (byte-equal commit/preview/stop), so a status-only pass is not possible; the trace test asserts one info-level entry with four fields and no error-level entry; the stop/roster frontend tests assert the rendered line and the absence of the raw reason. The reason-text wrong-wiring mutants in the coverage doc cover origin/destination collapse, check-order swaps and wrapped-text serving. The solver was not re-recorded (`backend/space` untouched).

## Matrix (53 scenarios)

### corporation-spawn (26)
| Scenario | Evidence | Verdict |
| --- | --- | --- |
| 16 pre-existing Home Site Selection scenarios (non-mineable, too close, first corp, materialize, exhaust-grow, consecutive wakes, lane-reachable, same account, reserved, concurrent, failed wake, healing reuses, distant frontier, walk cap, finite component, double-spawn) | existing `siteselection_test.go`, `spawn_walk_test.go`, `spawn_healing_test.go`; `corporations` package green with the `lineGraph` fake edited only to add `skeleton`/`seed`/`StarClass:"G"` | PASS (16) |
| Station shell reaching clearance never qualifies | `siteselection_shell_test.go` ShellReachingClearanceNeverQualifies (real walk, fake graph) | PASS |
| Bound equal to clearance excluded, just above qualifies | `station_shell_test.go` TestShellClears_..._EqualityBoundary + one-ulp probes | PASS |
| Outcome fixed for every parent type/ring/class | `station_shell_test.go` literal table + IsALowerBoundOnTheRealShell (real `Park.Position` phase grid) | PASS |
| Decided on derived parent (fails) | DerivedParentFailsExcludesCandidate | PASS |
| Decided on derived parent (passes) | DerivedParentPassesQualifiesCandidate (already-green by nature; value is mutant detection per coverage doc) | PASS (weak alone, backed by its fail twin) |
| Walk continues past failing ring | WalkContinuesPastFailingRing | PASS |
| Only failing candidates -> ErrNoSpawnSite, corpless | PocketOfFailingCandidates... (selection + Spawn over MockDao forbidding writes) | PASS |
| Deterministic with failing candidates present | DeterministicWithFailingCandidatesPresent (4 accounts x 3 repeats, equals pick without failing set) | PASS |
| Home selected after criterion yields no clearance refusal at its station | `station_shell_sweep_test.go` (rocky/gas/ice subjects, ring-0 control must refuse) | PASS at unit level; real-stack sample is task 1.10, see Blocked |
| Corp already homed in failing system keeps its home | TestSpawnHealing_..._KeepsItsHome (MockDao forbids reselection) | PASS |

### fleet-movement (24) — all PASS, evidence in `backend/fleet/solve_refusal_*_test.go`
Destination reason for body standoff inside clearance; preview same status+body; star same destination reason; point at/inside clearance; origin reason with differing text; both-inside gives origin; stop origin; stop lead point; own-host minimum arc (commit/preview identical); own-host long curve commits; short point minimum-arc not clearance; commit absent body 404+reason; preview absent body; unknown/foreign fleet bodyless 404 (owner-baseline subtest proves arrangement); absent outranks origin-inside; origin outranks destination/short curve; four distinct bodies; no fragment crossing nor "not found"; same reason on commit/preview/stop; state and fuel unchanged; recorded once by cause below error; stored host no longer resolves is 5xx (real Service, real table).
- Body-table cycle is still 5xx with error log: PASS (composed, RULING 12). Present target with missing parent is 5xx not 404: PASS (composed, RULING 12; also asserts `errors.Is(err, ErrUnknownBody)` and not `ErrTargetBodyAbsent`). Caveat: the real table cannot hold these faults, so the fault rows prove helper classification plus handler mapping with the call-site `%w` wrap shape. I confirmed that shape matches `service.go:722` and `:1350`. Acceptable under the ruling.

### docked-fleet-actions (3) — all PASS
Stop refused shows the same line as burn (panel origin/destination/live region, roster origin, shared `burnErrorCopy`); each of four refusals own line with no fragment crossing (`rejection-copy.test.ts`); roster stop does not toast raw reason (`GalaxyView.test.tsx`). Needles `origin is at or inside` / `destination is at or inside` / `minimum arc length` / `target body is not present` match the served texts verbatim.

## Summary
**53 PASS (3 of them composed-by-ruling) / 0 FAIL / 0 BLOCKED scenario rows / 0 INSPECTED.**

## Blocked, awaiting the archive gate (not scenario rows)
- Task 1.10 developer half: starting-fuel reachability sample naming accounts and homes (e2e, RULING 13). Task 1.10 is rightly unchecked.
- Task 4.1 e2e repairs (`fuel_spawn_starting_fuel_e2e_test.go`) compile only (`go vet`); not run. Tasks 5.2, 6.1-6.3 unchecked, consistent with tasks.md. I did not re-run `openspec validate` or reconcile.
- Tier 2 for touched packages (89 emulator tests skip under -short), and tier-0 determinism-mirror-map / FMA checks that the SDET could not read in sandbox (integrity finding 2): re-run outside the sandbox.
- No journey spec exists yet; no scenario requires one.

## Tasks.md check
Unchecked set above is exactly the archive-gate set; no checked task contradicts a passing or failing scenario.

## Exploratory pass (by reading)
1. All `space.SolveBurn` callers: only `solveBurnClassified` (orders, preview, stop) and `fuel.go:153` `reachableAtFloor`, which swallows every named space error (unreachable per candidate) and cannot surface a bodyless 500 for clearance/arc. `space.BuildCurve` is reached only through SolveBurn. No unclassified path remains for origin/destination clearance, minimum arc, or absent body id.
2. `respond` has no arm for raw `space.ErrEndpointInsideClearance`/`ErrArcTooShort`, so an unclassified one would hit the 500 default by design (cannot occur from the three routes).
3. Residual player-causable 500 (filed, not in scope): non-finite or huge point target (`docs/handoffs/defect-point-target-extent-unvalidated.md`, inferred not observed). A fleet whose stored host no longer resolves is a 5xx by spec. Not new regressions.
4. Stop surfaces: only `GalaxyView.tsx:324-326` and `FleetActionsPanel.tsx:584-585` call `useStop`; both route `burnErrorCopy(commandErrorReason(e))`. No raw-text surface found. Gap: other consumers of the same 4xx bodies (claude-agent tool results, SpaceCommandPanel preview's no-quote state) still carry or hide the reason; RULING 10 defers the preview state to `followup-explain-withheld-burn-command.md`. Not a failure.
5. Ordering: absent-body then origin then solve is fixed in one helper shared by three routes; reasoning on double-submit: refusals write nothing, so a retry is idempotent (state-unchanged test).

## Spec gaps
- Minor: no scenario for a non-finite/huge point target (filed defect). No scenario pins the 404 body for an absent target on stop (n/a, stop takes no target).

## Verdict
**SHIP** (to the archive gate; tier 2, the tier-0 reruns outside the sandbox, and the e2e items above still must pass there).
